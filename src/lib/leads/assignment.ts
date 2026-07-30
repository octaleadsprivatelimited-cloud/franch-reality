import type { City, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

// Round-robin / even-load lead → agent assignment.
//
// Policy (confirmed with the client): each lead goes to the eligible agent currently
// holding the FEWEST active (non-archived) assigned leads, tie-broken by who was
// assigned least recently (never-assigned first), then by id for determinism. This
// self-balances as agents are added/removed or leads are manually reassigned.
//
// Eligibility: active AGENT users whose `cities` include the lead's city AND whose
// assigned areas overlap the lead's preferred localities (agents with NO assigned
// areas cover the whole city). Falls back to all city agents when the area-scoped
// pool is empty or the lead has no known areas, so a lead is never left unassigned
// just because no agent's areas line up.
//
// NOTE: deliberately no `import "server-only"` — this is imported by teleduce/sync.ts,
// which is exercised by the (non-RSC) test runner (same reasoning as lib/audit.ts).

type Db = PrismaClient | Prisma.TransactionClient;

/** Eligible agent ids for a lead (city + area, with a city-only fallback). */
export async function getEligibleAgentIds(
  db: Db,
  city: City,
  localityIds: number[],
): Promise<string[]> {
  const cityWhere: Prisma.UserWhereInput = {
    role: "AGENT",
    isActive: true,
    cities: { has: city },
  };

  if (localityIds.length > 0) {
    const areaScoped = await db.user.findMany({
      where: {
        ...cityWhere,
        OR: [
          { assignedAreas: { none: {} } }, // no areas set → covers the whole city
          { assignedAreas: { some: { id: { in: localityIds } } } },
        ],
      },
      select: { id: true },
    });
    if (areaScoped.length > 0) return areaScoped.map((a) => a.id);
  }

  const cityAgents = await db.user.findMany({ where: cityWhere, select: { id: true } });
  return cityAgents.map((a) => a.id);
}

/** The eligible agent with the fewest active assigned leads (see policy above), or null. */
export async function pickAgentForLead(
  db: Db,
  city: City,
  localityIds: number[],
): Promise<string | null> {
  const agentIds = await getEligibleAgentIds(db, city, localityIds);
  if (agentIds.length === 0) return null;

  const loads = await db.lead.groupBy({
    by: ["assignedAgentId"],
    where: { assignedAgentId: { in: agentIds }, isArchivedInTeleduce: false },
    _count: { _all: true },
    _max: { assignedAt: true },
  });
  const countById = new Map<string, number>();
  const lastById = new Map<string, number>();
  for (const row of loads) {
    if (!row.assignedAgentId) continue;
    countById.set(row.assignedAgentId, row._count._all);
    lastById.set(row.assignedAgentId, row._max.assignedAt ? row._max.assignedAt.getTime() : 0);
  }

  const sorted = [...agentIds].sort((a, b) => {
    const ca = countById.get(a) ?? 0;
    const cb = countById.get(b) ?? 0;
    if (ca !== cb) return ca - cb; // fewest active leads first
    const la = lastById.get(a) ?? 0;
    const lb = lastById.get(b) ?? 0;
    if (la !== lb) return la - lb; // then least-recently assigned (never-assigned first)
    return a < b ? -1 : a > b ? 1 : 0; // then id, for determinism
  });
  return sorted[0];
}

// Distinct advisory-lock key per city (single-arg bigint form of pg_advisory_xact_lock).
function cityLockKey(city: City): number {
  return city === "HYDERABAD" ? 7_412_501 : 7_412_502;
}

/**
 * Assign an agent to a lead ONLY if it is currently unassigned. Two layers of safety:
 *  - a per-city advisory xact lock serialises the load COMPUTATION across concurrent
 *    ingest paths (webhook bursts, cron+webhook overlap, multiple replicas), so each
 *    lead is picked off a consistent committed snapshot instead of a stale one — this
 *    is what keeps the distribution actually even under bursty/real-time traffic;
 *  - the `assignedAgentId: null` guard on the write makes it idempotent for the SAME
 *    lead (a re-ingest can never re-assign).
 * Returns the chosen agent id, or null if already assigned / no eligible agent.
 */
export async function assignLeadIfUnassigned(
  db: Db,
  leadId: string,
  city: City,
  localityIds: number[],
): Promise<string | null> {
  const run = async (tx: Db): Promise<string | null> => {
    // Held until this transaction commits/rolls back — serialises per-city assignment.
    // Cast the void-returning lock call to a supported scalar. Without this,
    // Prisma rejects the result during deserialization and the best-effort sync
    // path silently leaves every ownerless lead unassigned.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${cityLockKey(city)}::bigint) IS NULL`;
    const agentId = await pickAgentForLead(tx, city, localityIds);
    if (!agentId) return null;
    const res = await tx.lead.updateMany({
      where: { id: leadId, assignedAgentId: null, leadOwner: null },
      // Fresh working state for the newly-assigned agent.
      data: {
        assignedAgentId: agentId,
        assignedAt: new Date(),
        assignmentSource: "ROUND_ROBIN",
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    return res.count > 0 ? agentId : null;
  };

  // An advisory XACT lock needs a transaction to ride on. A PrismaClient opens one;
  // a TransactionClient is already inside one, so reuse it.
  if ("$transaction" in db && typeof (db as PrismaClient).$transaction === "function") {
    return (db as PrismaClient).$transaction(run);
  }
  return run(db);
}

/**
 * One-time / on-demand backfill: distribute every currently-unassigned active lead
 * across eligible agents using the same even-load policy. Planned IN MEMORY (a few
 * bulk queries instead of a per-lead round-trip) so it scales to thousands of leads
 * without timing out, then persisted with guarded updateManys. Admin-triggered.
 */
export async function backfillLeadAssignments(
  db: Db = defaultPrisma,
  city?: City,
): Promise<{ assigned: number; skipped: number }> {
  const [leads, agents, loads] = await Promise.all([
    db.lead.findMany({
      where: {
        assignedAgentId: null,
        leadOwner: null,
        isArchivedInTeleduce: false,
        ...(city ? { city } : {}),
      },
      select: { id: true, city: true, preferredLocalities: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.user.findMany({
      where: { role: "AGENT", isActive: true },
      select: { id: true, cities: true, assignedAreas: { select: { id: true } } },
    }),
    db.lead.groupBy({
      by: ["assignedAgentId"],
      where: { assignedAgentId: { not: null }, isArchivedInTeleduce: false },
      _count: { _all: true },
    }),
  ]);

  // Seed in-memory load per agent from current active assignments.
  const load = new Map<string, number>();
  for (const a of agents) load.set(a.id, 0);
  for (const row of loads) {
    if (row.assignedAgentId && load.has(row.assignedAgentId)) {
      load.set(row.assignedAgentId, row._count._all);
    }
  }
  const agentCities = new Map(agents.map((a) => [a.id, new Set<string>(a.cities)]));
  const agentAreas = new Map(agents.map((a) => [a.id, new Set(a.assignedAreas.map((x) => x.id))]));

  function eligible(city: City, localityIds: number[]): string[] {
    const inCity = agents.filter((a) => agentCities.get(a.id)!.has(city)).map((a) => a.id);
    if (localityIds.length === 0) return inCity;
    const scoped = inCity.filter((id) => {
      const areas = agentAreas.get(id)!;
      return areas.size === 0 || localityIds.some((l) => areas.has(l));
    });
    return scoped.length > 0 ? scoped : inCity;
  }

  const plan = new Map<string, string[]>(); // agentId → leadIds
  let skipped = 0;
  for (const lead of leads) {
    const pool = eligible(lead.city, lead.preferredLocalities.map((l) => l.id));
    if (pool.length === 0) {
      skipped++;
      continue;
    }
    pool.sort((a, b) => {
      const la = load.get(a) ?? 0;
      const lb = load.get(b) ?? 0;
      if (la !== lb) return la - lb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const chosen = pool[0];
    load.set(chosen, (load.get(chosen) ?? 0) + 1);
    let bucket = plan.get(chosen);
    if (!bucket) {
      bucket = [];
      plan.set(chosen, bucket);
    }
    bucket.push(lead.id);
  }

  const now = new Date();
  let assigned = 0;
  for (const [agentId, leadIds] of plan) {
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      const res = await db.lead.updateMany({
        where: { id: { in: chunk }, assignedAgentId: null, leadOwner: null },
        data: {
          assignedAgentId: agentId,
          assignedAt: now,
          assignmentSource: "ROUND_ROBIN",
          assignmentStatus: "NEW",
          assignmentNote: null,
        },
      });
      assigned += res.count;
      // Assigning these leads resolves any open agent-return records for them.
      await db.leadUnassignment.updateMany({
        where: { leadId: { in: chunk }, dismissedAt: null },
        data: { dismissedAt: now },
      });
    }
  }
  return { assigned, skipped };
}

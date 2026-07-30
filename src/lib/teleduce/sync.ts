import type { City, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  mapTeleduceCity,
  mapTeleduceUsage,
  mapTeleducePropertyType,
  mapTeleduceBhk,
} from "@/lib/teleduce/mapping";
import { getTeleduceClient, type TeleduceClient, type TeleduceLead } from "@/lib/teleduce/client";
import { writeAudit } from "@/lib/audit";
import { assignLeadIfUnassigned } from "@/lib/leads/assignment";
import {
  buildCorefactorsOwnerIndex,
  normalizeCorefactorsOwner,
  resolveCorefactorsOwnerAgentId,
  type CorefactorsOwnerIndex,
} from "@/lib/leads/corefactors-owner";

type Db = PrismaClient | Prisma.TransactionClient;

interface LocalityIndex {
  byValue: Map<string, { id: number; city: City }[]>;
  byName: Map<string, { id: number; city: City }[]>;
}

function push(map: Map<string, { id: number; city: City }[]>, key: string, v: { id: number; city: City }) {
  const arr = map.get(key);
  if (arr) arr.push(v);
  else map.set(key, [v]);
}

export async function buildLocalityIndex(db: Db): Promise<LocalityIndex> {
  const locs = await db.locality.findMany({
    select: { id: true, city: true, name: true, teleduceAreaOfInterestValue: true },
  });
  const byValue = new Map<string, { id: number; city: City }[]>();
  const byName = new Map<string, { id: number; city: City }[]>();
  for (const l of locs) {
    if (l.teleduceAreaOfInterestValue) {
      push(byValue, l.teleduceAreaOfInterestValue.trim().toLowerCase(), { id: l.id, city: l.city });
    }
    push(byName, l.name.trim().toLowerCase(), { id: l.id, city: l.city });
  }
  return { byValue, byName };
}

function matchLocalities(labels: string[], city: City, index: LocalityIndex): number[] {
  const ids = new Set<number>();
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    const candidates = index.byValue.get(key) ?? index.byName.get(key) ?? [];
    const inCity = candidates.find((c) => c.city === city);
    if (inCity) ids.add(inCity.id);
  }
  return [...ids];
}

export type UpsertOutcome = "created" | "updated" | "skipped";

/** The persisted lead fields needed to render a "new lead" notification. */
export interface LeadNotificationInfo {
  id: string;
  firstName: string;
  lastName: string | null;
  city: City;
  currentStage: string;
}

export interface UpsertResult {
  outcome: UpsertOutcome;
  /** The saved lead (null when skipped as out-of-scope) — used to emit a notification. */
  lead: LeadNotificationInfo | null;
}

/**
 * Build the Notification row for a newly-synced lead. Shared by BOTH the scheduled
 * pull (source "pull") and the real-time webhook (source "webhook") so the two paths
 * write identical notification history entries.
 */
export function leadNotificationData(lead: LeadNotificationInfo, source: "pull" | "webhook") {
  return {
    leadId: lead.id,
    title: "New lead synced",
    body: `${lead.firstName}${lead.lastName ? " " + lead.lastName : ""} · ${lead.city} · ${lead.currentStage}`,
    source,
  };
}

/**
 * Map a single Teleduce lead onto our Lead model and upsert it idempotently by
 * teleduceLeadId. Returns outcome "skipped" (lead null) when the lead's city is out
 * of scope (not Hyderabad/Chennai); otherwise returns the saved lead so the caller
 * can emit a "new lead synced" notification. Exported so the seed/webhook reuse the
 * exact same mapping.
 */
export async function upsertTeleduceLead(
  db: Db,
  tlead: TeleduceLead,
  index: LocalityIndex,
  runStartedAt: Date,
  ownerIndex: CorefactorsOwnerIndex,
  /**
   * Auto-assign a brand-new lead to an agent (even-load round-robin). Default true for
   * steady-state cron + real-time webhook. Set FALSE for a bulk backfill / purge-and-
   * bulk reload/seed: every historical lead reads as
   * "created", so per-lead assignment would serialise thousands of leads on the per-city
   * lock — those are distributed in one efficient pass via backfillLeadAssignments instead.
   */
  autoAssign = true,
  /** Teleduce ids an admin permanently deleted — never re-create these. */
  suppressedIds?: Set<string>,
): Promise<UpsertResult> {
  if (!tlead.teleduceLeadId) {
    // Defensive: a row with no resolvable id would otherwise upsert into a single
    // ""-keyed Lead, silently merging distinct leads. Fail it (which also
    // suppresses the archive pass) so a wrong id-field shape surfaces loudly
    // rather than corrupting data.
    throw new Error("Teleduce lead row has no id — cannot map (confirm id field in discovery)");
  }
  if (suppressedIds?.has(tlead.teleduceLeadId)) {
    // Permanently deleted by an admin — skip so the pull/webhook never resurrect it.
    return { outcome: "skipped", lead: null };
  }
  const city = mapTeleduceCity(tlead.city);
  if (!city) return { outcome: "skipped", lead: null }; // out of scope (only HYD/CHN)

  const usage = mapTeleduceUsage(tlead.leadType);
  const transactionTypePref = usage?.transactionType ?? null;

  const pt = mapTeleducePropertyType(tlead.propertyType);
  const propertyTypePref = pt ? [pt.propertyType] : [];

  const bhkPref = [
    ...new Set(
      tlead.bedrooms
        .map((b) => mapTeleduceBhk(b))
        .filter((n): n is number => n != null && n > 0),
    ),
  ];

  // Store the Corefactors budget VERBATIM as the ceiling (budgetMax). We never
  // fabricate a lower bound or round the value (per the data-fidelity rule). The
  // matching engine treats budgetMax as the upper bound (±10% tolerance).
  const budgetMin: number | null = null;
  const budgetMax: number | null =
    tlead.budget != null && tlead.budget > 0 ? tlead.budget : null;

  const localityIds = matchLocalities(tlead.areaOfInterest, city, index);
  const normalizedOwner = normalizeCorefactorsOwner(tlead.leadOwner);
  const corefactorsOwner = normalizedOwner ? tlead.leadOwner?.trim() ?? null : null;

  const base = {
    city,
    firstName: tlead.firstName?.trim() || "Unknown",
    lastName: tlead.lastName ?? null,
    mobile: tlead.mobile ?? null,
    email: tlead.email ?? null,
    budgetMin,
    budgetMax,
    transactionTypePref,
    propertyTypePref,
    bhkPref,
    currentStage: tlead.stageDisplay?.trim() || "Not yet contacted",
    teleduceStageId: tlead.stageId ?? null,
    leadSource: tlead.leadSource ?? null,
    leadOwner: corefactorsOwner,
    rawPayload: tlead.raw === undefined ? undefined : (tlead.raw as Prisma.InputJsonValue),
    isArchivedInTeleduce: false,
    lastSyncedAt: new Date(),
  };

  const saved = await db.lead.upsert({
    where: { teleduceLeadId: tlead.teleduceLeadId },
    create: {
      teleduceLeadId: tlead.teleduceLeadId,
      ...base,
      preferredLocalities: { connect: localityIds.map((id) => ({ id })) },
    },
    update: {
      ...base,
      preferredLocalities: { set: localityIds.map((id) => ({ id })) },
    },
    select: {
      id: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      city: true,
      currentStage: true,
      assignedAgentId: true,
    },
  });

  // Created vs updated without a second query: a row inserted during this run has
  // createdAt >= the run's start (both from the DB clock, so no skew).
  const outcome: UpsertOutcome = saved.createdAt >= runStartedAt ? "created" : "updated";

  // Corefactors ownership is authoritative. A populated upstream owner is mirrored
  // when it resolves to one active, city-compatible agent. If it does not resolve,
  // leave the lead internally unassigned and visible as an account mismatch rather
  // than routing it to an unrelated agent.
  const corefactorsAgentId = resolveCorefactorsOwnerAgentId(
    corefactorsOwner,
    city,
    ownerIndex,
  );
  let becameLocallyUnassigned = saved.assignedAgentId == null;
  if (corefactorsOwner && corefactorsAgentId) {
    await db.lead.updateMany({
      where: {
        id: saved.id,
        OR: [
          { assignedAgentId: null },
          { assignedAgentId: { not: corefactorsAgentId } },
          { assignmentSource: null },
          { assignmentSource: { not: "COFACTORS" } },
        ],
      },
      data: {
        assignedAgentId: corefactorsAgentId,
        assignedAt: new Date(),
        assignmentSource: "COFACTORS",
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    becameLocallyUnassigned = false;
  } else if (corefactorsOwner) {
    await db.lead.updateMany({
      where: {
        id: saved.id,
        OR: [{ assignedAgentId: { not: null } }, { assignmentSource: { not: null } }],
      },
      data: {
        assignedAgentId: null,
        assignedAt: null,
        assignmentSource: null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    becameLocallyUnassigned = true;
  } else {
    // If Corefactors removed its owner, release only the assignment that came from
    // Corefactors. Existing local/manual assignments remain intentional.
    const released = await db.lead.updateMany({
      where: { id: saved.id, assignmentSource: "COFACTORS" },
      data: {
        assignedAgentId: null,
        assignedAt: null,
        assignmentSource: null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    becameLocallyUnassigned = saved.assignedAgentId == null || released.count > 0;
  }

  // Only genuinely ownerless Corefactors leads enter the even-load round robin.
  // Best-effort: assignment must never fail or slow-fail lead ingestion.
  if (autoAssign && !corefactorsOwner && becameLocallyUnassigned) {
    try {
      await assignLeadIfUnassigned(db, saved.id, city, localityIds);
    } catch {
      /* a lead is still ingested even if it can't be assigned right now */
    }
  }

  return {
    outcome,
    lead: {
      id: saved.id,
      firstName: saved.firstName,
      lastName: saved.lastName,
      city: saved.city,
      currentStage: saved.currentStage,
    },
  };
}

export interface PullSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  archived: number;
  failed: number;
  mode: "live" | "mock";
}

/**
 * Read leads from Teleduce and reconcile them into our DB: idempotent upsert by
 * teleduceLeadId, then soft-archive any previously-synced lead that no longer
 * appears upstream (only on a clean, fully-successful pull). Wrapped in a SyncLog
 * so the dashboard sync-health tile reflects the last run. Teleduce stays the
 * source of truth — we only read.
 */
export async function runTeleducePull(
  opts: {
    prisma?: PrismaClient;
    client?: TeleduceClient;
    /**
     * Optional WHERE fragment that confines soft-archive reconciliation (both the
     * retain-ratio count and the archive update) to a subset of leads. Omit for
     * the normal full reconcile. Used to scope reconciliation (e.g. to a single
     * city, or to a test's own ITEST- leads so it never touches real data).
     */
    archiveScope?: Prisma.LeadWhereInput;
    /**
     * Emit a "new lead synced" notification per newly-created lead (default true, for
     * the steady-state 30-min cron + real-time parity). Set FALSE for a bulk backfill
     * or purge-and-reload where every
     * historical lead reads as "created" — those are not real-time alerts and would
     * otherwise flood the notification history / nav badge.
     */
    emitNotifications?: boolean;
    /**
     * Auto-assign newly-created leads to agents (default true). Set FALSE for a bulk
     * backfill / reload where every lead reads as "created" — use the admin "Distribute"
     * action (backfillLeadAssignments) to assign those in one efficient pass instead.
     */
    autoAssign?: boolean;
  } = {},
): Promise<PullSummary> {
  const db = opts.prisma ?? defaultPrisma;
  const client = opts.client ?? getTeleduceClient();
  const archiveScope = opts.archiveScope ?? {};
  const emitNotifications = opts.emitNotifications ?? true;
  const autoAssign = opts.autoAssign ?? true;

  const sync = await db.syncLog.create({
    data: { syncType: "TELEDUCE_PULL", status: "RUNNING" },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let archived = 0;
  let failed = 0;
  let notified = 0;
  let archiveSkipped = false;

  // Real-time "new lead" notifications are capped per run so a bulk backfill or
  // reload — seed.ts can drive the full historical
  // Corefactors set through this pull, which marks every lead "created" — cannot flood
  // the notification history and the nav unread badge with thousands of rows. A normal
  // 30-min tick has far fewer than this many genuinely-new leads, so all of them still
  // notify; only a mass backfill is bounded (and the overflow is recorded, not silent).
  const MAX_PULL_NOTIFICATIONS = 50;

  try {
    const [index, ownerIndex] = await Promise.all([
      buildLocalityIndex(db),
      buildCorefactorsOwnerIndex(db),
    ]);
    // Ids an admin permanently deleted — loaded once so the loop never re-creates them.
    const suppressed = new Set(
      (await db.deletedTeleduceLead.findMany({ select: { teleduceLeadId: true } })).map(
        (r) => r.teleduceLeadId,
      ),
    );
    // Full enumeration each run (deliberate: a complete set is required to detect
    // disappeared leads for soft-archive; at this scale it's cheap). The adapter
    // accepts an updatedSince watermark for a future incremental optimisation, but
    // we intentionally do NOT pass one here so archive reconciliation stays correct.
    const leads = await client.listLeads();
    const seen = new Set<string>();
    // Capped sample of the NEW leads this run, for a human-readable audit entry
    // ("Synced N new leads from Corefactors" + their name & area).
    const newLeads: { name: string; location: string }[] = [];

    for (const tlead of leads) {
      let result: Awaited<ReturnType<typeof upsertTeleduceLead>>;
      try {
        result = await upsertTeleduceLead(
          db,
          tlead,
          index,
          sync.startedAt,
          ownerIndex,
          autoAssign,
          suppressed,
        );
      } catch {
        failed++;
        continue;
      }
      const { outcome, lead } = result;
      if (outcome === "skipped") {
        skipped++;
        continue;
      }
      const alreadySeenThisRun = seen.has(tlead.teleduceLeadId);
      seen.add(tlead.teleduceLeadId);
      if (alreadySeenThisRun) {
        // Same teleduceLeadId appeared twice in one pull (e.g. a lead shifting across a
        // page boundary during pagination). The row is already handled; this repeat
        // upsert only re-updated it — count it as updated so we never double-count
        // "created" or emit a duplicate notification for the same lead.
        updated++;
      } else if (outcome === "created") {
        created++;
        if (newLeads.length < 25) {
          newLeads.push({
            name: [tlead.firstName, tlead.lastName].filter(Boolean).join(" ").trim() || "Unknown",
            location: tlead.areaOfInterest[0] ?? tlead.city ?? "—",
          });
        }
        // Record a notification for each new lead so cron-pulled leads land in the
        // notification history (parity with the real-time webhook), capped per run to
        // survive a bulk backfill. Best-effort: a notification failure must never fail
        // the sync or suppress the archive pass.
        if (emitNotifications && lead && notified < MAX_PULL_NOTIFICATIONS) {
          try {
            await db.notification.create({ data: leadNotificationData(lead, "pull") });
            notified++;
          } catch {
            /* non-critical — never break the sync on a notification write */
          }
        }
      } else {
        updated++;
      }
    }

    // Close the "resurrection race": an admin may have permanently deleted (and
    // suppressed) a lead AFTER we snapshotted `suppressed` above, so a concurrent
    // create in this same run could have re-inserted it. Purge any lead we touched
    // this run whose id is NOW suppressed, so a permanent delete stays permanent.
    const suppressedNow = new Set(
      (await db.deletedTeleduceLead.findMany({ select: { teleduceLeadId: true } })).map(
        (r) => r.teleduceLeadId,
      ),
    );
    const resurrected = [...seen].filter((id) => suppressedNow.has(id));
    if (resurrected.length) {
      await db.lead.deleteMany({ where: { teleduceLeadId: { in: resurrected } } });
    }

    // Soft-archive disappeared leads — but ONLY on a clean pull (failed === 0) AND
    // only if the pulled set is a plausible fraction of the current live set, so a
    // silently truncated upstream response can never mass-archive real leads.
    if (failed === 0 && seen.size > 0) {
      const activeCount = await db.lead.count({
        where: { AND: [{ teleduceLeadId: { not: null }, isArchivedInTeleduce: false }, archiveScope] },
      });
      const MIN_RETAIN_RATIO = 0.5;
      if (activeCount === 0 || seen.size >= activeCount * MIN_RETAIN_RATIO) {
        const arch = await db.lead.updateMany({
          where: {
            AND: [
              { teleduceLeadId: { not: null, notIn: [...seen] }, isArchivedInTeleduce: false },
              archiveScope,
            ],
          },
          data: { isArchivedInTeleduce: true },
        });
        archived = arch.count;
        if (archived > 0) {
          // Audit the archival because it is a real CRM-driven state change.
          await writeAudit(
            { userId: null, action: "Leads archived from Teleduce", entityType: "Lead", after: { count: archived } },
            db,
          );
        }
      } else {
        // Pulled set implausibly small vs live count → suspect truncation; skip.
        archiveSkipped = true;
      }
    }

    const status = failed > 0 || archiveSkipped ? "PARTIAL" : "SUCCESS";
    await db.syncLog.update({
      where: { id: sync.id },
      data: {
        status,
        finishedAt: new Date(),
        recordsProcessed: created + updated,
        recordsFailed: failed,
        message: `Pulled ${leads.length} lead(s) [${client.mode}] — created ${created}, updated ${updated}, skipped ${skipped}, archived ${archived}, failed ${failed}${created > notified ? ` (notifications capped at ${MAX_PULL_NOTIFICATIONS}; ${created - notified} new lead(s) not individually notified)` : ""}${archiveSkipped ? " (archive skipped — pulled set implausibly small)" : ""}`,
      },
    });

    // Audit the run outcome so sync-driven changes are visible in the trail.
    if (created > 0 || updated > 0 || archived > 0 || failed > 0) {
      await writeAudit(
        {
          userId: null,
          action: "Teleduce sync completed",
          entityType: "Sync",
          entityId: sync.id,
          after: { mode: client.mode, status, created, updated, skipped, archived, failed, notified, newLeads },
        },
        db,
      );
    }

    // PII retention: drop the raw Corefactors payload for leads not refreshed in
    // 30 days (the mapped fields + rawPayload of active leads remain).
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.lead.updateMany({
      where: { lastSyncedAt: { lt: cutoff } },
      data: { rawPayload: Prisma.DbNull },
    });
    // Sweep abandoned import-staging batches (committed ones self-delete).
    await db.importBatch.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    // Notification history retention: keep the last 90 days; anything older is
    // deleted automatically. Runs on every pull tick (every 30 min), so no separate
    // cron is needed. Covers notifications from BOTH the pull and the webhook.
    // Best-effort: this housekeeping runs AFTER the SyncLog is closed SUCCESS, so a
    // hiccup here must not flip an otherwise-successful reconcile to FAILED/rethrow.
    try {
      await db.notification.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      });
    } catch {
      /* retention is housekeeping — never fail a completed sync on it */
    }

    return { total: leads.length, created, updated, skipped, archived, failed, mode: client.mode };
  } catch (e) {
    await db.syncLog.update({
      where: { id: sync.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        message: e instanceof Error ? e.message : "Unknown sync error",
        errorDetails: { error: e instanceof Error ? e.message : String(e) } as Prisma.InputJsonValue,
      },
    });
    throw e;
  }
}

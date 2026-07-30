import "server-only";
import type { City, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth-helpers";
import type { LeadFilter } from "@/lib/validation/lead";
import { LEAD_WINDOW_MS, type LeadSort } from "@/lib/lead-filters";
import {
  ACTIVE_STAGE_DISPLAYS as ACTIVE_STAGES,
  WON_STAGE_DISPLAYS as WON_STAGES,
  LOST_STAGE_DISPLAYS as LOST_STAGES,
} from "@/lib/teleduce/mapping";

export const LEADS_PAGE_SIZE = 12;

function scopeCities(user: SessionUser): City[] | undefined {
  return user.role === "ADMIN" ? undefined : user.cities;
}

// Map a sort choice to a Prisma orderBy. A unique `id` tiebreaker keeps paging
// deterministic when many leads share a timestamp (a bulk pull stamps them together).
// Nullable columns sort nulls last so "no budget / never synced" never floats to the top.
function orderByForLeadSort(sort: LeadSort): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "synced":
      return [{ lastSyncedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    // BOTH budget sorts use budgetMax. budgetMin is NULL for every lead — the
    // Teleduce sync stores the single Corefactors figure as the ceiling and
    // deliberately never fabricates a lower bound (lib/teleduce/sync.ts). Sorting on
    // budgetMin would tie every row and silently collapse to the id tiebreaker.
    case "budget_desc":
      return [{ budgetMax: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    case "budget_asc":
      return [{ budgetMax: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "name_asc":
      return [{ firstName: "asc" }, { lastName: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "name_desc":
      return [{ firstName: "desc" }, { lastName: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    case "stage":
      return [{ currentStage: "asc" }, { id: "asc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

/** The Prisma `where` for the leads list — shared by the list, count, bulk delete, and
 *  backup export so all operate on exactly the same filtered set. */
export function buildLeadWhere(user: SessionUser, filter: LeadFilter): Prisma.LeadWhereInput {
  const cities = scopeCities(user);
  const where: Prisma.LeadWhereInput = {};
  // Every extra predicate goes in AND[] so nothing clobbers anything else
  // (the free-text search is itself an OR block).
  const and: Prisma.LeadWhereInput[] = [];

  // Archived = disappeared from Teleduce. Kept for history, hidden by default.
  if (filter.archived === "exclude") where.isArchivedInTeleduce = false;
  else if (filter.archived === "only") where.isArchivedInTeleduce = true;
  // "include" → no constraint

  if (cities) where.city = { in: cities };
  if (filter.city) {
    if (cities && !cities.includes(filter.city)) {
      where.city = { in: [] }; // agent asked for a city they can't see → empty
    } else {
      where.city = filter.city;
    }
  }

  if (filter.transactionType) where.transactionTypePref = filter.transactionType;

  if (filter.stage) {
    where.currentStage = filter.stage;
  } else if (filter.activity === "active") {
    where.currentStage = { in: ACTIVE_STAGES };
  } else if (filter.activity === "won") {
    where.currentStage = { in: WON_STAGES };
  } else if (filter.activity === "lost") {
    where.currentStage = { in: LOST_STAGES };
  } // "all" → no stage constraint

  // Requirement facets (array columns → hasSome; preferred areas → relation).
  if (filter.propertyType?.length) where.propertyTypePref = { hasSome: filter.propertyType };
  if (filter.bhk?.length) where.bhkPref = { hasSome: filter.bhk };
  if (filter.localityId?.length) {
    where.preferredLocalities = { some: { id: { in: filter.localityId } } };
  }

  if (filter.source) where.leadSource = filter.source;
  if (filter.owner) where.leadOwner = filter.owner;
  // Assigned-agent filter is an admin-only facet (agents are already city-scoped).
  if (user.role === "ADMIN") {
    if (filter.assignedAgentId === "__unassigned__") where.assignedAgentId = null;
    else if (filter.assignedAgentId) where.assignedAgentId = filter.assignedAgentId;
  }

  // A lead's budget is a single figure: the sync stores the Corefactors budget as the
  // CEILING (budgetMax) and never fabricates a lower bound, so budgetMin is NULL for
  // every lead. Both bounds therefore filter budgetMax — "budget between X and Y".
  // Leads with no known budget are excluded when a bound is set (unknown ≠ any).
  if (filter.budgetMinInr != null) and.push({ budgetMax: { gte: filter.budgetMinInr } });
  if (filter.budgetMaxInr != null) and.push({ budgetMax: { lte: filter.budgetMaxInr } });

  // "Pulled in the last 30 min / 1 hour / …" against the chosen timestamp.
  if (filter.within) {
    const since = new Date(Date.now() - LEAD_WINDOW_MS[filter.within]);
    if (filter.withinField === "synced") and.push({ lastSyncedAt: { gte: since } });
    else and.push({ createdAt: { gte: since } });
  }

  // Scope to live properties so this agrees with getLeadById / the detail page, which
  // hide matches on soft-deleted properties. Otherwise a lead whose only matches point
  // at deleted properties shows as "has matches" but its detail page shows none.
  if (filter.matched === "yes") where.matches = { some: { property: { deletedAt: null } } };
  else if (filter.matched === "no") where.matches = { none: { property: { deletedAt: null } } };

  if (filter.contact === "mobile") and.push({ NOT: { mobile: null } });
  else if (filter.contact === "email") and.push({ NOT: { email: null } });

  if (filter.search) {
    const s = filter.search;
    and.push({
      OR: [
        { firstName: { contains: s, mode: "insensitive" } },
        { lastName: { contains: s, mode: "insensitive" } },
        { mobile: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
        { teleduceLeadId: { contains: s, mode: "insensitive" } },
        { leadSource: { contains: s, mode: "insensitive" } },
        { leadOwner: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  if (and.length) where.AND = and;

  return where;
}

export async function listLeads(user: SessionUser, filter: LeadFilter) {
  const where = buildLeadWhere(user, filter);

  // Count first so the page can be clamped into range: a stale/bookmarked ?page=99 on a
  // 3-page result would otherwise render the "no leads match" empty state (and a deep
  // OFFSET) even though leads exist.
  const total = await prisma.lead.count({ where });
  const pageCount = Math.ceil(total / LEADS_PAGE_SIZE);
  const page = Math.min(Math.max(1, filter.page || 1), Math.max(1, pageCount));

  const items = await prisma.lead.findMany({
    where,
    include: {
      preferredLocalities: { select: { id: true, name: true } },
      assignedAgent: { select: { id: true, fullName: true } },
    },
    orderBy: orderByForLeadSort(filter.sort),
    skip: (page - 1) * LEADS_PAGE_SIZE,
    take: LEADS_PAGE_SIZE,
  });

  return { items, total, page, pageSize: LEADS_PAGE_SIZE, pageCount };
}

/** Distinct lead sources / owners to populate the filter dropdowns, scoped to the user's
 *  cities intersected with the currently-selected city (so the options can actually match). */
export async function getLeadFacets(user: SessionUser, selectedCity?: City) {
  const cities = scopeCities(user);
  const base: Prisma.LeadWhereInput = {};
  if (cities) base.city = { in: cities };
  if (selectedCity && (!cities || cities.includes(selectedCity))) base.city = selectedCity;

  const [sources, owners] = await Promise.all([
    prisma.lead.findMany({
      where: { ...base, NOT: { leadSource: null } },
      select: { leadSource: true },
      distinct: ["leadSource"],
      orderBy: { leadSource: "asc" },
    }),
    prisma.lead.findMany({
      where: { ...base, NOT: { leadOwner: null } },
      select: { leadOwner: true },
      distinct: ["leadOwner"],
      orderBy: { leadOwner: "asc" },
    }),
  ]);

  return {
    sources: sources.map((s) => s.leadSource).filter((s): s is string => Boolean(s)),
    owners: owners.map((o) => o.leadOwner).filter((o): o is string => Boolean(o)),
  };
}

/** Active agents that can be assigned leads (for the reassign dropdown / filter). */
export async function listAssignableAgents() {
  return prisma.user.findMany({
    where: { role: "AGENT", isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, cities: true },
  });
}

export interface AgentLoad {
  id: string;
  fullName: string;
  email: string;
  cities: City[];
  isActive: boolean;
  activeAssigned: number;
  localAssigned: number;
  lastAssignedAt: Date | null;
}

/** Per-agent active-assignment counts + the count of currently-unassigned active leads.
 *  Powers the admin "Lead assignments" console. Optionally scoped to a single city
 *  (agents covering that city; lead counts limited to that city). */
export async function getAgentLoadSummary(city?: City): Promise<{
  agents: AgentLoad[];
  unassignedActive: number;
  corefactorsUnlinked: number;
  unlinkedOwners: { owner: string; count: number }[];
  assignedActive: number;
}> {
  const leadScope: Prisma.LeadWhereInput = city
    ? { isArchivedInTeleduce: false, city }
    : { isArchivedInTeleduce: false };
  const [agents, loads, unassignedActive, unlinkedOwnerRows] = await Promise.all([
    prisma.user.findMany({
      where: city ? { role: "AGENT", cities: { has: city } } : { role: "AGENT" },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      select: { id: true, email: true, fullName: true, cities: true, isActive: true },
    }),
    prisma.lead.groupBy({
      by: ["assignedAgentId", "assignmentSource"],
      where: { assignedAgentId: { not: null }, ...leadScope },
      _count: { _all: true },
      _max: { assignedAt: true },
    }),
    // Only ownerless Corefactors leads are eligible for the local round robin.
    prisma.lead.count({
      where: { assignedAgentId: null, leadOwner: null, ...leadScope },
    }),
    // A populated Corefactors owner with no linked internal agent is a reconciliation
    // issue, not a round-robin candidate.
    prisma.lead.groupBy({
      by: ["leadOwner"],
      where: {
        assignedAgentId: null,
        NOT: { leadOwner: null },
        ...leadScope,
      },
      _count: { _all: true },
    }),
  ]);

  const countById = new Map<string, number>();
  const localCountById = new Map<string, number>();
  const lastById = new Map<string, Date | null>();
  for (const row of loads) {
    if (!row.assignedAgentId) continue;
    countById.set(
      row.assignedAgentId,
      (countById.get(row.assignedAgentId) ?? 0) + row._count._all,
    );
    if (row.assignmentSource !== "COFACTORS") {
      localCountById.set(
        row.assignedAgentId,
        (localCountById.get(row.assignedAgentId) ?? 0) + row._count._all,
      );
    }
    const previousLast = lastById.get(row.assignedAgentId);
    const rowLast = row._max.assignedAt ?? null;
    if (!previousLast || (rowLast && rowLast > previousLast)) {
      lastById.set(row.assignedAgentId, rowLast);
    }
  }
  // Exact total of assigned active leads in scope — counts EVERY assigned lead,
  // including any assigned to an agent no longer in the (city-filtered) agent list,
  // so the KPI can never undercount. (Per-agent bars still show listed agents only.)
  const assignedActive = loads.reduce((n, r) => n + r._count._all, 0);
  const unlinkedOwners = unlinkedOwnerRows
    .filter((row): row is typeof row & { leadOwner: string } => Boolean(row.leadOwner))
    .map((row) => ({ owner: row.leadOwner, count: row._count._all }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
  const corefactorsUnlinked = unlinkedOwners.reduce((sum, row) => sum + row.count, 0);

  return {
    agents: agents.map((a) => ({
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      cities: a.cities,
      isActive: a.isActive,
      activeAssigned: countById.get(a.id) ?? 0,
      localAssigned: localCountById.get(a.id) ?? 0,
      lastAssignedAt: lastById.get(a.id) ?? null,
    })),
    unassignedActive,
    corefactorsUnlinked,
    unlinkedOwners,
    assignedActive,
  };
}

/** Currently-unassigned active leads for the admin queue (inline quick-assign). Capped. */
export async function listUnassignedLeads(city?: City, limit = 50) {
  return prisma.lead.findMany({
    where: {
      assignedAgentId: null,
      leadOwner: null,
      isArchivedInTeleduce: false,
      ...(city ? { city } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      city: true,
      currentStage: true,
      createdAt: true,
      transactionTypePref: true,
      bhkPref: true,
      propertyTypePref: true,
      preferredLocalities: { select: { name: true } },
    },
  });
}

/** All active leads currently assigned to one agent — powers the agent "My assignments" view. */
export async function listAgentAssignments(agentId: string) {
  return prisma.lead.findMany({
    where: { assignedAgentId: agentId, isArchivedInTeleduce: false },
    orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
    include: { preferredLocalities: { select: { id: true, name: true } } },
  });
}

/** Agent-returned leads awaiting admin action: not dismissed AND still unassigned. The
 *  latest open record per lead (distinct) so a re-returned lead shows once. City-scopable. */
export async function listOpenUnassignments(city?: City) {
  return prisma.leadUnassignment.findMany({
    where: {
      dismissedAt: null,
      lead: {
        assignedAgentId: null,
        leadOwner: null,
        isArchivedInTeleduce: false,
        ...(city ? { city } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["leadId"],
    include: {
      agent: { select: { id: true, fullName: true } },
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          city: true,
          currentStage: true,
          transactionTypePref: true,
          bhkPref: true,
          propertyTypePref: true,
          preferredLocalities: { select: { name: true } },
        },
      },
    },
  });
}

export async function getLeadById(user: SessionUser, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id },
    include: {
      assignedAgent: { select: { id: true, fullName: true } },
      preferredLocalities: { orderBy: { name: "asc" } },
      matches: {
        // Exclude matches whose property has been soft-deleted (consistent
        // soft-delete across read paths).
        where: { property: { deletedAt: null } },
        include: {
          property: { include: { locality: true } },
          actionedBy: { select: { fullName: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!lead) return null;
  if (user.role === "AGENT" && !user.cities.includes(lead.city)) return null;
  return lead;
}

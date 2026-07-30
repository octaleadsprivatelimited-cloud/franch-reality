import "server-only";
import type { MatchStatus, Prisma, WritebackStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, type SessionUser } from "@/lib/auth-helpers";
import { ACTIVE_STAGE_DISPLAYS } from "@/lib/teleduce/mapping";
import type {
  LeadMatchFilterInput,
  ResolvedLeadMatchFilters,
} from "@/lib/match-filters";
import {
  BUDGET_TOLERANCE,
  bandLabel,
  describeMatch,
  evaluateMatch,
  matchLeadToProperties,
  type CriteriaSnapshot,
  type MatchableLead,
  type MatchableProperty,
  type MatchResult,
} from "@/lib/matching";

// Safety ceiling on candidates loaded into memory (the SQL pre-filters below keep
// the real set far smaller; this only guards against a pathological data shape).
const CANDIDATE_CAP = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Matching database layer. Bridges the pure engine (src/lib/matching.ts) to
// Prisma and fetches candidates with a SQL hard-filter pre-pass,
// runs the banded engine, and merges any persisted Match records so the UI can
// show the current status (Shortlisted / Shared / Closed) and writeback state.
// Bi-directional: lead → properties AND
// property → leads, using the same algorithm with roles inverted.
// ─────────────────────────────────────────────────────────────────────────────

export type LeadWithLocalities = Prisma.LeadGetPayload<{
  include: { preferredLocalities: true };
}>;
export type PropertyWithLocality = Prisma.PropertyGetPayload<{
  include: { locality: true };
}>;
type MatchWithActor = Prisma.MatchGetPayload<{
  include: { actionedBy: { select: { fullName: true } } };
}>;

/**
 * A lead is "matchable" (eligible for live, both-direction matching) iff it is
 * still present in the CRM (not soft-archived) AND at an active pipeline stage.
 * Used to keep lead→properties and property→leads symmetric and to stop new match
 * actions / Teleduce writebacks against dead leads.
 */
export function isLeadMatchable(lead: {
  isArchivedInTeleduce: boolean;
  currentStage: string;
}): boolean {
  return !lead.isArchivedInTeleduce && ACTIVE_STAGE_DISPLAYS.includes(lead.currentStage);
}

export function toMatchableLead(lead: LeadWithLocalities): MatchableLead {
  return {
    id: lead.id,
    city: lead.city,
    transactionTypePref: lead.transactionTypePref,
    propertyTypePref: lead.propertyTypePref,
    bhkPref: lead.bhkPref,
    budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
    budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
    preferredLocalityIds: lead.preferredLocalities.map((l) => l.id),
    preferredLocalityPoints: lead.preferredLocalities.map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
    })),
  };
}

export function toMatchableProperty(property: PropertyWithLocality): MatchableProperty {
  return {
    id: property.id,
    city: property.city,
    transactionType: property.transactionType,
    propertyType: property.propertyType,
    availabilityStatus: property.availabilityStatus,
    bhk: property.bhk,
    priceInr: Number(property.priceInr),
    localityId: property.localityId,
    localityPoint: {
      latitude: property.locality.latitude,
      longitude: property.locality.longitude,
    },
    createdAt: property.createdAt,
  };
}

export interface MatchSummary {
  id: string;
  status: MatchStatus;
  statusReason: string | null;
  teleduceWritebackStatus: WritebackStatus;
  teleduceWritebackAt: Date | null;
  actionedByName: string | null;
  actionedAt: Date | null;
}

function toSummary(m: MatchWithActor): MatchSummary {
  return {
    id: m.id,
    status: m.status,
    statusReason: m.statusReason,
    teleduceWritebackStatus: m.teleduceWritebackStatus,
    teleduceWritebackAt: m.teleduceWritebackAt,
    actionedByName: m.actionedBy?.fullName ?? null,
    actionedAt: m.actionedAt,
  };
}

// ── Lead → properties ─────────────────────────────────────────────────────────

export interface PropertyMatchRow {
  property: PropertyWithLocality;
  band: 0 | 1 | 2 | 3;
  distanceKm: number;
  criteria: CriteriaSnapshot;
  existing: MatchSummary | null;
}

export interface BandedPropertyMatches {
  band: 0 | 1 | 2 | 3;
  label: string;
  count: number;
  rows: PropertyMatchRow[];
}

export interface LeadMatchResult {
  lead: LeadWithLocalities;
  bands: BandedPropertyMatches[];
  total: number;
  filters: ResolvedLeadMatchFilters;
  anchorLocalities: {
    id: number;
    name: string;
    city: LeadWithLocalities["city"];
    latitude: number;
    longitude: number;
  }[];
}

function resolveLeadMatchFilters(
  lead: LeadWithLocalities,
  input?: LeadMatchFilterInput,
): ResolvedLeadMatchFilters {
  if (input) {
    return {
      city: input.city ?? lead.city,
      localityIds: input.localityIds,
      transactionTypes: input.transactionTypes,
      propertyTypes: input.propertyTypes,
      bhks: input.bhks,
      buildingClassifications: input.buildingClassifications,
      furnishings: input.furnishings,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      builtUpAreaMin: input.builtUpAreaMin,
      parkingMin: input.parkingMin,
      bhkFlex: input.bhkFlex,
      budgetFlex: input.budgetFlex,
      isCustom: true,
    };
  }

  return {
    city: lead.city,
    localityIds: lead.preferredLocalities.map((l) => l.id),
    transactionTypes: lead.transactionTypePref ? [lead.transactionTypePref] : [],
    propertyTypes: lead.propertyTypePref,
    bhks: lead.bhkPref,
    buildingClassifications: [],
    furnishings: [],
    budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
    budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
    builtUpAreaMin: null,
    parkingMin: null,
    bhkFlex: true,
    budgetFlex: true,
    isCustom: false,
  };
}

export async function getMatchesForLead(
  user: SessionUser,
  leadId: string,
  filterInput?: LeadMatchFilterInput,
): Promise<LeadMatchResult | null> {
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...(user.role === "AGENT" ? { city: { in: user.cities } } : {}),
    },
    include: { preferredLocalities: true },
  });
  if (!lead) return null;
  const filters = resolveLeadMatchFilters(lead, filterInput);

  const cityAllowed = user.role === "ADMIN" || user.cities.includes(filters.city);
  const anchorLocalities = cityAllowed && filters.localityIds.length
    ? await prisma.locality.findMany({
        where: {
          id: { in: filters.localityIds },
          city: filters.city,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      })
    : [];

  // Symmetry guard: a lead that is soft-archived in the CRM or at a won/lost/closed
  // stage is NOT shown live matches — exactly as the property→leads direction
  // excludes it. Prior decisions still appear via the persisted match history.
  if (!isLeadMatchable(lead)) {
    return {
      lead,
      bands: ([0, 1, 2, 3] as const).map((band) => ({
        band,
        label: bandLabel[band],
        count: 0,
        rows: [],
      })),
      total: 0,
      filters,
      anchorLocalities,
    };
  }

  // SQL hard-filter pre-pass. Working filters start from the CRM requirement but
  // can be deliberately widened (for example 3 + 4 BHK, Apartment + Villa).
  // The source lead itself is never edited.
  const budgetTolerance = filters.budgetFlex ? BUDGET_TOLERANCE : 0;
  const priceFilter: Prisma.DecimalFilter = {};
  if (filters.budgetMin != null) {
    priceFilter.gte = filters.budgetMin * (1 - budgetTolerance);
  }
  if (filters.budgetMax != null) {
    priceFilter.lte = filters.budgetMax * (1 + budgetTolerance);
  }

  const bhkValues = filters.bhks.length
    ? Array.from(
        new Set(
          filters.bhks.flatMap((bhk) =>
            filters.bhkFlex ? [bhk - 1, bhk, bhk + 1] : [bhk],
          ),
        ),
      ).filter((bhk) => bhk >= 1 && bhk <= 20)
    : [];

  const candidates = await prisma.property.findMany({
    where: {
      deletedAt: null,
      city: cityAllowed ? filters.city : { in: [] },
      availabilityStatus: "AVAILABLE",
      ...(filters.transactionTypes.length
        ? { transactionType: { in: filters.transactionTypes } }
        : {}),
      ...(filters.propertyTypes.length
        ? { propertyType: { in: filters.propertyTypes } }
        : {}),
      ...(bhkValues.length ? { bhk: { in: bhkValues } } : {}),
      ...(Object.keys(priceFilter).length ? { priceInr: priceFilter } : {}),
      ...(filters.buildingClassifications.length
        ? { buildingClassification: { in: filters.buildingClassifications } }
        : {}),
      ...(filters.furnishings.length
        ? { furnishing: { in: filters.furnishings } }
        : {}),
      ...(filters.builtUpAreaMin != null
        ? { builtUpAreaSqft: { gte: filters.builtUpAreaMin } }
        : {}),
      ...(filters.parkingMin != null
        ? { parkingCount: { gte: filters.parkingMin } }
        : {}),
    },
    include: { locality: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_CAP,
  });

  const matchableLead: MatchableLead = {
    ...toMatchableLead(lead),
    city: filters.city,
    transactionTypePref: null,
    transactionTypeOptions: filters.transactionTypes,
    propertyTypePref: filters.propertyTypes,
    bhkPref: filters.bhks,
    bhkTolerance: filters.bhkFlex ? 1 : 0,
    budgetMin: filters.budgetMin,
    budgetMax: filters.budgetMax,
    budgetTolerance,
    preferredLocalityIds: anchorLocalities.map((l) => l.id),
    preferredLocalityPoints: anchorLocalities.map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
    })),
  };
  const propById = new Map(candidates.map((p) => [p.id, p]));
  const banded = matchLeadToProperties(matchableLead, candidates.map(toMatchableProperty));

  const existing = await prisma.match.findMany({
    where: { leadId: lead.id },
    include: { actionedBy: { select: { fullName: true } } },
  });
  const existingByProp = new Map(existing.map((m) => [m.propertyId, m]));

  let total = 0;
  const bands: BandedPropertyMatches[] = banded.map((b) => {
    const rows: PropertyMatchRow[] = b.matches.map((match) => {
      const property = propById.get(match.property.id)!;
      const ex = existingByProp.get(match.property.id);
      return {
        property,
        band: match.band,
        distanceKm: match.distanceKm,
        criteria: match.criteria,
        existing: ex ? toSummary(ex) : null,
      };
    });
    total += rows.length;
    return { band: b.band, label: b.label, count: rows.length, rows };
  });

  return { lead, bands, total, filters, anchorLocalities };
}

// ── Property → leads (roles inverted) ─────────────────────────────────────────

export interface LeadMatchRow {
  lead: LeadWithLocalities;
  band: 0 | 1 | 2 | 3;
  distanceKm: number;
  criteria: CriteriaSnapshot;
  existing: MatchSummary | null;
}

export interface BandedLeadMatches {
  band: 0 | 1 | 2 | 3;
  label: string;
  count: number;
  rows: LeadMatchRow[];
}

export interface PropertyMatchResult {
  property: PropertyWithLocality;
  bands: BandedLeadMatches[];
  total: number;
}

function compareLeadRows(
  a: { distanceKm: number; criteria: CriteriaSnapshot; lead: LeadWithLocalities },
  b: { distanceKm: number; criteria: CriteriaSnapshot; lead: LeadWithLocalities },
): number {
  if (b.criteria.score !== a.criteria.score) return b.criteria.score - a.criteria.score;
  const ad = a.distanceKm < 0 ? Infinity : a.distanceKm;
  const bd = b.distanceKm < 0 ? Infinity : b.distanceKm;
  if (ad !== bd) return ad - bd;
  return b.lead.createdAt.getTime() - a.lead.createdAt.getTime();
}

export async function getMatchesForProperty(
  user: SessionUser,
  propertyId: string,
): Promise<PropertyMatchResult | null> {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      deletedAt: null,
      ...(user.role === "AGENT" ? { city: { in: user.cities } } : {}),
    },
    include: { locality: true },
  });
  if (!property) return null;

  const matchableProperty = toMatchableProperty(property);

  // Candidate leads: same city, still live in the CRM (not soft-archived), and
  // at an ACTIVE pipeline stage — mirrors the leads list so a lead is matchable
  // from the property direction iff it's matchable from the lead direction. Won/
  // lost leads stay out of the live list; prior decisions surface via history.
  // SQL pre-filter exactly mirrors the engine's hard filters (transaction, property
  // type, budget overlap) so we don't load every active lead in the city into memory.
  // Each OR keeps "no preference" leads (null/empty = matches anything).
  const price = Number(property.priceInr);
  const leads = await prisma.lead.findMany({
    where: {
      city: property.city,
      isArchivedInTeleduce: false,
      currentStage: { in: ACTIVE_STAGE_DISPLAYS },
      AND: [
        { OR: [{ transactionTypePref: property.transactionType }, { transactionTypePref: null }] },
        { OR: [{ propertyTypePref: { isEmpty: true } }, { propertyTypePref: { has: property.propertyType } }] },
        { OR: [{ budgetMin: null }, { budgetMin: { lte: price / (1 - BUDGET_TOLERANCE) } }] },
        { OR: [{ budgetMax: null }, { budgetMax: { gte: price / (1 + BUDGET_TOLERANCE) } }] },
      ],
    },
    include: { preferredLocalities: true },
    take: CANDIDATE_CAP,
  });

  const matched: { lead: LeadWithLocalities; r: MatchResult }[] = [];
  for (const lead of leads) {
    const r = evaluateMatch(toMatchableLead(lead), matchableProperty);
    if (r) matched.push({ lead, r });
  }

  const existing = await prisma.match.findMany({
    where: { propertyId: property.id },
    include: { actionedBy: { select: { fullName: true } } },
  });
  const existingByLead = new Map(existing.map((m) => [m.leadId, m]));

  let total = 0;
  const bands: BandedLeadMatches[] = ([0, 1, 2, 3] as const).map((band) => {
    const rows: LeadMatchRow[] = matched
      .filter(({ r }) => r.band === band)
      .map(({ lead, r }) => ({
        lead,
        band: r.band,
        distanceKm: r.distanceKm,
        criteria: r.criteria,
        existing: (() => {
          const ex = existingByLead.get(lead.id);
          return ex ? toSummary(ex) : null;
        })(),
      }))
      .sort(compareLeadRows);
    total += rows.length;
    return { band, label: bandLabel[band], count: rows.length, rows };
  });

  return { property, bands, total };
}

// ── Snapshot for persistence (used by the match-action server action) ─────────

export interface MatchSnapshot {
  lead: LeadWithLocalities;
  property: PropertyWithLocality;
  band: 0 | 1 | 2 | 3;
  distanceKm: number;
  criteria: CriteriaSnapshot;
}

/**
 * Re-load both sides server-side, enforce city access, and recompute the band +
 * criteria snapshot so what we persist on the Match is trustworthy (never taken
 * from the client). Throws ForbiddenError on city violation; returns null if
 * either side is missing.
 */
export async function buildMatchSnapshot(
  user: SessionUser,
  leadId: string,
  propertyId: string,
): Promise<MatchSnapshot | null> {
  const [lead, property] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      include: { preferredLocalities: true },
    }),
    prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      include: { locality: true },
    }),
  ]);
  if (!lead || !property) return null;

  if (user.role === "AGENT") {
    if (!user.cities.includes(lead.city) || !user.cities.includes(property.city)) {
      throw new ForbiddenError("You are not assigned to this city.");
    }
  }
  // A lead and property in different cities can never be a real match.
  if (lead.city !== property.city) return null;
  // Never create/update a match (and trigger a CRM writeback) against a lead that
  // has been soft-archived from Teleduce — that would re-activate a dropped lead.
  if (lead.isArchivedInTeleduce) return null;

  const { band, distanceKm, criteria } = describeMatch(
    toMatchableLead(lead),
    toMatchableProperty(property),
  );
  return { lead, property, band, distanceKm, criteria };
}

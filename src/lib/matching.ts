import type {
  City,
  PropertyType,
  TransactionType,
  AvailabilityStatus,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Radius-expanding matching engine — pure logic, no database access.
//
//   Hard filters (applied to EVERY candidate, every band):
//     city, availability, transaction type, property type, BHK (exact or ±1),
//     budget overlap (±10%).
//   Band assignment via Haversine on locality-centroid lat/lng:
//     Band 0 = same locality, Band 1 ≤ 3 km, Band 2 ≤ 5 km, Band 3 = beyond 5 km.
//   Match records persist band, distance, and the criteria used for the decision.
// ─────────────────────────────────────────────────────────────────────────────

export const BUDGET_TOLERANCE = 0.1; // ±10%
export const BAND_1_KM = 3;
export const BAND_2_KM = 5;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371; // Earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Band 0–3 from a distance in km. Band 0 is reserved for the lead's preferred
 * locality (matched by id via `sameLocality`); a genuine 0 km between two
 * DISTINCT localities falls into Band 1, not Band 0.
 */
export function bandForDistance(km: number, sameLocality: boolean): 0 | 1 | 2 | 3 {
  if (sameLocality) return 0;
  if (km <= BAND_1_KM) return 1;
  if (km <= BAND_2_KM) return 2;
  return 3;
}

export const bandLabel: Record<number, string> = {
  0: "Exact locality",
  1: "Within 3 km",
  2: "Within 5 km",
  3: "Beyond 5 km · across the city",
};

// ── Normalised inputs (Decimals already converted to numbers) ──

export interface MatchableLead {
  id: string;
  city: City;
  transactionTypePref: TransactionType | null;
  /** Optional multi-select override. Empty means any; undefined uses the CRM scalar. */
  transactionTypeOptions?: TransactionType[];
  propertyTypePref: PropertyType[];
  bhkPref: number[];
  /** Working filters can be exact (0); CRM matching keeps its historical ±1 default. */
  bhkTolerance?: 0 | 1;
  budgetMin: number | null;
  budgetMax: number | null;
  /** Working filters can be exact (0); CRM matching keeps its historical ±10% default. */
  budgetTolerance?: number;
  preferredLocalityIds: number[];
  preferredLocalityPoints: GeoPoint[];
}

export interface MatchableProperty {
  id: string;
  city: City;
  transactionType: TransactionType;
  propertyType: PropertyType;
  availabilityStatus: AvailabilityStatus;
  bhk: number | null;
  priceInr: number;
  localityId: number;
  localityPoint: GeoPoint;
  createdAt: Date;
}

export interface CriteriaSnapshot {
  cityMatch: boolean;
  transactionMatch: boolean;
  typeMatch: boolean;
  bhkExact: boolean;
  bhkWithinOne: boolean;
  budgetInRange: boolean;
  localityExact: boolean;
  band: 0 | 1 | 2 | 3;
  distanceKm: number;
  /** Count of strong/exact criteria satisfied — used for ranking. */
  score: number;
}

export interface MatchResult {
  property: MatchableProperty;
  band: 0 | 1 | 2 | 3;
  distanceKm: number;
  criteria: CriteriaSnapshot;
}

function budgetOverlaps(
  priceInr: number,
  budgetMin: number | null,
  budgetMax: number | null,
  tolerance = BUDGET_TOLERANCE,
): boolean {
  if (budgetMin == null && budgetMax == null) return true; // no budget → no constraint
  const lo = budgetMin != null ? budgetMin * (1 - tolerance) : 0;
  const hi = budgetMax != null ? budgetMax * (1 + tolerance) : Infinity;
  return priceInr >= lo && priceInr <= hi;
}

function bhkMatches(
  prefs: number[],
  bhk: number | null,
  tolerance: 0 | 1 = 1,
): { pass: boolean; exact: boolean; withinOne: boolean } {
  if (prefs.length === 0) return { pass: true, exact: false, withinOne: false };
  if (bhk == null) return { pass: false, exact: false, withinOne: false };
  const exact = prefs.includes(bhk);
  const withinOne = prefs.some((p) => Math.abs(p - bhk) <= 1);
  return { pass: tolerance === 0 ? exact : withinOne, exact, withinOne };
}

function transactionMatches(lead: MatchableLead, property: MatchableProperty): boolean {
  if (lead.transactionTypeOptions) {
    return (
      lead.transactionTypeOptions.length === 0 ||
      lead.transactionTypeOptions.includes(property.transactionType)
    );
  }
  return (
    lead.transactionTypePref == null ||
    property.transactionType === lead.transactionTypePref
  );
}

/**
 * Hard-filter + band a single property against a lead. Returns null if the property
 * fails any hard filter (so it must NOT be shown). Otherwise returns the band,
 * distance and criteria snapshot.
 */
export function evaluateMatch(
  lead: MatchableLead,
  property: MatchableProperty,
): MatchResult | null {
  // Hard filters — ALL must pass.
  if (property.city !== lead.city) return null;
  if (property.availabilityStatus !== "AVAILABLE") return null;

  if (!transactionMatches(lead, property)) return null;
  if (
    lead.propertyTypePref.length > 0 &&
    !lead.propertyTypePref.includes(property.propertyType)
  ) {
    return null;
  }

  const bhk = bhkMatches(lead.bhkPref, property.bhk, lead.bhkTolerance ?? 1);
  if (!bhk.pass) return null;

  if (
    !budgetOverlaps(
      property.priceInr,
      lead.budgetMin,
      lead.budgetMax,
      lead.budgetTolerance ?? BUDGET_TOLERANCE,
    )
  ) {
    return null;
  }

  // Passed all hard filters → compute band, distance and the criteria snapshot.
  const { band, distanceKm, criteria } = computeMatchCriteria(lead, property);
  return { property, band, distanceKm, criteria };
}

/**
 * Compute band, distance and the criteria snapshot for a (lead, property) pair
 * WITHOUT applying the hard filters. Shared by evaluateMatch (after its filters
 * pass) and describeMatch (to persist a snapshot when an agent actions a match).
 */
export function computeMatchCriteria(
  lead: MatchableLead,
  property: MatchableProperty,
): { band: 0 | 1 | 2 | 3; distanceKm: number; criteria: CriteriaSnapshot } {
  const localityExact = lead.preferredLocalityIds.includes(property.localityId);
  let distanceKm = 0;
  if (!localityExact) {
    if (lead.preferredLocalityPoints.length === 0) {
      // No preferred localities on the lead → treat as city-wide (Band 3).
      distanceKm = Infinity;
    } else {
      distanceKm = Math.min(
        ...lead.preferredLocalityPoints.map((p) =>
          haversineKm(p, property.localityPoint),
        ),
      );
    }
  }

  const band: 0 | 1 | 2 | 3 = localityExact
    ? 0
    : distanceKm === Infinity
      ? 3
      : bandForDistance(distanceKm, false);

  const bhk = bhkMatches(lead.bhkPref, property.bhk, lead.bhkTolerance ?? 1);
  const hasTransactionFilter = lead.transactionTypeOptions
    ? lead.transactionTypeOptions.length > 0
    : lead.transactionTypePref != null;
  const transactionMatch = hasTransactionFilter && transactionMatches(lead, property);
  const typeMatch =
    lead.propertyTypePref.length > 0 &&
    lead.propertyTypePref.includes(property.propertyType);
  const budgetInRange =
    (lead.budgetMin != null || lead.budgetMax != null) &&
    budgetOverlaps(
      property.priceInr,
      lead.budgetMin,
      lead.budgetMax,
      lead.budgetTolerance ?? BUDGET_TOLERANCE,
    );

  const score =
    (localityExact ? 3 : band === 1 ? 2 : band === 2 ? 1 : 0) +
    (bhk.exact ? 2 : bhk.withinOne ? 1 : 0) +
    (typeMatch ? 1 : 0) +
    (transactionMatch ? 1 : 0) +
    (budgetInRange ? 1 : 0);

  const roundedDistance =
    distanceKm === Infinity ? -1 : Math.round(distanceKm * 100) / 100;

  const criteria: CriteriaSnapshot = {
    cityMatch: property.city === lead.city,
    transactionMatch,
    typeMatch,
    bhkExact: bhk.exact,
    bhkWithinOne: bhk.withinOne,
    budgetInRange,
    localityExact,
    band,
    distanceKm: roundedDistance,
    score,
  };

  return { band, distanceKm: roundedDistance, criteria };
}

/** Always returns band/distance/criteria for a pair (no hard-filter gating) — for persistence. */
export function describeMatch(
  lead: MatchableLead,
  property: MatchableProperty,
): { band: 0 | 1 | 2 | 3; distanceKm: number; criteria: CriteriaSnapshot } {
  return computeMatchCriteria(lead, property);
}

/** Rank within a band: more criteria first, then closer, then newer. */
export function compareMatches(a: MatchResult, b: MatchResult): number {
  if (b.criteria.score !== a.criteria.score) return b.criteria.score - a.criteria.score;
  const ad = a.distanceKm < 0 ? Infinity : a.distanceKm;
  const bd = b.distanceKm < 0 ? Infinity : b.distanceKm;
  if (ad !== bd) return ad - bd;
  return b.property.createdAt.getTime() - a.property.createdAt.getTime();
}

export interface BandedMatches {
  band: 0 | 1 | 2 | 3;
  label: string;
  matches: MatchResult[];
}

/** Evaluate all candidates and return them grouped into bands (0→3), sorted within each. */
export function matchLeadToProperties(
  lead: MatchableLead,
  candidates: MatchableProperty[],
): BandedMatches[] {
  const results: MatchResult[] = [];
  for (const p of candidates) {
    const r = evaluateMatch(lead, p);
    if (r) results.push(r);
  }

  const bands: BandedMatches[] = ([0, 1, 2, 3] as const).map((band) => ({
    band,
    label: bandLabel[band],
    matches: results.filter((r) => r.band === band).sort(compareMatches),
  }));

  return bands;
}

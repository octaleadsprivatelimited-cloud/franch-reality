import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  haversineKm,
  bandForDistance,
  evaluateMatch,
  matchLeadToProperties,
  type MatchableLead,
  type MatchableProperty,
} from "../../src/lib/matching";

// ── Fixtures ────────────────────────────────────────────────────────────────

const LOC_A = { id: 1, point: { latitude: 17.4483, longitude: 78.3915 } }; // Madhapur (HYD)
const LOC_B = { id: 2, point: { latitude: 17.396, longitude: 78.414 } }; // Tolichowki (HYD)

function baseLead(over: Partial<MatchableLead> = {}): MatchableLead {
  return {
    id: "lead-1",
    city: "HYDERABAD",
    transactionTypePref: "SALE",
    propertyTypePref: ["APARTMENT"],
    bhkPref: [3],
    budgetMin: 8_000_000,
    budgetMax: 12_000_000,
    preferredLocalityIds: [LOC_A.id],
    preferredLocalityPoints: [LOC_A.point],
    ...over,
  };
}

function baseProperty(over: Partial<MatchableProperty> = {}): MatchableProperty {
  return {
    id: "prop-1",
    city: "HYDERABAD",
    transactionType: "SALE",
    propertyType: "APARTMENT",
    availabilityStatus: "AVAILABLE",
    bhk: 3,
    priceInr: 10_000_000,
    localityId: LOC_A.id,
    localityPoint: LOC_A.point,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

// ── haversineKm ──────────────────────────────────────────────────────────────

describe("haversineKm", () => {
  test("returns ~0 for identical points", () => {
    assert.equal(haversineKm(LOC_A.point, LOC_A.point), 0);
  });

  test("matches a known great-circle distance within tolerance", () => {
    // Madhapur (17.4483, 78.3915) → Tolichowki (17.396, 78.414): ~6.2 km.
    const d = haversineKm(LOC_A.point, LOC_B.point);
    assert.ok(d > 5.5 && d < 7, `expected ~6.2km, got ${d}`);
  });

  test("is symmetric", () => {
    assert.equal(
      haversineKm(LOC_A.point, LOC_B.point),
      haversineKm(LOC_B.point, LOC_A.point),
    );
  });

  test("matches a 1-degree-of-latitude reference (~111 km)", () => {
    const d = haversineKm(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    );
    assert.ok(Math.abs(d - 111.19) < 0.5, `expected ~111.19km, got ${d}`);
  });
});

// ── bandForDistance ──────────────────────────────────────────────────────────

describe("bandForDistance", () => {
  test("sameLocality always wins → band 0", () => {
    assert.equal(bandForDistance(0, true), 0);
    assert.equal(bandForDistance(50, true), 0); // even far, same locality id ⇒ 0
  });

  test("km === 0 but sameLocality=false is NOT band 0 (distinct localities)", () => {
    assert.equal(bandForDistance(0, false), 1);
  });

  test("boundaries: 3 → band 1, 3.0001 → band 2", () => {
    assert.equal(bandForDistance(3, false), 1);
    assert.equal(bandForDistance(3.0001, false), 2);
  });

  test("boundaries: 5 → band 2, beyond 5 → band 3", () => {
    assert.equal(bandForDistance(5, false), 2);
    assert.equal(bandForDistance(5.0001, false), 3);
  });
});

// ── evaluateMatch: hard filters ──────────────────────────────────────────────

describe("evaluateMatch hard filters return null", () => {
  test("city mismatch", () => {
    assert.equal(evaluateMatch(baseLead(), baseProperty({ city: "CHENNAI" })), null);
  });

  test("non-AVAILABLE property", () => {
    assert.equal(
      evaluateMatch(baseLead(), baseProperty({ availabilityStatus: "SOLD" })),
      null,
    );
    assert.equal(
      evaluateMatch(baseLead(), baseProperty({ availabilityStatus: "BOOKED" })),
      null,
    );
  });

  test("transaction preference mismatch", () => {
    assert.equal(
      evaluateMatch(baseLead({ transactionTypePref: "RENT" }), baseProperty()),
      null,
    );
  });

  test("property type not in preference list", () => {
    assert.equal(
      evaluateMatch(baseLead({ propertyTypePref: ["VILLA"] }), baseProperty()),
      null,
    );
  });

  test("working filters can include an alternative property type", () => {
    assert.ok(
      evaluateMatch(
        baseLead({ propertyTypePref: ["APARTMENT", "VILLA"] }),
        baseProperty({ propertyType: "VILLA" }),
      ),
    );
  });

  test("bhk beyond ±1", () => {
    // lead wants 3 BHK; ±1 allows 2–4. A 1 BHK or 5 BHK must fail.
    assert.equal(evaluateMatch(baseLead(), baseProperty({ bhk: 1 })), null);
    assert.equal(evaluateMatch(baseLead(), baseProperty({ bhk: 5 })), null);
  });

  test("working filters can require exact BHK", () => {
    const exactOnly = baseLead({ bhkTolerance: 0 });
    assert.ok(evaluateMatch(exactOnly, baseProperty({ bhk: 3 })));
    assert.equal(evaluateMatch(exactOnly, baseProperty({ bhk: 4 })), null);
  });

  test("working filters support multiple transaction types", () => {
    const either = baseLead({
      transactionTypePref: null,
      transactionTypeOptions: ["SALE", "RENT"],
    });
    assert.ok(evaluateMatch(either, baseProperty({ transactionType: "SALE" })));
    assert.ok(evaluateMatch(either, baseProperty({ transactionType: "RENT" })));
  });

  test("budget outside ±10% on either side", () => {
    // budgetMin 8M → lower bound 7.2M; budgetMax 12M → upper bound 13.2M.
    assert.equal(evaluateMatch(baseLead(), baseProperty({ priceInr: 7_000_000 })), null);
    assert.equal(evaluateMatch(baseLead(), baseProperty({ priceInr: 14_000_000 })), null);
  });

  test("working filters can use exact budget bounds", () => {
    const exactBudget = baseLead({ budgetTolerance: 0 });
    assert.ok(evaluateMatch(exactBudget, baseProperty({ priceInr: 8_000_000 })));
    assert.equal(
      evaluateMatch(exactBudget, baseProperty({ priceInr: 7_999_999 })),
      null,
    );
  });
});

// ── evaluateMatch: happy path + flags ────────────────────────────────────────

describe("evaluateMatch happy path", () => {
  test("returns band 0 + correct criteria flags for an exact match in preferred locality", () => {
    const r = evaluateMatch(baseLead(), baseProperty());
    assert.ok(r, "expected a match");
    assert.equal(r!.band, 0);
    assert.equal(r!.distanceKm, 0);
    assert.equal(r!.criteria.cityMatch, true);
    assert.equal(r!.criteria.transactionMatch, true);
    assert.equal(r!.criteria.typeMatch, true);
    assert.equal(r!.criteria.bhkExact, true);
    assert.equal(r!.criteria.bhkWithinOne, true);
    assert.equal(r!.criteria.budgetInRange, true);
    assert.equal(r!.criteria.localityExact, true);
  });

  test("budget overlap respects ±10% on BOTH bounds (just inside passes)", () => {
    // lower bound = 8M * 0.9 = 7.2M; upper bound = 12M * 1.1 = 13.2M
    assert.ok(evaluateMatch(baseLead(), baseProperty({ priceInr: 7_200_000 })));
    assert.ok(evaluateMatch(baseLead(), baseProperty({ priceInr: 13_200_000 })));
    // Just outside fails.
    assert.equal(evaluateMatch(baseLead(), baseProperty({ priceInr: 7_199_999 })), null);
    assert.equal(evaluateMatch(baseLead(), baseProperty({ priceInr: 13_200_001 })), null);
  });

  test("bhk exact vs ±1 flags", () => {
    const exact = evaluateMatch(baseLead(), baseProperty({ bhk: 3 }));
    assert.equal(exact!.criteria.bhkExact, true);
    assert.equal(exact!.criteria.bhkWithinOne, true);

    const offByOne = evaluateMatch(baseLead(), baseProperty({ bhk: 4 }));
    assert.ok(offByOne, "±1 should pass the hard filter");
    assert.equal(offByOne!.criteria.bhkExact, false);
    assert.equal(offByOne!.criteria.bhkWithinOne, true);
  });

  test("a property in a distinct locality 0km from a preferred point lands in band 1", () => {
    // localityId differs from preferred (so not localityExact) but coordinates equal
    // a preferred point → distance 0 but band must be 1, never 0.
    const r = evaluateMatch(
      baseLead(),
      baseProperty({ localityId: 999, localityPoint: LOC_A.point }),
    );
    assert.ok(r);
    assert.equal(r!.criteria.localityExact, false);
    assert.equal(r!.band, 1);
    assert.equal(r!.distanceKm, 0);
  });
});

// ── matchLeadToProperties: banding + sorting ────────────────────────────────

describe("matchLeadToProperties", () => {
  test("groups results into exactly 4 bands (0..3) in order", () => {
    const banded = matchLeadToProperties(baseLead(), [baseProperty()]);
    assert.equal(banded.length, 4);
    assert.deepEqual(banded.map((b) => b.band), [0, 1, 2, 3]);
  });

  test("lead with NO preferred localities → Band 3 with distanceKm -1 sentinel", () => {
    const lead = baseLead({ preferredLocalityIds: [], preferredLocalityPoints: [] });
    const banded = matchLeadToProperties(lead, [baseProperty({ localityId: 5 })]);
    const band3 = banded.find((b) => b.band === 3)!;
    assert.equal(band3.matches.length, 1);
    assert.equal(band3.matches[0].band, 3);
    assert.equal(band3.matches[0].distanceKm, -1);
    // The other bands must be empty.
    assert.equal(banded.find((b) => b.band === 0)!.matches.length, 0);
    assert.equal(banded.find((b) => b.band === 1)!.matches.length, 0);
    assert.equal(banded.find((b) => b.band === 2)!.matches.length, 0);
  });

  test("within a band, sorts by score desc then distance asc", () => {
    // Lead has no transaction pref so type/budget vary score; all share band 1.
    const lead = baseLead({
      transactionTypePref: null,
      preferredLocalityIds: [LOC_A.id],
      preferredLocalityPoints: [LOC_A.point],
    });

    // Two distinct (non-preferred) localities, both within 3 km of LOC_A.
    const near = { latitude: 17.45, longitude: 78.39 }; // ~0.4 km from LOC_A
    const far = { latitude: 17.43, longitude: 78.40 }; // ~2.4 km from LOC_A

    // Higher score (exact bhk + budget in range), but FARTHER.
    const highScoreFar = baseProperty({
      id: "high-far",
      localityId: 10,
      localityPoint: far,
      bhk: 3,
      priceInr: 10_000_000,
    });
    // Lower score (bhk off-by-one), but NEARER.
    const lowScoreNear = baseProperty({
      id: "low-near",
      localityId: 11,
      localityPoint: near,
      bhk: 4,
      priceInr: 10_000_000,
    });

    const banded = matchLeadToProperties(lead, [lowScoreNear, highScoreFar]);
    const band1 = banded.find((b) => b.band === 1)!;
    assert.equal(band1.matches.length, 2, "both should be band 1");
    // Score wins over distance: the higher-scoring (but farther) one ranks first.
    assert.equal(band1.matches[0].property.id, "high-far");
    assert.equal(band1.matches[1].property.id, "low-near");
    assert.ok(band1.matches[0].criteria.score > band1.matches[1].criteria.score);
  });

  test("ties on score are broken by smaller distance first", () => {
    const lead = baseLead({
      preferredLocalityIds: [LOC_A.id],
      preferredLocalityPoints: [LOC_A.point],
    });
    const near = { latitude: 17.45, longitude: 78.39 }; // ~0.4 km
    const far = { latitude: 17.43, longitude: 78.40 }; // ~2.4 km

    const a = baseProperty({ id: "near", localityId: 20, localityPoint: near });
    const b = baseProperty({ id: "far", localityId: 21, localityPoint: far });
    // Identical except distance → identical score → nearer first.
    const banded = matchLeadToProperties(lead, [b, a]);
    const band1 = banded.find((bd) => bd.band === 1)!;
    assert.equal(band1.matches.length, 2);
    assert.equal(band1.matches[0].criteria.score, band1.matches[1].criteria.score);
    assert.equal(band1.matches[0].property.id, "near");
    assert.equal(band1.matches[1].property.id, "far");
  });
});

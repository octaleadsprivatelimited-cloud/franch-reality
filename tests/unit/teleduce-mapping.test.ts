import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  mapTeleduceBhk,
  mapTeleducePropertyType,
  mapTeleduceUsage,
  mapTeleduceCity,
  teleduceStageForMatch,
  isActiveStage,
} from "../../src/lib/teleduce/mapping";

// ── mapTeleduceBhk ───────────────────────────────────────────────────────────

describe("mapTeleduceBhk", () => {
  test("'3 BHK' → 3", () => assert.equal(mapTeleduceBhk("3 BHK"), 3));
  test("'6 BHK and more' → 6", () => assert.equal(mapTeleduceBhk("6 BHK and more"), 6));
  test("'1 BHK' → 1", () => assert.equal(mapTeleduceBhk("1 BHK"), 1));
  test("'0' → null", () => assert.equal(mapTeleduceBhk("0"), null));
  test("null → null", () => assert.equal(mapTeleduceBhk(null), null));
  test("undefined → null", () => assert.equal(mapTeleduceBhk(undefined), null));
  test("non-numeric junk → null", () => assert.equal(mapTeleduceBhk("studio"), null));
});

// ── mapTeleducePropertyType ──────────────────────────────────────────────────

describe("mapTeleducePropertyType", () => {
  test("Villa → VILLA / RESIDENTIAL", () => {
    assert.deepEqual(mapTeleducePropertyType("Villa"), {
      propertyType: "VILLA",
      usage: "RESIDENTIAL",
    });
  });
  test("Apartment → APARTMENT / RESIDENTIAL", () => {
    assert.deepEqual(mapTeleducePropertyType("Apartment"), {
      propertyType: "APARTMENT",
      usage: "RESIDENTIAL",
    });
  });
  test("Plot → PLOT / RESIDENTIAL", () => {
    assert.deepEqual(mapTeleducePropertyType("Plot"), {
      propertyType: "PLOT",
      usage: "RESIDENTIAL",
    });
  });
  test("Office / Retail / RnR → COMMERCIAL / COMMERCIAL", () => {
    for (const v of ["Office", "Retail", "RnR"]) {
      assert.deepEqual(
        mapTeleducePropertyType(v),
        { propertyType: "COMMERCIAL", usage: "COMMERCIAL" },
        `${v} should map to COMMERCIAL`,
      );
    }
  });
  test("case-insensitive", () => {
    assert.deepEqual(mapTeleducePropertyType("VILLA"), {
      propertyType: "VILLA",
      usage: "RESIDENTIAL",
    });
  });
  test("junk → null", () => assert.equal(mapTeleducePropertyType("Spaceship"), null));
  test("null → null", () => assert.equal(mapTeleducePropertyType(null), null));
});

// ── mapTeleduceUsage ─────────────────────────────────────────────────────────

describe("mapTeleduceUsage", () => {
  test("'Residential Sale' → SALE / RESIDENTIAL", () => {
    assert.deepEqual(mapTeleduceUsage("Residential Sale"), {
      transactionType: "SALE",
      usage: "RESIDENTIAL",
    });
  });
  test("'Commercial Rental' → RENT / COMMERCIAL", () => {
    assert.deepEqual(mapTeleduceUsage("Commercial Rental"), {
      transactionType: "RENT",
      usage: "COMMERCIAL",
    });
  });
  test("'Residential Rental' → RENT / RESIDENTIAL", () => {
    assert.deepEqual(mapTeleduceUsage("Residential Rental"), {
      transactionType: "RENT",
      usage: "RESIDENTIAL",
    });
  });
  test("'Commercial Sale' → SALE / COMMERCIAL", () => {
    assert.deepEqual(mapTeleduceUsage("Commercial Sale"), {
      transactionType: "SALE",
      usage: "COMMERCIAL",
    });
  });
  test("ambiguous values → null", () => {
    for (const v of ["Mix", "Agent", "Unknown"]) {
      assert.equal(mapTeleduceUsage(v), null, `${v} should be null`);
    }
    assert.equal(mapTeleduceUsage(null), null);
  });
});

// ── mapTeleduceCity ──────────────────────────────────────────────────────────

describe("mapTeleduceCity", () => {
  test("hyderabad variants → HYDERABAD", () => {
    assert.equal(mapTeleduceCity("hyderabad"), "HYDERABAD");
    assert.equal(mapTeleduceCity("hyd"), "HYDERABAD");
    assert.equal(mapTeleduceCity("Hyderabad, Telangana"), "HYDERABAD");
  });
  test("chennai → CHENNAI", () => {
    assert.equal(mapTeleduceCity("chennai"), "CHENNAI");
    assert.equal(mapTeleduceCity("Chennai"), "CHENNAI");
  });
  test("out-of-scope city → null", () => {
    assert.equal(mapTeleduceCity("Bangalore"), null);
    assert.equal(mapTeleduceCity(null), null);
  });
});

// ── teleduceStageForMatch ────────────────────────────────────────────────────

describe("teleduceStageForMatch", () => {
  test("SHORTLISTED → null (stays internal, no writeback)", () => {
    assert.equal(teleduceStageForMatch("SHORTLISTED"), null);
  });
  test("SHARED → 'Contacted and Details Shared'", () => {
    const s = teleduceStageForMatch("SHARED");
    assert.ok(s);
    assert.equal(s!.display, "Contacted and Details Shared");
  });
  test("CLOSED_WON → 'Registration completed' (a won stage)", () => {
    const s = teleduceStageForMatch("CLOSED_WON");
    assert.ok(s);
    assert.equal(s!.display, "Registration completed");
    assert.equal(s!.isWon, true);
  });
  test("CLOSED_LOST → 'Contacted but not interested' (a lost stage)", () => {
    const s = teleduceStageForMatch("CLOSED_LOST");
    assert.ok(s);
    assert.equal(s!.display, "Contacted but not interested");
    assert.equal(s!.isLost, true);
  });
});

// ── isActiveStage ────────────────────────────────────────────────────────────

describe("isActiveStage", () => {
  test("an active stage is active", () => {
    assert.equal(isActiveStage("Not yet contacted"), true);
    assert.equal(isActiveStage("Site visit scheduled"), true);
  });
  test("won / lost stages are NOT active", () => {
    assert.equal(isActiveStage("Registration completed"), false); // won
    assert.equal(isActiveStage("Contacted but not interested"), false); // lost
  });
  test("unknown stage defaults to active (never silently hide a live lead)", () => {
    assert.equal(isActiveStage("Some new stage we have not seen"), true);
    assert.equal(isActiveStage(null), true);
  });
});

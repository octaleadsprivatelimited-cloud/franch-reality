import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRequirementPrice,
  parseRequirementBhk,
  parseRequirementPropertyType,
  parseRequirementTransaction,
  inferCity,
  findLocalities,
  parseRequirementText,
} from "../../src/lib/teleduce/requirement-parser";
import { mapRawLeadToTeleduceLead } from "../../src/lib/teleduce/corefactors-client";

// All fixtures below are real "Lead Requirement" shapes observed in the live feed.

describe("parseRequirementPrice", () => {
  it("reads the leading absolute amount (portal format)", () => {
    assert.equal(parseRequirementPrice("18500000, 3Bed  Apartment for Sale in Jubilee Hills, Hyderabad"), 18500000);
    assert.equal(parseRequirementPrice("375000,  Showrooms for Lease Nungambakkam, Chennai Central"), 375000);
  });
  it("expands K / L / Cr shorthand from agent logs", () => {
    assert.equal(parseRequirementPrice("Call back cx requirement for 3bhk under 75K"), 75000);
    assert.equal(parseRequirementPrice("brand new flat or villa in JUB MAD 3L rent"), 300000);
    assert.equal(parseRequirementPrice("budget around 1.4lkhs.few properties shared."), 140000);
  });
  it("takes the upper bound of a range", () => {
    assert.equal(parseRequirementPrice("Budget 65k to 70k."), 70000);
  });
  it("ignores stray small numbers like sqft", () => {
    // "2500sft" must not win over the real budget "550k".
    assert.equal(parseRequirementPrice("1600 plus sft.budget max 550k. few properties shared."), 550000);
  });
  it("returns null when there is no money token", () => {
    assert.equal(parseRequirementPrice("call back cx not interested"), null);
    assert.equal(parseRequirementPrice(""), null);
  });
});

describe("parseRequirementBhk", () => {
  it("reads N Bed / N BHK", () => {
    assert.deepEqual(parseRequirementBhk("3Bed  Apartment for Sale"), [3]);
    assert.deepEqual(parseRequirementBhk("3 BHK Multistorey Apartment for Rent"), [3]);
  });
  it("handles ranges and plus", () => {
    assert.deepEqual(parseRequirementBhk("requirement for 1-2bhk for air BNB"), [1, 2]);
    assert.deepEqual(parseRequirementBhk("3+ BHK gated community"), [3]);
  });
  it("returns empty when no bedroom token", () => {
    assert.deepEqual(parseRequirementBhk("Showrooms for Lease Nungambakkam"), []);
  });
});

describe("parseRequirementPropertyType", () => {
  it("normalises to mapping.ts labels and flags commercial", () => {
    assert.deepEqual(parseRequirementPropertyType("3Bed Apartment for Sale"), { label: "Apartment", commercial: false });
    assert.deepEqual(parseRequirementPropertyType("Showrooms for Lease"), { label: "Retail", commercial: true });
    assert.deepEqual(parseRequirementPropertyType("3bhk commercial space for movie office"), { label: "Office", commercial: true });
    assert.deepEqual(parseRequirementPropertyType("Looking for independent house in attapur"), { label: "Villa", commercial: false });
    assert.deepEqual(parseRequirementPropertyType("open plot in kokapet"), { label: "Plot", commercial: false });
  });
  it("returns null label when no type keyword", () => {
    assert.deepEqual(parseRequirementPropertyType("call back cx no response"), { label: null, commercial: false });
  });
});

describe("parseRequirementTransaction", () => {
  it("detects sale vs rent/lease", () => {
    assert.equal(parseRequirementTransaction("Apartment for Sale in Jubilee Hills"), "SALE");
    assert.equal(parseRequirementTransaction("Apartment for Rent in Medavakkam"), "RENT");
    assert.equal(parseRequirementTransaction("Showrooms for Lease Nungambakkam"), "RENT");
  });
  it("is null when neither/both are present", () => {
    assert.equal(parseRequirementTransaction("call back cx requirement"), null);
  });
});

describe("inferCity", () => {
  it("reads an explicit city mention", () => {
    assert.equal(inferCity("..., Jubilee Hills, Hyderabad"), "HYDERABAD");
    assert.equal(inferCity("West Mambalam, Chennai Central"), "CHENNAI");
  });
  it("infers the city from a recognised locality", () => {
    assert.equal(inferCity("Looking for 3 BHK in Jubilee hills"), "HYDERABAD");
    assert.equal(inferCity("2Bed Apartment for Rent Medavakkam"), "CHENNAI");
  });
  it("returns null when nothing resolves", () => {
    assert.equal(inferCity("Not answering whats app msg sent."), null);
  });
});

describe("findLocalities", () => {
  it("finds canonical locality names, city-scoped", () => {
    assert.deepEqual(findLocalities("3Bed Apartment for Sale in Jubilee Hills, Hyderabad", "HYDERABAD"), ["Jubilee Hills"]);
  });
  it("expands common Hyderabad shorthand", () => {
    const locs = findLocalities("requirement for 3bhk in JUB BAN", "HYDERABAD");
    assert.ok(locs.includes("Jubilee Hills"));
    assert.ok(locs.includes("Banjara Hills"));
  });
  it("excludes localities from the wrong city", () => {
    assert.deepEqual(findLocalities("Jubilee Hills", "CHENNAI"), []);
  });
});

describe("mapRawLeadToTeleduceLead", () => {
  it("maps a structured-field lead (Budget object, multi Bedrooms)", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD123",
      "First Name": "Deepika",
      "Last Name": "Reddy",
      Mobile: "9876543210",
      Email: "d@example.com",
      Budget: { amount: "300000", currency_code: "INR" },
      Bedrooms: "3 BHK, 4 BHK",
      "Property Type": "Apartment",
      "Lead Types": "Residential Rental",
      "Area of Interest": "Jubilee hills, Madhapur",
      "Lead Status": "Open",
      "Lead Source": "Housing",
      "Lead Owner": "owner@example.com",
      modified_at: "2026-06-17 13:38:51",
    });
    assert.equal(t.teleduceLeadId, "LD123");
    assert.equal(t.budget, 300000);
    assert.deepEqual(t.bedrooms, ["3 BHK", "4 BHK"]);
    assert.equal(t.propertyType, "Apartment");
    assert.equal(t.leadType, "Residential Rental");
    assert.equal(t.city, "Hyderabad");
    assert.ok(t.areaOfInterest.includes("Jubilee hills"));
    assert.equal(t.stageDisplay, "Not yet contacted");
    assert.ok(t.updatedAt.startsWith("2026-06-17T13:38:51"));
  });

  it("falls back to the free-text requirement when structured fields are blank", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD999",
      "First Name": "Lucky",
      Budget: { amount: "00", currency_code: "INR" }, // garbage zero → ignored
      Bedrooms: "",
      "Property Type": "",
      "Lead Types": "",
      "Area of Interest": "",
      "Lead Status": "Open",
      "Lead Requirement": "18500000, 3Bed  Apartment for Sale in Aditya Beaumont, Jubilee Hills, Hyderabad",
    });
    assert.equal(t.budget, 18500000);
    assert.deepEqual(t.bedrooms, ["3 BHK"]);
    assert.equal(t.propertyType, "Apartment");
    assert.equal(t.leadType, "Residential Sale");
    assert.equal(t.city, "Hyderabad");
    assert.ok(t.areaOfInterest.includes("Jubilee Hills"));
  });

  it("maps a 'Closed' status (no granular stage) to a non-active stage", () => {
    const t = mapRawLeadToTeleduceLead({ ID: "LD7", "First Name": "X", "Lead Status": "Closed", "Lead Requirement": "flat in Adyar" });
    assert.equal(t.stageDisplay, "Purchased elsewhere");
    assert.equal(t.city, "Chennai");
  });

  it("prefers the granular 'Leads Stages' field over coarse Lead Status (fixes won/lost)", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD8", "First Name": "X", "Lead Status": "Closed",
      "Leads Stages": "Registration completed", "Lead Requirement": "flat in Adyar",
    });
    assert.equal(t.stageDisplay, "Registration completed"); // WON, not "not interested"
    assert.equal(t.stageId, 14282);
  });

  it("keeps the structured budget EXACTLY as received (no clamping/alteration)", () => {
    const t = mapRawLeadToTeleduceLead({ ID: "LD9", "First Name": "X", Budget: { amount: "200000020000000" }, "Lead Requirement": "villa in Kokapet" });
    assert.equal(t.budget, 200000020000000); // recorded verbatim from Corefactors
    const t2 = mapRawLeadToTeleduceLead({ ID: "LD9b", "First Name": "X", Budget: { amount: "1800000000" } });
    assert.equal(t2.budget, 1800000000); // ₹180 Cr kept as-is
  });

  it("keeps the structured Lead Type as received even if the budget looks off-scale", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD10", "First Name": "X", "Lead Types": "Residential Rental",
      Budget: { amount: "20000000" }, "Area of Interest": "Jubilee hills",
    });
    assert.equal(t.leadType, "Residential Rental"); // verbatim — no budget-based flip
  });

  it("keeps the structured Lead Type verbatim even if the free text differs", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD11", "First Name": "X", "Lead Types": "Commercial Sale",
      "Lead Requirement": "Showrooms for Lease Nungambakkam, Chennai Central",
    });
    assert.equal(t.leadType, "Commercial Sale"); // received value is not overridden by free text
  });

  it("infers city from a recognised locality (the feed has no city field)", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD12", "First Name": "X",
      "Area of Interest": "ECR", // a Chennai locality
      "Lead Requirement": "wants villa in kollur hyderabad",
    });
    assert.equal(t.city, "Hyderabad"); // explicit "hyderabad" word resolves the city
  });

  it("preserves all Area of Interest tokens as received", () => {
    const t = mapRawLeadToTeleduceLead({
      ID: "LD13", "First Name": "X", "Lead Status": "Open",
      "Area of Interest": "Not contacted, Jubilee hills",
    });
    // tokens are kept verbatim; locality resolution (sync) simply ignores non-localities.
    assert.ok(t.areaOfInterest.includes("Not contacted"));
    assert.ok(t.areaOfInterest.includes("Jubilee hills"));
  });

  it("parses a full free-text requirement", () => {
    const r = parseRequirementText("375000,  Showrooms for Lease Nungambakkam, Chennai Central");
    assert.equal(r.priceInr, 375000);
    assert.equal(r.transaction, "RENT");
    assert.equal(r.propertyTypeLabel, "Retail");
    assert.equal(r.isCommercial, true);
    assert.equal(r.city, "CHENNAI");
  });
});

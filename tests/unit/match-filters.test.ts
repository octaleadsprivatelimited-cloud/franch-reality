import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseLeadMatchFilters } from "../../src/lib/match-filters";

describe("parseLeadMatchFilters", () => {
  test("uses the CRM requirement when custom mode is absent", () => {
    assert.equal(parseLeadMatchFilters({ propertyType: "VILLA" }), undefined);
  });

  test("preserves repeated negotiable filters", () => {
    const parsed = parseLeadMatchFilters({
      matchMode: "custom",
      city: "HYDERABAD",
      localityId: ["12", "18"],
      propertyType: ["APARTMENT", "VILLA"],
      transactionType: ["SALE", "RENT"],
      bhk: ["3", "4"],
      bhkFlex: "1",
      budgetFlex: "1",
    });

    assert.ok(parsed);
    assert.equal(parsed.city, "HYDERABAD");
    assert.deepEqual(parsed.localityIds, [12, 18]);
    assert.deepEqual(parsed.propertyTypes, ["APARTMENT", "VILLA"]);
    assert.deepEqual(parsed.transactionTypes, ["SALE", "RENT"]);
    assert.deepEqual(parsed.bhks, [3, 4]);
    assert.equal(parsed.bhkFlex, true);
    assert.equal(parsed.budgetFlex, true);
  });

  test("blank optional numbers stay unset instead of becoming zero", () => {
    const parsed = parseLeadMatchFilters({
      matchMode: "custom",
      budgetMin: "",
      budgetMax: "",
      builtUpAreaMin: "",
      parkingMin: "",
    });

    assert.ok(parsed);
    assert.equal(parsed.budgetMin, null);
    assert.equal(parsed.budgetMax, null);
    assert.equal(parsed.builtUpAreaMin, null);
    assert.equal(parsed.parkingMin, null);
  });
});

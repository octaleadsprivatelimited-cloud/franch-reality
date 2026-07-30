import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parsePriceCell, parseAmount, parsePropertyType } from "../../src/lib/import/book1";

// ── parsePriceCell: extracts number + any explicit unit ──────────────────────
describe("parsePriceCell", () => {
  test("detects Crore / Lakh / per-month units", () => {
    assert.deepEqual(parsePriceCell("1.2 Cr"), { num: 1.2, unit: "CRORE" });
    assert.deepEqual(parsePriceCell("85 Lakhs"), { num: 85, unit: "LAKH" });
    assert.deepEqual(parsePriceCell("₹85,00,000"), { num: 8500000, unit: null });
    assert.deepEqual(parsePriceCell("50000 per month"), { num: 50000, unit: "PER_MONTH" });
    assert.deepEqual(parsePriceCell("32k pm"), { num: 32000, unit: "PER_MONTH" });
  });
  test("a bare decimal has NO inferred unit", () => {
    assert.deepEqual(parsePriceCell("2.5"), { num: 2.5, unit: null });
  });
  test("blank / non-numeric → null", () => {
    assert.equal(parsePriceCell(""), null);
    assert.equal(parsePriceCell("blah"), null);
  });
});

// ── parseAmount: the money-safety contract (regression for the corruption bug) ─
describe("parseAmount (SALE safety)", () => {
  test("a bare small decimal is AMBIGUOUS, not ₹2.50", () => {
    // The bug: "2.5" (meaning 2.5 Cr) was stored as 2.5 rupees. Now it's rejected.
    assert.equal(parseAmount("2.5"), null);
    assert.equal(parseAmount("85"), null);
  });
  test("explicit units scale correctly", () => {
    assert.deepEqual(parseAmount("1.2 Cr"), { inr: 12000000, unit: "CRORE" });
    assert.deepEqual(parseAmount("85 Lakh"), { inr: 8500000, unit: "LAKH" });
  });
  test("a full absolute rupee figure is accepted as-is", () => {
    assert.deepEqual(parseAmount("9500000"), { inr: 9500000, unit: "LAKH" });
    assert.deepEqual(parseAmount("85,00,000"), { inr: 8500000, unit: "LAKH" });
  });
  test("a per-month amount is treated as rent (absolute monthly INR)", () => {
    assert.deepEqual(parseAmount("32000 per month"), { inr: 32000, unit: "PER_MONTH" });
  });
});

// ── parsePropertyType ────────────────────────────────────────────────────────
describe("parsePropertyType", () => {
  test("maps common labels to enum + usage", () => {
    assert.deepEqual(parsePropertyType("Apartment"), { type: "APARTMENT", usage: "RESIDENTIAL" });
    assert.deepEqual(parsePropertyType("Independent Villa"), { type: "VILLA", usage: "RESIDENTIAL" });
    assert.deepEqual(parsePropertyType("Open Plot"), { type: "PLOT", usage: "RESIDENTIAL" });
    assert.deepEqual(parsePropertyType("Office space"), { type: "COMMERCIAL", usage: "COMMERCIAL" });
    assert.equal(parsePropertyType("Spaceship"), null);
  });
});

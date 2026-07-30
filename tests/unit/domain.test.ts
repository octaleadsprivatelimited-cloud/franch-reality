import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  toInr,
  fromInr,
  formatPrice,
  formatBudgetRange,
  defaultPriceUnit,
} from "../../src/lib/domain";

// ── toInr / fromInr ──────────────────────────────────────────────────────────

describe("toInr", () => {
  test("LAKH → absolute INR", () => {
    assert.equal(toInr(80, "LAKH"), 80_00_000);
    assert.equal(toInr(1, "LAKH"), 1_00_000);
  });
  test("CRORE → absolute INR", () => {
    assert.equal(toInr(1.2, "CRORE"), 1_20_00_000);
    assert.equal(toInr(2, "CRORE"), 2_00_00_000);
  });
  test("PER_MONTH → identity", () => {
    assert.equal(toInr(45000, "PER_MONTH"), 45000);
  });
});

describe("fromInr", () => {
  test("inverse of toInr for each unit", () => {
    assert.equal(fromInr(80_00_000, "LAKH"), 80);
    assert.equal(fromInr(1_20_00_000, "CRORE"), 1.2);
    assert.equal(fromInr(45000, "PER_MONTH"), 45000);
  });
});

describe("toInr/fromInr round-trip", () => {
  const cases: Array<[number, "LAKH" | "CRORE" | "PER_MONTH"]> = [
    [80, "LAKH"],
    [1.2, "CRORE"],
    [3.75, "CRORE"],
    [45000, "PER_MONTH"],
    [125, "LAKH"],
  ];
  for (const [amount, unit] of cases) {
    test(`${amount} ${unit} survives round-trip`, () => {
      assert.equal(fromInr(toInr(amount, unit), unit), amount);
    });
  }
});

// ── formatPrice ──────────────────────────────────────────────────────────────

describe("formatPrice", () => {
  test("SALE ≥ 1 Cr renders in Cr (trailing zeros trimmed, per the mockup)", () => {
    assert.equal(formatPrice(1_20_00_000, "SALE"), "₹1.2 Cr");
    assert.equal(formatPrice(2_50_00_000, "SALE"), "₹2.5 Cr");
    assert.equal(formatPrice(1_85_00_000, "SALE"), "₹1.85 Cr");
  });
  test("SALE under 1 Cr renders in L", () => {
    // Whole lakhs → no decimals.
    assert.equal(formatPrice(80_00_000, "SALE"), "₹80 L");
    // Non-whole lakhs → 1 decimal.
    assert.equal(formatPrice(85_50_000, "SALE"), "₹85.5 L");
  });
  test("exactly 1 Cr crosses to Cr formatting", () => {
    assert.equal(formatPrice(1_00_00_000, "SALE"), "₹1 Cr");
  });
  test("a value just below 1 Cr rounds to '₹1 Cr', never '₹100.0 L'", () => {
    // Regression for the Cr-boundary bug.
    assert.equal(formatPrice(99_99_999, "SALE"), "₹1 Cr");
  });
  test("RENT renders monthly with /mo suffix", () => {
    const out = formatPrice(45000, "RENT");
    assert.ok(out.endsWith("/mo"), `expected /mo suffix, got ${out}`);
    assert.ok(out.includes("45,000"), `expected grouped rupees, got ${out}`);
  });
});

// ── formatBudgetRange ────────────────────────────────────────────────────────

describe("formatBudgetRange", () => {
  test("both bounds → 'min – max'", () => {
    assert.equal(
      formatBudgetRange(80_00_000, 1_20_00_000, "SALE"),
      "₹80 L – ₹1.2 Cr",
    );
  });
  test("min only → 'min+'", () => {
    assert.equal(formatBudgetRange(80_00_000, null, "SALE"), "₹80 L+");
  });
  test("max only → 'up to max'", () => {
    assert.equal(formatBudgetRange(null, 1_20_00_000, "SALE"), "up to ₹1.2 Cr");
  });
  test("no bounds → 'Any budget'", () => {
    assert.equal(formatBudgetRange(null, null, "SALE"), "Any budget");
    assert.equal(formatBudgetRange(null, null), "Any budget");
  });
  test("defaults transaction type to SALE when omitted", () => {
    assert.equal(formatBudgetRange(80_00_000, 1_20_00_000), "₹80 L – ₹1.2 Cr");
  });
});

// ── defaultPriceUnit ─────────────────────────────────────────────────────────

describe("defaultPriceUnit", () => {
  test("RENT → PER_MONTH regardless of amount", () => {
    assert.equal(defaultPriceUnit(45000, "RENT"), "PER_MONTH");
    assert.equal(defaultPriceUnit(5_00_00_000, "RENT"), "PER_MONTH");
  });
  test("SALE ≥ 1 Cr → CRORE", () => {
    assert.equal(defaultPriceUnit(1_00_00_000, "SALE"), "CRORE");
    assert.equal(defaultPriceUnit(2_50_00_000, "SALE"), "CRORE");
  });
  test("SALE under 1 Cr → LAKH", () => {
    assert.equal(defaultPriceUnit(80_00_000, "SALE"), "LAKH");
  });
});

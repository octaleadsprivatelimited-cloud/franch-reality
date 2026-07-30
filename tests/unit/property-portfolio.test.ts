import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import {
  buildPortfolioSections,
  buildPortfolioSummary,
  paginatePortfolioImages,
  portfolioDocumentLabel,
  type PortfolioProperty,
} from "../../src/lib/pdf/property-portfolio";

function property(
  overrides: Partial<PortfolioProperty> = {},
): PortfolioProperty {
  return {
    id: "p1",
    fileNo: "FR-001",
    reraId: null,
    city: "HYDERABAD",
    localityId: 1,
    transactionType: "SALE",
    propertyType: "APARTMENT",
    commercialOrResidential: "RESIDENTIAL",
    buildingClassification: "GATED_COMMUNITY",
    bhk: 3,
    builtUpAreaSqft: 1800,
    secondaryAreaSqft: 1450,
    facing: "East",
    floor: "8",
    parkingCount: 2,
    priceInr: new Prisma.Decimal(15_000_000),
    priceUnit: "CRORE",
    pricePerSqft: new Prisma.Decimal(8333),
    maintenanceAmount: new Prisma.Decimal(6000),
    ageYears: 4,
    furnishing: "SEMI_FURNISHED",
    featuresText: null,
    additionalFeatures: [],
    availabilityStatus: "AVAILABLE",
    builderDeveloperName: null,
    description: null,
    createdById: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
    locality: {
      id: 1,
      city: "HYDERABAD",
      name: "Kondapur",
      latitude: 17.47,
      longitude: 78.36,
      approxCoords: false,
      teleduceAreaOfInterestValue: "Kondapur",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
    ...overrides,
  };
}

function labels(p: PortfolioProperty): string[] {
  return buildPortfolioSections(p).flatMap((section) =>
    section.fields.map((field) => field.label),
  );
}

function values(p: PortfolioProperty): string[] {
  return buildPortfolioSections(p).flatMap((section) =>
    section.fields.map((field) => field.value),
  );
}

describe("property portfolio content", () => {
  test("apartment uses residential configuration and area labels", () => {
    const p = property();
    assert.ok(labels(p).includes("Configuration"));
    assert.ok(labels(p).includes("Built-up area"));
    assert.ok(labels(p).includes("Carpet / secondary area"));
    assert.ok(labels(p).includes("Furnishing"));
  });

  test("plot uses plot-specific fields and omits inapplicable residential details", () => {
    const p = property({
      propertyType: "PLOT",
      bhk: null,
      floor: "8",
      furnishing: "SEMI_FURNISHED",
      parkingCount: 2,
      ageYears: 4,
    });
    assert.ok(labels(p).includes("Plot area"));
    assert.equal(labels(p).includes("Configuration"), false);
    assert.equal(labels(p).includes("Floor"), false);
    assert.equal(labels(p).includes("Furnishing"), false);
    assert.equal(labels(p).includes("Parking"), false);
    assert.equal(labels(p).includes("Property age"), false);
  });

  test("commercial and rental documents use stored transaction data", () => {
    const p = property({
      propertyType: "COMMERCIAL",
      commercialOrResidential: "COMMERCIAL",
      transactionType: "RENT",
      priceInr: new Prisma.Decimal(75_000),
      priceUnit: "PER_MONTH",
      bhk: null,
    });
    assert.equal(portfolioDocumentLabel("COMMERCIAL", "RENT"), "Commercial rental portfolio");
    assert.ok(labels(p).includes("Monthly rent"));
    assert.ok(values(p).includes("Rs. 75,000 / month"));
  });

  test("summary values explain status, transaction and property type", () => {
    assert.deepEqual(buildPortfolioSummary(property()), [
      { label: "Availability status", value: "Available", accent: true },
      { label: "Transaction", value: "For sale" },
      { label: "Property type", value: "Apartment" },
    ]);
  });

  test("never manufactures growth, rating, verification or registration claims", () => {
    const text = JSON.stringify(buildPortfolioSections(property())).toLowerCase();
    for (const unsupported of [
      "growth",
      "appreciation",
      "rating",
      "gps",
      "verified",
      "registered",
    ]) {
      assert.equal(text.includes(unsupported), false, unsupported);
    }
  });

  test("paginates every listing image without an eight-image cap", () => {
    const images = Array.from({ length: 13 }, (_, index) => ({
      src: `data:image/jpeg;base64,image-${index + 1}`,
      label: `Property image ${index + 1}`,
    }));
    const result = paginatePortfolioImages(images);
    assert.equal(result.primaryImage?.label, "Property image 1");
    assert.deepEqual(result.galleryPages.map((page) => page.length), [4, 4, 4]);
    assert.equal(result.galleryPages.flat().length + 1, images.length);
  });
});

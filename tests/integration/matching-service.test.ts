import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

import type { SessionUser } from "../../src/lib/auth-helpers";
import type {
  getMatchesForLead as GetMatchesForLead,
  getMatchesForProperty as GetMatchesForProperty,
} from "../../src/lib/matching-service";
import { prisma, ITEST, cleanupItest } from "../helpers/db";

// matching-service.ts begins with `import "server-only"`, whose default build
// throws outside Next's server bundler. Neutralise it by pre-seeding the require
// cache with an empty module BEFORE the service is (dynamically) imported. This
// is a test-harness shim only — it does not touch source files.
function stubServerOnly(): void {
  const require = createRequire(process.cwd() + "/x.js");
  const resolved = require.resolve("server-only");
  (require as unknown as { cache: Record<string, unknown> }).cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: {},
  };
}

let getMatchesForLead: typeof GetMatchesForLead;
let getMatchesForProperty: typeof GetMatchesForProperty;

let leadId: string;
let propertyId: string;
let adminUser: SessionUser;

describe("matching-service (integration)", () => {
  before(async () => {
    stubServerOnly();
    const svc = await import("../../src/lib/matching-service");
    getMatchesForLead = svc.getMatchesForLead;
    getMatchesForProperty = svc.getMatchesForProperty;

    await cleanupItest();

    // A real seeded admin — getMatchesForLead/Property apply no city filter for ADMIN.
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    assert.ok(admin, "need a seeded ADMIN user");
    adminUser = {
      id: admin!.id,
      role: "ADMIN",
      cities: ["HYDERABAD", "CHENNAI"],
      email: "itest",
      name: "itest",
    };

    // Madhapur (Hyderabad) — a real seeded locality with a centroid.
    const locality = await prisma.locality.findFirst({
      where: { city: "HYDERABAD", name: "Madhapur" },
    });
    assert.ok(locality, "need seeded Madhapur locality");

    const lead = await prisma.lead.create({
      data: {
        teleduceLeadId: `${ITEST}MS-LEAD`,
        city: "HYDERABAD",
        firstName: "Itest",
        lastName: "MatchSvc",
        email: `${ITEST}ms@example.com`,
        budgetMin: 8_000_000,
        budgetMax: 12_000_000,
        transactionTypePref: "SALE",
        propertyTypePref: ["APARTMENT"],
        bhkPref: [3],
        currentStage: "Site visit scheduled", // an ACTIVE stage (property→leads visibility)
        isArchivedInTeleduce: false,
        // Preferred locality = the property's locality → Band 0.
        preferredLocalities: { connect: { id: locality!.id } },
      },
    });
    leadId = lead.id;

    const property = await prisma.property.create({
      data: {
        fileNo: `${ITEST}MS01`,
        city: "HYDERABAD",
        localityId: locality!.id,
        transactionType: "SALE",
        propertyType: "APARTMENT",
        bhk: 3,
        priceInr: 10_000_000, // inside the lead's ±10% budget window
        priceUnit: "CRORE",
        availabilityStatus: "AVAILABLE",
      },
    });
    propertyId = property.id;

  });

  after(async () => {
    // Connection teardown is owned centrally by tests/helpers/db.ts.
    await cleanupItest();
  });

  test("getMatchesForLead includes the property in Band 0", async () => {
    const result = await getMatchesForLead(adminUser, leadId);
    assert.ok(result, "lead match result returned");
    const band0 = result!.bands.find((b) => b.band === 0)!;
    const row = band0.rows.find((r) => r.property.id === propertyId);
    assert.ok(row, "property should appear in Band 0 (same preferred locality)");
    assert.equal(row!.distanceKm, 0);
    assert.equal(row!.criteria.localityExact, true);
    assert.equal(row!.criteria.bhkExact, true);
    assert.equal(row!.criteria.budgetInRange, true);
  });

  test("getMatchesForProperty includes the lead in Band 0", async () => {
    const result = await getMatchesForProperty(adminUser, propertyId);
    assert.ok(result, "property match result returned");
    const band0 = result!.bands.find((b) => b.band === 0)!;
    const row = band0.rows.find((r) => r.lead.id === leadId);
    assert.ok(row, "lead should appear in Band 0");
    assert.equal(row!.criteria.localityExact, true);
  });
});

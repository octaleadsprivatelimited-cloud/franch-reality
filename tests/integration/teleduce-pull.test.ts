import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

import type { TeleduceClient, TeleduceLead } from "../../src/lib/teleduce/types";
import { runTeleducePull } from "../../src/lib/teleduce/sync";
import { prisma, ITEST, cleanupItest, snapshotAuditIds, deleteNewAudit } from "../helpers/db";

function stubClient(leads: TeleduceLead[]): TeleduceClient {
  return {
    mode: "mock",
    canWriteback: true,
    async listLeads() {
      return leads.map((l) => ({ ...l }));
    },
    async updateLeadStage() {
      /* not exercised by the pull */
    },
  };
}

function itestLead(suffix: string, over: Partial<TeleduceLead> = {}): TeleduceLead {
  return {
    teleduceLeadId: `${ITEST}LEAD-${suffix}`,
    firstName: "Itest",
    lastName: suffix,
    mobile: null,
    email: `${ITEST}${suffix}@example.com`,
    budget: 12_000_000,
    city: "Hyderabad",
    areaOfInterest: ["Madhapur"],
    propertyType: "Apartment",
    bedrooms: ["3 BHK"],
    leadType: "Residential Sale",
    leadSource: "Itest",
    leadOwner: "Itest",
    stageId: 22042,
    stageDisplay: "Not yet contacted",
    updatedAt: "2026-06-10T09:00:00+05:30",
    raw: { source: "itest", suffix },
    ...over,
  };
}

const LEAD_A = itestLead("A", {
  city: "Hyderabad",
  areaOfInterest: ["Madhapur"],
  propertyType: "Apartment",
  bedrooms: ["3 BHK"],
  leadType: "Residential Sale",
  budget: 12_000_000,
});
const LEAD_B = itestLead("B", {
  city: "Chennai",
  areaOfInterest: ["Adyar"],
  propertyType: "Villa",
  bedrooms: ["4 BHK"],
  leadType: "Residential Rental",
  budget: 45_000,
});
const LEAD_C = itestLead("C", { city: "Hyderabad", areaOfInterest: ["Madhapur"] });
const LEAD_D = itestLead("D", { city: "Chennai", areaOfInterest: ["Velacherry"] });

// Confine soft-archive reconciliation to THIS test's own ITEST- leads so the
// retain-ratio math is local and deterministic regardless of how many real leads
// the shared DB holds — and so the test can never touch real/demo data.
const SCOPE = { teleduceLeadId: { startsWith: ITEST } } as const;

describe("runTeleducePull (integration)", () => {
  let preexistingSyncLogIds: Set<string>;
  let preexistingAuditIds: Set<string>;

  before(async () => {
    await cleanupItest();
    preexistingSyncLogIds = new Set(
      (await prisma.syncLog.findMany({ select: { id: true } })).map((s) => s.id),
    );
    preexistingAuditIds = await snapshotAuditIds();
  });

  // Each test starts from a clean ITEST baseline so they are order-independent and
  // leave no mock/test leads behind in the shared DB.
  beforeEach(async () => {
    await cleanupItest();
  });

  after(async () => {
    // Do NOT $disconnect here — the prisma client is shared across test files.
    await cleanupItest();
    const newLogs = await prisma.syncLog.findMany({
      where: { id: { notIn: [...preexistingSyncLogIds] } },
      select: { id: true },
    });
    if (newLogs.length) {
      await prisma.syncLog.deleteMany({ where: { id: { in: newLogs.map((s) => s.id) } } });
    }
    await deleteNewAudit(preexistingAuditIds);
  });

  test("pulls and maps new ITEST leads", async () => {
    const summary = await runTeleducePull({
      prisma,
      client: stubClient([LEAD_A, LEAD_B]),
      archiveScope: SCOPE,
    });
    assert.equal(summary.failed, 0, "no rows failed to map");

    const itestCount = await prisma.lead.count({ where: { teleduceLeadId: { startsWith: ITEST } } });
    assert.equal(itestCount, 2, "exactly the two ITEST leads exist");

    const a = await prisma.lead.findUnique({
      where: { teleduceLeadId: LEAD_A.teleduceLeadId },
      include: { preferredLocalities: true },
    });
    assert.ok(a, "lead A persisted");
    assert.equal(a!.city, "HYDERABAD");
    assert.equal(a!.transactionTypePref, "SALE"); // Residential Sale
    assert.deepEqual(a!.propertyTypePref, ["APARTMENT"]);
    assert.deepEqual(a!.bhkPref, [3]);
    // Budget stored VERBATIM as the ceiling: budgetMax = exact value, no fabricated min.
    assert.ok(
      a!.budgetMin == null && Number(a!.budgetMax) === 12_000_000,
      "budget stored verbatim as ceiling (no derived min/rounding)",
    );
    assert.ok(a!.preferredLocalities.some((l) => l.name === "Madhapur"), "connected to Madhapur");

    const b = await prisma.lead.findUnique({
      where: { teleduceLeadId: LEAD_B.teleduceLeadId },
      include: { preferredLocalities: true },
    });
    assert.ok(b, "lead B persisted");
    assert.equal(b!.city, "CHENNAI");
    assert.equal(b!.transactionTypePref, "RENT"); // Residential Rental
    assert.deepEqual(b!.propertyTypePref, ["VILLA"]);
    assert.deepEqual(b!.bhkPref, [4]);
    assert.ok(b!.preferredLocalities.some((l) => l.name === "Adyar"), "connected to Adyar");
  });

  test("mirrors Corefactors ownership and round-robins only ownerless leads", async () => {
    const corefactorsAgent = await prisma.user.findUnique({
      where: { email: "hyderabad.agent@example.com" },
      select: { id: true, isActive: true },
    });
    assert.ok(corefactorsAgent?.isActive, "the matching Corefactors agent account is active");

    const owned = itestLead("OWNED", {
      leadOwner: "hyderabad.agent@example.com",
    });
    const unmatched = itestLead("UNMATCHED", {
      leadOwner: "external.owner@example.com",
    });
    const ownerless = itestLead("OWNERLESS", {
      leadOwner: null,
    });

    const summary = await runTeleducePull({
      prisma,
      client: stubClient([owned, unmatched, ownerless]),
      archiveScope: SCOPE,
    });
    assert.equal(summary.failed, 0);

    const [savedOwned, savedUnmatched, savedOwnerless] = await Promise.all([
      prisma.lead.findUnique({ where: { teleduceLeadId: owned.teleduceLeadId } }),
      prisma.lead.findUnique({ where: { teleduceLeadId: unmatched.teleduceLeadId } }),
      prisma.lead.findUnique({ where: { teleduceLeadId: ownerless.teleduceLeadId } }),
    ]);

    assert.equal(savedOwned?.assignedAgentId, corefactorsAgent.id);
    assert.equal(savedOwned?.assignmentSource, "COFACTORS");
    assert.equal(savedOwned?.leadOwner, "hyderabad.agent@example.com");

    assert.equal(savedUnmatched?.assignedAgentId, null);
    assert.equal(savedUnmatched?.assignmentSource, null);
    assert.equal(savedUnmatched?.leadOwner, "external.owner@example.com");

    assert.ok(savedOwnerless?.assignedAgentId, "an ownerless lead receives a local agent");
    assert.equal(savedOwnerless?.assignmentSource, "ROUND_ROBIN");
    assert.equal(savedOwnerless?.leadOwner, null);
  });

  test("soft-archives a disappeared lead (>=50% retain guard satisfied)", async () => {
    // Baseline of 4 ITEST leads, then a pull WITHOUT one of them. seen (3) >= 50%
    // of the in-scope active set (4) → the disappeared lead is soft-archived.
    await runTeleducePull({ prisma, client: stubClient([LEAD_A, LEAD_B, LEAD_C, LEAD_D]), archiveScope: SCOPE });
    const summary = await runTeleducePull({ prisma, client: stubClient([LEAD_A, LEAD_B, LEAD_C]), archiveScope: SCOPE });
    assert.equal(summary.archived, 1, "exactly the disappeared lead is archived");

    const a = await prisma.lead.findUnique({ where: { teleduceLeadId: LEAD_A.teleduceLeadId } });
    const d = await prisma.lead.findUnique({ where: { teleduceLeadId: LEAD_D.teleduceLeadId } });
    assert.equal(a!.isArchivedInTeleduce, false, "still-present LEAD_A stays active");
    assert.equal(d!.isArchivedInTeleduce, true, "disappeared LEAD_D soft-archived");
  });

  test("skips archiving when the pulled set is implausibly small (<50% guard)", async () => {
    // Baseline of 4, then a TINY pull (1 of 4). seen (1) < 50% of 4 → guard trips.
    await runTeleducePull({ prisma, client: stubClient([LEAD_A, LEAD_B, LEAD_C, LEAD_D]), archiveScope: SCOPE });
    const summary = await runTeleducePull({ prisma, client: stubClient([LEAD_A]), archiveScope: SCOPE });

    assert.equal(summary.archived, 0, "nothing archived when guard trips");

    const log = await prisma.syncLog.findFirst({
      where: { syncType: "TELEDUCE_PULL" },
      orderBy: { startedAt: "desc" },
    });
    assert.equal(log!.status, "PARTIAL", "implausibly-small pull marked PARTIAL");
    assert.match(log!.message ?? "", /archive skipped/i, "message notes archive was skipped");

    // A lead absent from the tiny pull must NOT have been mass-archived.
    const b = await prisma.lead.findUnique({ where: { teleduceLeadId: LEAD_B.teleduceLeadId } });
    assert.equal(b!.isArchivedInTeleduce, false, "guard prevented mass-archive");
  });
});

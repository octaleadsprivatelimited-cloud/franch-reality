import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

import type { TeleduceClient } from "../../src/lib/teleduce/types";
import { triggerWriteback } from "../../src/lib/teleduce/writeback";
import { prisma, ITEST, cleanupItest, snapshotAuditIds, deleteNewAudit } from "../helpers/db";

const SUCCEEDING: TeleduceClient = {
  mode: "mock",
  canWriteback: true,
  async listLeads() {
    return [];
  },
  async updateLeadStage() {
    /* resolves → success */
  },
};

const THROWING: TeleduceClient = {
  mode: "mock",
  canWriteback: true,
  async listLeads() {
    return [];
  },
  async updateLeadStage() {
    throw new Error("simulated CRM outage");
  },
};

let leadId: string;
let propertyId: string;
let matchId: string;
let localityId: number;
let preexistingAuditIds: Set<string>;

describe("triggerWriteback (integration)", () => {
  before(async () => {
    await cleanupItest();
    preexistingAuditIds = await snapshotAuditIds();

    const locality = await prisma.locality.findFirst({
      where: { city: "HYDERABAD" },
    });
    assert.ok(locality, "need a seeded HYDERABAD locality");
    localityId = locality!.id;

    const lead = await prisma.lead.create({
      data: {
        teleduceLeadId: `${ITEST}WB-LEAD`,
        city: "HYDERABAD",
        firstName: "Itest",
        lastName: "Writeback",
        email: `${ITEST}wb@example.com`,
        budgetMin: 8_000_000,
        budgetMax: 12_000_000,
        transactionTypePref: "SALE",
        propertyTypePref: ["APARTMENT"],
        bhkPref: [3],
        currentStage: "Site visit scheduled",
      },
    });
    leadId = lead.id;

    const property = await prisma.property.create({
      data: {
        fileNo: `${ITEST}WB01`,
        city: "HYDERABAD",
        localityId,
        transactionType: "SALE",
        propertyType: "APARTMENT",
        bhk: 3,
        priceInr: 10_000_000,
        priceUnit: "CRORE",
        availabilityStatus: "AVAILABLE",
      },
    });
    propertyId = property.id;

    const match = await prisma.match.create({
      data: {
        leadId,
        propertyId,
        band: 0,
        criteriaSnapshot: {},
        status: "SHARED",
        teleduceWritebackStatus: "PENDING",
      },
    });
    matchId = match.id;
  });

  after(async () => {
    // Connection teardown is owned centrally by tests/helpers/db.ts.
    await cleanupItest();
    await deleteNewAudit(preexistingAuditIds);
  });

  test("SHARED + succeeding client → SUCCESS, writebackAt set", async () => {
    const res = await triggerWriteback(matchId, { prisma, client: SUCCEEDING });
    assert.equal(res.status, "SUCCESS");

    const m = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(m!.teleduceWritebackStatus, "SUCCESS");
    assert.ok(m!.teleduceWritebackAt instanceof Date, "teleduceWritebackAt set");
    assert.equal(m!.teleduceWritebackNextRetryAt, null);
  });

  test("transient failure stays PENDING, increments attempts, schedules retry (NOT terminal)", async () => {
    // Reset to a fresh SHARED/PENDING state.
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "SHARED",
        teleduceWritebackStatus: "PENDING",
        teleduceWritebackAttempts: 0,
        teleduceWritebackNextRetryAt: null,
        teleduceWritebackAt: null,
      },
    });

    const t1 = Date.now();
    const res = await triggerWriteback(matchId, { prisma, client: THROWING });
    assert.equal(res.status, "PENDING", "transient error must stay retryable");

    const m = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(m!.teleduceWritebackStatus, "PENDING");
    assert.equal(m!.teleduceWritebackAttempts, 1, "attempts incremented");
    assert.ok(m!.teleduceWritebackNextRetryAt instanceof Date, "nextRetryAt scheduled (backoff)");
    const delay1 = m!.teleduceWritebackNextRetryAt!.getTime() - t1;
    assert.ok(delay1 > 0, "nextRetryAt is in the future");

    // Simulate the backoff having elapsed (the cron only calls triggerWriteback for
    // rows whose nextRetryAt is due; triggerWriteback also claims the row to prevent
    // a concurrent double-send, so a retry must be DUE to proceed).
    await prisma.match.update({
      where: { id: matchId },
      data: { teleduceWritebackNextRetryAt: new Date(Date.now() - 1000) },
    });

    // A second transient failure increments again, still PENDING (not terminal),
    // and the backoff GROWS (exponential: attempt-2 delay > attempt-1 delay).
    const t2 = Date.now();
    const res2 = await triggerWriteback(matchId, { prisma, client: THROWING });
    assert.equal(res2.status, "PENDING");
    const m2 = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(m2!.teleduceWritebackAttempts, 2);
    assert.equal(m2!.teleduceWritebackStatus, "PENDING");
    const delay2 = m2!.teleduceWritebackNextRetryAt!.getTime() - t2;
    assert.ok(delay2 > delay1, "backoff grows with each attempt");
  });

  test("gives up to terminal FAILED after the attempt cap", async () => {
    // Seed attempts at cap-1 (7) so the next throwing call reaches the cap (8).
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "SHARED",
        teleduceWritebackStatus: "PENDING",
        teleduceWritebackAttempts: 7,
        teleduceWritebackNextRetryAt: new Date(),
      },
    });

    const res = await triggerWriteback(matchId, { prisma, client: THROWING });
    assert.equal(res.status, "FAILED", "cap reached → terminal FAILED");

    const m = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(m!.teleduceWritebackStatus, "FAILED");
    assert.equal(m!.teleduceWritebackAttempts, 8);
    assert.equal(m!.teleduceWritebackNextRetryAt, null, "terminal → no further retry scheduled");
  });

  test("lead without a Teleduce id → terminal FAILED (cannot push)", async () => {
    const lead2 = await prisma.lead.create({
      data: {
        // no teleduceLeadId — a lead never synced from the CRM
        city: "HYDERABAD",
        firstName: "Itest",
        lastName: "NoTeleduceId",
        email: `${ITEST}notd@example.com`,
        currentStage: "Site visit scheduled",
      },
    });
    const match2 = await prisma.match.create({
      data: {
        leadId: lead2.id,
        propertyId,
        band: 0,
        criteriaSnapshot: {},
        status: "SHARED",
        teleduceWritebackStatus: "PENDING",
      },
    });

    const res = await triggerWriteback(match2.id, { prisma, client: SUCCEEDING });
    assert.equal(res.status, "FAILED");

    const m = await prisma.match.findUnique({ where: { id: match2.id } });
    assert.equal(m!.teleduceWritebackStatus, "FAILED");
    assert.equal(m!.teleduceWritebackNextRetryAt, null, "permanent failure → no retry scheduled");
  });

  test("SHORTLISTED → NOT_REQUIRED (nothing to push)", async () => {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "SHORTLISTED", teleduceWritebackStatus: "PENDING" },
    });

    const res = await triggerWriteback(matchId, { prisma, client: SUCCEEDING });
    assert.equal(res.status, "NOT_REQUIRED");

    const m = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(m!.teleduceWritebackStatus, "NOT_REQUIRED");
    assert.equal(m!.teleduceWritebackAt, null);
    assert.equal(m!.teleduceWritebackNextRetryAt, null);
  });
});

import type { PrismaClient, WritebackStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { teleduceStageForMatch } from "@/lib/teleduce/mapping";
import { getTeleduceClient, type TeleduceClient } from "@/lib/teleduce/client";
import { writeAudit } from "@/lib/audit";

export interface WritebackResult {
  status: WritebackStatus;
  message?: string;
}

// Retry queue with exponential backoff. A transient
// push error keeps the match PENDING with a growing next-retry delay; the cron
// re-attempts it once due. After MAX_ATTEMPTS we give up to a terminal FAILED so
// the UI badge signals a human-needed failure instead of hammering forever.
const MAX_WRITEBACK_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 10 * 60_000; // 10 min
const MAX_BACKOFF_MS = 6 * 60 * 60_000; // 6 h
// Lease window: claiming a row pushes its next-retry into the near future so a
// concurrent writer (immediate trigger vs the 30-min cron) can't double-send.
const CLAIM_LEASE_MS = 2 * 60_000; // 2 min

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Push a single match's status to the lead's Teleduce pipeline stage and record
 * the outcome on the Match. Called immediately when an agent marks Shared/Closed
 * (so the CRM updates within seconds) and again by the cron retry pass. Never
 * throws. Failure handling:
 *   - SHORTLISTED            → NOT_REQUIRED (nothing to push)
 *   - lead has no Teleduce id → terminal FAILED (can never be pushed)
 *   - transient push error    → stays PENDING with exponential-backoff nextRetryAt
 *   - too many attempts       → terminal FAILED (give up)
 */
export async function triggerWriteback(
  matchId: string,
  opts: { prisma?: PrismaClient; client?: TeleduceClient } = {},
): Promise<WritebackResult> {
  const db = opts.prisma ?? defaultPrisma;
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { lead: { select: { teleduceLeadId: true } } },
  });
  if (!match) return { status: "FAILED", message: "Match not found" };

  const stage = teleduceStageForMatch(match.status);
  if (!stage) {
    await db.match.update({
      where: { id: matchId },
      data: {
        teleduceWritebackStatus: "NOT_REQUIRED",
        teleduceWritebackAt: null,
        teleduceWritebackNextRetryAt: null,
      },
    });
    return { status: "NOT_REQUIRED" };
  }

  if (!match.lead.teleduceLeadId) {
    // Permanent: a lead never synced from the CRM cannot be written back.
    await db.match.update({
      where: { id: matchId },
      data: { teleduceWritebackStatus: "FAILED", teleduceWritebackNextRetryAt: null },
    });
    return { status: "FAILED", message: "Lead has no Teleduce id (not synced from CRM)" };
  }

  // The live Corefactors integration is read-only until a stage-update API is
  // provided: record the intent as a clean PENDING (no attempts, no retry churn)
  // so the decision is captured and the UI shows it awaiting CRM writeback —
  // pending provider-owned integration.
  const client = opts.client ?? getTeleduceClient();
  if (!client.canWriteback) {
    await db.match.update({
      where: { id: matchId },
      data: {
        teleduceWritebackStatus: "PENDING",
        teleduceWritebackAt: null,
        teleduceWritebackNextRetryAt: null,
      },
    });
    return { status: "PENDING", message: "Teleduce stage-update API not available yet — recorded as pending." };
  }

  // Atomic claim (compare-and-set on the existing next-retry column): exactly one
  // writer wins; the other backs off. Prevents the immediate trigger and the cron
  // from both PUTting the same stage change. The first push of a freshly-actioned
  // match has nextRetryAt = null, which this matches.
  const now = Date.now();
  const claim = await db.match.updateMany({
    where: {
      id: matchId,
      teleduceWritebackStatus: "PENDING",
      OR: [
        { teleduceWritebackNextRetryAt: null },
        { teleduceWritebackNextRetryAt: { lte: new Date(now) } },
      ],
    },
    data: { teleduceWritebackNextRetryAt: new Date(now + CLAIM_LEASE_MS) },
  });
  if (claim.count === 0) {
    // Another worker is mid-flight (or it's not due yet) — leave it to them.
    return { status: "PENDING", message: "Writeback already in progress" };
  }

  try {
    await client.updateLeadStage(match.lead.teleduceLeadId, stage.id, stage.display);
    await db.match.update({
      where: { id: matchId },
      data: {
        teleduceWritebackStatus: "SUCCESS",
        teleduceWritebackAt: new Date(),
        teleduceWritebackNextRetryAt: null,
      },
    });
    // Audit the CRM-affecting state change.
    await writeAudit(
      {
        userId: null,
        action: "Teleduce stage updated",
        entityType: "Match",
        entityId: matchId,
        after: { teleduceLeadId: match.lead.teleduceLeadId, stage: stage.display, mode: client.mode },
      },
      db,
    );
    return { status: "SUCCESS" };
  } catch (e) {
    const attempts = (match.teleduceWritebackAttempts ?? 0) + 1;
    const message = e instanceof Error ? e.message : String(e);
    if (attempts >= MAX_WRITEBACK_ATTEMPTS) {
      // Give up — terminal failure, surfaced in the UI for manual handling.
      await db.match.update({
        where: { id: matchId },
        data: {
          teleduceWritebackStatus: "FAILED",
          teleduceWritebackAttempts: attempts,
          teleduceWritebackNextRetryAt: null,
        },
      });
      await writeAudit(
        {
          userId: null,
          action: "Teleduce writeback failed",
          entityType: "Match",
          entityId: matchId,
          after: { attempts, error: message },
        },
        db,
      );
      return { status: "FAILED", message };
    }
    // Transient — keep PENDING so the cron retries once the backoff elapses.
    await db.match.update({
      where: { id: matchId },
      data: {
        teleduceWritebackStatus: "PENDING",
        teleduceWritebackAttempts: attempts,
        teleduceWritebackNextRetryAt: new Date(Date.now() + backoffMs(attempts)),
      },
    });
    return { status: "PENDING", message };
  }
}

/**
 * Cron retry pass: re-attempt PENDING writebacks whose backoff has elapsed.
 * (retryFailed re-attempts terminal FAILED too — for manual/ops use only.)
 * Wrapped in a SyncLog(TELEDUCE_WRITEBACK) for observability.
 */
export async function processPendingWritebacks(
  opts: { prisma?: PrismaClient; client?: TeleduceClient; retryFailed?: boolean } = {},
): Promise<{ processed: number; success: number; failed: number; pending: number }> {
  const db = opts.prisma ?? defaultPrisma;
  const client = opts.client ?? getTeleduceClient();
  // Read-only integration: nothing to push, leave PENDING intents untouched so the
  // cron doesn't spin or log empty writeback batches every run.
  if (!client.canWriteback) return { processed: 0, success: 0, failed: 0, pending: 0 };
  const statuses: WritebackStatus[] = opts.retryFailed ? ["PENDING", "FAILED"] : ["PENDING"];
  const now = new Date();

  const due = await db.match.findMany({
    where: {
      teleduceWritebackStatus: { in: statuses },
      OR: [
        { teleduceWritebackNextRetryAt: null },
        { teleduceWritebackNextRetryAt: { lte: now } },
      ],
    },
    select: { id: true },
  });
  if (due.length === 0) return { processed: 0, success: 0, failed: 0, pending: 0 };

  const sync = await db.syncLog.create({
    data: { syncType: "TELEDUCE_WRITEBACK", status: "RUNNING" },
  });

  let success = 0;
  let failed = 0;
  let pending = 0;
  for (const m of due) {
    const res = await triggerWriteback(m.id, { prisma: db, client });
    if (res.status === "SUCCESS") success++;
    else if (res.status === "FAILED") failed++;
    else if (res.status === "PENDING") pending++;
  }

  await db.syncLog.update({
    where: { id: sync.id },
    data: {
      status: failed > 0 ? "PARTIAL" : "SUCCESS",
      finishedAt: new Date(),
      recordsProcessed: success,
      recordsFailed: failed,
      message: `Writeback batch [${client.mode}] — ${success} ok, ${pending} re-queued, ${failed} failed of ${due.length}`,
    },
  });

  return { processed: due.length, success, failed, pending };
}

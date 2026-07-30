import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

// NOTE: intentionally no `import "server-only"` here — this module is imported by
// server-side sync/writeback code that is exercised by the (non-RSC) test runner.
// It is only ever used from server actions / route handlers / jobs.

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
}

// Best-effort source IP from the current request. Returns null outside a request
// context (cron jobs, the test runner) — next/headers throws there, so we swallow it.
async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Write an audit row. Pass a transaction client (`db`) to make the audit atomic
 * with the entity mutation it describes — so a state change can never persist
 * without its audit record (and vice-versa). The source IP is auto-captured from
 * the request when not supplied.
 */
export async function writeAudit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  const ipAddress = entry.ipAddress ?? (await requestIp());
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeJson: entry.before ?? undefined,
      afterJson: entry.after ?? undefined,
      ipAddress,
    },
  });
}

import { PrismaClient } from "@prisma/client";

// Integration tests run against the REAL seeded database. Load env exactly like
// the verify scripts do so DATABASE_URL is present when run via `tsx --test`.
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

// One shared client across all integration test files. When the runner executes
// several test files in a SINGLE process (e.g. `tsx --test tests/**/*.test.ts`),
// a per-file `$disconnect()` in one file's `after()` hook would tear down the
// connection another file is still using — a race that surfaces as flaky failures.
// So we own disconnection centrally: disconnect exactly once as the process winds
// down, and individual test files must NOT call `$disconnect()` themselves.
export const prisma = new PrismaClient();

let disconnected = false;
async function disconnectOnce(): Promise<void> {
  if (disconnected) return;
  disconnected = true;
  await prisma.$disconnect();
}
process.once("beforeExit", () => {
  void disconnectOnce();
});

/** Prefix every record an integration test creates so cleanup can target ONLY them. */
export const ITEST = "ITEST-";

/**
 * Delete every record any integration test could have created, in FK-safe order:
 * matches (children of leads/properties) → leads / properties → sync logs.
 * Scoped strictly to ITEST- prefixed records so seeded/showcase data is never touched.
 */
export async function cleanupItest(): Promise<void> {
  // Matches first — they reference both leads and properties. A match qualifies as
  // ours if EITHER side is an ITEST record (covers any pairing we create).
  await prisma.match.deleteMany({
    where: {
      OR: [
        { lead: { teleduceLeadId: { startsWith: ITEST } } },
        { lead: { email: { startsWith: ITEST } } },
        { property: { fileNo: { startsWith: ITEST } } },
      ],
    },
  });

  // Leads we created: identified by ITEST teleduceLeadId or ITEST email.
  await prisma.lead.deleteMany({
    where: {
      OR: [
        { teleduceLeadId: { startsWith: ITEST } },
        { email: { startsWith: ITEST } },
      ],
    },
  });

  // Properties we created: identified by ITEST fileNo.
  await prisma.property.deleteMany({
    where: { fileNo: { startsWith: ITEST } },
  });

}

/**
 * Delete specific SyncLog rows by id. `runTeleducePull` / `processPendingWritebacks`
 * build their own message strings, so tests capture the ids of the logs they create
 * and hand them here for cleanup.
 */
export async function deleteSyncLogs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.syncLog.deleteMany({ where: { id: { in: ids } } });
}

/**
 * AuditLog cleanup for tests: sync/writeback code writes audit rows that aren't
 * tied to an ITEST prefix, so snapshot the pre-existing ids in `before()` and
 * delete any new ones in `after()` — otherwise test runs pollute the real audit
 * log (e.g. with "Teleduce sync completed [mock]" entries).
 */
export async function snapshotAuditIds(): Promise<Set<string>> {
  return new Set((await prisma.auditLog.findMany({ select: { id: true } })).map((a) => a.id));
}
export async function deleteNewAudit(before: Set<string>): Promise<void> {
  const all = await prisma.auditLog.findMany({ select: { id: true } });
  const newIds = all.filter((a) => !before.has(a.id)).map((a) => a.id);
  if (newIds.length) await prisma.auditLog.deleteMany({ where: { id: { in: newIds } } });
}

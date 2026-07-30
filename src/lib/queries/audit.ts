import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditFilter } from "@/lib/validation/audit";

export const AUDIT_PAGE_SIZE = 25;

// Franch Realty operates in IST (Hyderabad/Chennai). A `<input type="date">`
// submits a bare YYYY-MM-DD, which `new Date()` would parse as UTC midnight —
// mixing that with a local-time endOfDay gives a window skewed by the server's
// timezone offset. Instead we anchor BOTH bounds to the IST business day,
// independent of the host timezone, and ignore malformed values (no throw).
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istBoundary(value: string | undefined, end: boolean): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utcMs = end
    ? Date.UTC(y, mo - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(utcMs)) return undefined;
  return new Date(utcMs - IST_OFFSET_MS); // shift the IST wall-clock instant to UTC
}

export async function listAuditLogs(filter: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.action) where.action = { contains: filter.action, mode: "insensitive" };
  if (filter.userId) where.userId = filter.userId;

  const from = istBoundary(filter.from, false);
  const to = istBoundary(filter.to, true);
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    where.createdAt = createdAt;
  }

  const page = Math.max(1, filter.page || 1);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    pageCount: Math.ceil(total / AUDIT_PAGE_SIZE),
  };
}

/** Distinct entity types present in the log, for the filter dropdown. */
export async function getAuditEntityTypes(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}

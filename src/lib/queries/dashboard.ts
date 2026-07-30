import "server-only";
import type { AvailabilityStatus, City } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth-helpers";
import { TELEDUCE_STAGES } from "@/lib/teleduce/mapping";
import { getTeleduceSyncStatus, type TeleduceSyncMode } from "@/lib/queries/sync-status";

const CLOSED_STAGES = TELEDUCE_STAGES.filter((s) => !s.isActive).map((s) => s.display);

export interface DashboardData {
  inventoryByStatus: Record<AvailabilityStatus, number>;
  totalProperties: number;
  activeLeads: number;
  matchesThisWeek: number;
  sync: {
    lastRunAt: Date | null;
    status: string | null;
    recordsProcessed: number | null;
    ageMinutes: number | null;
    /** How leads are flowing in: real-time webhook, scheduled pull, or mock. */
    mode: TeleduceSyncMode;
    /** Last real-time webhook delivery (null if none / not real-time). */
    lastWebhookAt: Date | null;
  };
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    createdAt: Date;
    userName: string | null;
  }[];
}

function cityFilter(user: SessionUser): City[] | undefined {
  return user.role === "ADMIN" ? undefined : user.cities;
}

export async function getDashboardData(user: SessionUser): Promise<DashboardData> {
  const cities = cityFilter(user);
  const propWhere = { deletedAt: null, ...(cities ? { city: { in: cities } } : {}) };
  const leadWhere = cities ? { city: { in: cities } } : {};
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byStatus, totalProperties, activeLeads, matchesThisWeek, lastSync, lastSuccess, activity, syncStatus] =
    await Promise.all([
      prisma.property.groupBy({
        by: ["availabilityStatus"],
        where: propWhere,
        _count: { _all: true },
      }),
      prisma.property.count({ where: propWhere }),
      prisma.lead.count({
        where: {
          ...leadWhere,
          isArchivedInTeleduce: false,
          currentStage: { notIn: CLOSED_STAGES },
        },
      }),
      prisma.match.count({
        where: {
          createdAt: { gte: weekAgo },
          // Count only matches on live (non-soft-deleted) properties, city-scoped.
          property: { deletedAt: null, ...(cities ? { city: { in: cities } } : {}) },
        },
      }),
      prisma.syncLog.findFirst({
        where: { syncType: "TELEDUCE_PULL" },
        orderBy: { startedAt: "desc" },
      }),
      // Last run that actually produced data — drives drift ("synced N min ago"),
      // so a FAILED/RUNNING latest run doesn't reset the staleness clock.
      prisma.syncLog.findFirst({
        where: { syncType: "TELEDUCE_PULL", status: { in: ["SUCCESS", "PARTIAL"] } },
        orderBy: { finishedAt: "desc" },
      }),
      getRecentActivity(cities),
      getTeleduceSyncStatus(),
    ]);

  const inventoryByStatus: Record<AvailabilityStatus, number> = {
    AVAILABLE: 0,
    BOOKED: 0,
    SOLD: 0,
    RENTED: 0,
  };
  for (const row of byStatus) {
    inventoryByStatus[row.availabilityStatus] = row._count._all;
  }

  return {
    inventoryByStatus,
    totalProperties,
    activeLeads,
    matchesThisWeek,
    sync: {
      // Drift anchored on the last SUCCESSFUL/PARTIAL run; status reflects the
      // latest run (so a fresh failure still shows as unhealthy on the tile).
      lastRunAt: lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt) : null,
      status: lastSync?.status ?? null,
      recordsProcessed: lastSuccess?.recordsProcessed ?? null,
      ageMinutes: lastSuccess
        ? Math.round((Date.now() - (lastSuccess.finishedAt ?? lastSuccess.startedAt).getTime()) / 60000)
        : null,
      mode: syncStatus.mode,
      lastWebhookAt: syncStatus.lastWebhookAt,
    },
    recentActivity: activity,
  };
}

type Activity = DashboardData["recentActivity"][number];

/**
 * Recent-activity feed, CITY-SCOPED for agents. Admins see everything (incl. user-
 * management events). Agents only see actions on Property/Lead/Match entities in
 * THEIR cities — never other-city activity or admin-only User events. Because
 * audit_log doesn't store a city, we resolve each entity's city and filter.
 */
async function getRecentActivity(cities: City[] | undefined): Promise<Activity[]> {
  if (!cities) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt,
      userName: a.user?.fullName ?? null,
    }));
  }

  // Agent: pull a wider window of NON-user events, resolve city, keep in-scope.
  const rows = await prisma.auditLog.findMany({
    where: { entityType: { in: ["Property", "Lead", "Match"] } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: { select: { fullName: true } } },
  });

  const ids = (t: string) =>
    rows.filter((r) => r.entityType === t && r.entityId).map((r) => r.entityId as string);
  const [props, leads, matches] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: ids("Property") } }, select: { id: true, city: true } }),
    prisma.lead.findMany({ where: { id: { in: ids("Lead") } }, select: { id: true, city: true } }),
    prisma.match.findMany({
      where: { id: { in: ids("Match") } },
      select: { id: true, property: { select: { city: true } } },
    }),
  ]);
  const cityOf = new Map<string, City>();
  for (const p of props) cityOf.set(`Property:${p.id}`, p.city);
  for (const l of leads) cityOf.set(`Lead:${l.id}`, l.city);
  for (const m of matches) cityOf.set(`Match:${m.id}`, m.property.city);

  const scope = new Set(cities);
  return rows
    .filter((r) => {
      const c = r.entityId ? cityOf.get(`${r.entityType}:${r.entityId}`) : undefined;
      return c != null && scope.has(c);
    })
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt,
      userName: a.user?.fullName ?? null,
    }));
}

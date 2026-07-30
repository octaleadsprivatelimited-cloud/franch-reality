import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Building2, Users, GitCompareArrows, RefreshCw } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { getDashboardData } from "@/lib/queries/dashboard";
import { availabilityLabel, cityLabel } from "@/lib/domain";
import { SyncNowButton } from "@/components/teleduce/SyncNowButton";
import type { AvailabilityStatus } from "@prisma/client";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user);

  const firstName = user.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting();
  const scopeLabel =
    user.role === "ADMIN"
      ? "All cities"
      : user.cities.map((c) => cityLabel[c]).join(" & ");
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const syncHealthy =
    data.sync.ageMinutes != null &&
    data.sync.ageMinutes <= 45 &&
    data.sync.status === "SUCCESS";
  const syncValue = data.sync.lastRunAt
    ? syncHealthy
      ? "Healthy"
      : "Attention"
    : "Idle";
  const syncDelta = data.sync.lastRunAt
    ? `Synced ${formatDistanceToNow(data.sync.lastRunAt, { addSuffix: true })}`
    : null;

  const STATUS_ORDER: AvailabilityStatus[] = ["AVAILABLE", "BOOKED", "SOLD", "RENTED"];
  const statusColor: Record<AvailabilityStatus, string> = {
    AVAILABLE: "var(--good)",
    BOOKED: "var(--warn)",
    SOLD: "var(--ink-fade)",
    RENTED: "var(--info)",
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            {greeting}, {firstName}
          </h1>
          <div className="subtitle">
            {scopeLabel} · {today}
          </div>
        </div>
        <div className="page-actions">
          <Link href="/inventory/import" className="btn">
            Import Excel
          </Link>
          <Link href="/inventory/new" className="btn-primary">
            + Add Property
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-icon">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="kpi-label">Total inventory</div>
          <div className="kpi-value">{data.totalProperties}</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon">
            <Users className="h-4 w-4" />
          </div>
          <div className="kpi-label">Active leads</div>
          <div className="kpi-value">{data.activeLeads}</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon">
            <GitCompareArrows className="h-4 w-4" />
          </div>
          <div className="kpi-label">Matches this week</div>
          <div className="kpi-value">{data.matchesThisWeek}</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="kpi-label">Sync health</div>
          <div className="kpi-value">{syncValue}</div>
          {syncDelta && (
            <div className={`kpi-delta${syncHealthy ? "" : " down"}`}>{syncDelta}</div>
          )}
        </div>
      </div>

      <div className="two-col">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Inventory by status</h3>
            {STATUS_ORDER.map((status) => {
              const count = data.inventoryByStatus[status];
              const pct =
                data.totalProperties > 0
                  ? Math.round((count / data.totalProperties) * 100)
                  : 0;
              return (
                <div key={status} className="statbar-row">
                  <div className="statbar-head">
                    <span>{availabilityLabel[status]}</span>
                    <span className="count">
                      <b>{count}</b> · {pct}%
                    </span>
                  </div>
                  <div className="statbar-track">
                    <div
                      className="statbar-fill"
                      style={{ width: `${pct}%`, background: statusColor[status] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card card-pad">
            <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Recent Activity</h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
              The latest actions across your team.
            </p>
            {data.recentActivity.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-fade)", margin: 0 }}>
                No activity yet.
              </p>
            ) : (
              data.recentActivity.map((a) => (
                <div key={a.id} className="activity-row">
                  <div className="activity-body">
                    <div>
                      <span className="who">{a.userName ?? "System"}</span> {a.action}
                    </div>
                    <div className="sub">{a.entityType}</div>
                  </div>
                  <div className="when">
                    {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Sync Health</h3>
            <SyncRow
              label="Sync mode"
              value={
                data.sync.mode === "realtime" ? (
                  <span className="pill realtime">Real-time active</span>
                ) : data.sync.mode === "mock" ? (
                  <span className="pill mock">Mock</span>
                ) : (
                  <span className="pill scheduled">Scheduled · 30 min</span>
                )
              }
            />
            {data.sync.mode === "realtime" && (
              <SyncRow
                label="Last real-time lead"
                value={
                  data.sync.lastWebhookAt
                    ? formatDistanceToNow(data.sync.lastWebhookAt, { addSuffix: true })
                    : "—"
                }
              />
            )}
            <SyncRow
              label="Last successful pull"
              value={
                data.sync.lastRunAt
                  ? formatDistanceToNow(data.sync.lastRunAt, { addSuffix: true })
                  : "Never"
              }
            />
            <SyncRow label="Latest run status" value={data.sync.status ?? "—"} />
            <SyncRow
              label="Records processed"
              value={
                data.sync.recordsProcessed != null
                  ? String(data.sync.recordsProcessed)
                  : "—"
              }
            />
            <SyncRow
              label="Health"
              value={
                <span
                  className={`pill ${data.sync.lastRunAt ? (syncHealthy ? "live" : "mock") : ""}`}
                >
                  {syncValue}
                </span>
              }
            />
            {user.role === "ADMIN" && (
              <div style={{ marginTop: 12 }}>
                <SyncNowButton block lastSyncAt={data.sync.lastRunAt?.toISOString() ?? null} />
                <p style={{ fontSize: 11, color: "var(--ink-fade)", margin: "6px 0 0" }}>
                  {data.sync.mode === "realtime"
                    ? "Leads sync in real time via the Corefactors webhook; the 30-min pull runs as a backstop. Run manually anytime."
                    : "Auto-syncs every 30 min in production; run manually here anytime."}
                </p>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Quick Actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link
                href="/inventory/new"
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Add a new property
              </Link>
              <Link
                href="/inventory/import"
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Import inventory from Excel
              </Link>
              <Link
                href="/matching"
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Open the matching queue
              </Link>
              <Link
                href="/leads"
                className="btn btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Review active leads
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function SyncRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

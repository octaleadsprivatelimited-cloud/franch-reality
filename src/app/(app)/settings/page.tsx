import Link from "next/link";
import { MapPin } from "lucide-react";
import type { MatchStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { listUsers } from "@/lib/queries/users";
import { matchStatusLabel } from "@/lib/domain";
import { teleduceMockMode } from "@/lib/env";
import {
  TELEDUCE_STAGES,
  MATCH_STATUS_TO_TELEDUCE_STAGE,
} from "@/lib/teleduce/mapping";
import { UsersTable } from "@/components/settings/UsersTable";
import { SyncNowButton } from "@/components/teleduce/SyncNowButton";

const MATCH_STATUS_ORDER: MatchStatus[] = [
  "SHORTLISTED",
  "SHARED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "CLOSED_NEUTRAL",
];

export default async function SettingsPage() {
  await requireAdmin();
  const users = await listUsers();
  const localityCount = await prisma.locality.count();

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const agentCount = users.length - adminCount;
  const activeStages = TELEDUCE_STAGES.filter((s) => s.isActive).length;

  return (
    <div className="space-y-8">
      <div className="page-header">
        <div>
          <h1>Users &amp; Access</h1>
          <div className="subtitle">
            {users.length} total · {adminCount} Admin{adminCount === 1 ? "" : "s"} · {agentCount} Agent
            {agentCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="page-actions">
          <Link href="/settings/users/new" className="btn-primary">
            + Add user
          </Link>
        </div>
      </div>

      {/* ── Section A: Users ── */}
      <UsersTable users={users} />

      {/* ── Master data: Locations ── */}
      <div
        className="card card-pad"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MapPin className="h-5 w-5" style={{ color: "var(--brand)" }} />
          <div>
            <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Locations</h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
              {localityCount} localit{localityCount === 1 ? "y" : "ies"} used across inventory, leads and matching.
            </p>
          </div>
        </div>
        <Link href="/settings/localities" className="btn">
          Manage locations
        </Link>
      </div>

      {/* ── Section B: Integration (read-only) + stage mapping ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* Teleduce integration status */}
        <div className="card card-pad">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15 }}>Teleduce Integration</h3>
            <span className={`pill ${teleduceMockMode ? "mock" : "live"}`}>
              {teleduceMockMode ? "Mock" : "Live"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
            Corefactors Teleduce CRM sync &amp; writeback · read-only, configured via
            environment.
          </p>
          <div style={{ fontSize: 13 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <span style={{ color: "var(--ink-soft)" }}>Mode</span>
              <b>{teleduceMockMode ? "Mock dataset" : "Production account"}</b>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <span style={{ color: "var(--ink-soft)" }}>Active lead stages</span>
              <b>
                {activeStages} of {TELEDUCE_STAGES.length}
              </b>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "var(--ink-soft)" }}>Writeback statuses</span>
              <b>
                {
                  MATCH_STATUS_ORDER.filter(
                    (s) => MATCH_STATUS_TO_TELEDUCE_STAGE[s],
                  ).length
                }{" "}
                mapped
              </b>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <SyncNowButton />
            <p style={{ fontSize: 11, color: "var(--ink-fade)", margin: 0 }}>
              The pull also runs automatically every 30 minutes in production.
            </p>
          </div>
        </div>

        {/* Writeback stage mapping */}
        <div className="card card-pad">
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Stage mapping</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
            Match status → Teleduce stage pushed on writeback.
          </p>
          <div style={{ fontSize: 13 }}>
            {MATCH_STATUS_ORDER.map((status, i) => {
              const stage = MATCH_STATUS_TO_TELEDUCE_STAGE[status];
              return (
                <div
                  key={status}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "6px 0",
                    borderBottom:
                      i < MATCH_STATUS_ORDER.length - 1
                        ? "1px solid var(--rule)"
                        : undefined,
                  }}
                >
                  <span style={{ color: "var(--ink-soft)" }}>
                    {matchStatusLabel[status]}
                  </span>
                  {stage ? (
                    <span
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: "var(--ink)",
                      }}
                    >
                      {stage}
                    </span>
                  ) : (
                    <span className="role-badge agent">Internal only</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section C: All Teleduce stages (reference) ── */}
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Teleduce lead stages</h3>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
          Configured stages from the client&apos;s Corefactors account.
        </p>
        <table className="lead-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Classification</th>
            </tr>
          </thead>
          <tbody>
            {TELEDUCE_STAGES.map((s) => (
              <tr key={s.id}>
                <td>{s.display}</td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.isWon && <span className="stage-pill completed">Won</span>}
                    {s.isLost && <span className="stage-pill negative">Lost</span>}
                    {s.isActive ? (
                      <span className="stage-pill contacted">Active</span>
                    ) : (
                      <span className="stage-pill">Closed</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

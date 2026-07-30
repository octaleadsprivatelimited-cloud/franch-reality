import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { City } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getAgentLoadSummary,
  listUnassignedLeads,
  listAssignableAgents,
  listOpenUnassignments,
} from "@/lib/queries/leads";
import { cityLabel, propertyTypeLabel, transactionTypeLabel } from "@/lib/domain";
import {
  DistributeButton,
  QuickAssign,
  UnassignButton,
  UnassignmentRecordActions,
} from "@/components/leads/LeadAssignmentControls";
import { unassignAllAction, unassignAgentAction } from "@/app/(app)/leads/actions";

const UNASSIGNED_LIMIT = 50;

function parseCity(v: string | string[] | undefined): City | undefined {
  return v === "HYDERABAD" || v === "CHENNAI" ? v : undefined;
}

const tile: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--rule)",
  borderRadius: "var(--radius)",
  padding: "14px 16px",
};
const tileLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-soft)",
  marginTop: 4,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  fontWeight: 600,
};

export default async function LeadAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const selectedCity = parseCity(sp.city);

  const [summary, unassigned, agentOptions, returns] = await Promise.all([
    getAgentLoadSummary(selectedCity),
    listUnassignedLeads(selectedCity, UNASSIGNED_LIMIT),
    listAssignableAgents(),
    listOpenUnassignments(selectedCity),
  ]);

  const {
    agents: rawAgents,
    unassignedActive,
    corefactorsUnlinked,
    unlinkedOwners,
    assignedActive,
  } = summary;
  const totalAssigned = assignedActive;
  const totalActive = assignedActive + unassignedActive + corefactorsUnlinked;
  const activeAgentCount = rawAgents.filter((a) => a.isActive).length;
  const avgPerAgent = activeAgentCount ? Math.round(totalAssigned / activeAgentCount) : 0;
  const maxLoad = Math.max(1, ...rawAgents.map((a) => a.activeAssigned));

  // Most-loaded first (so the spread is obvious); active agents ahead of inactive.
  const agents = [...rawAgents].sort((a, b) =>
    a.isActive === b.isActive ? b.activeAssigned - a.activeAssigned : a.isActive ? -1 : 1,
  );

  const kpis: { val: number; lbl: string; warn?: boolean }[] = [
    { val: totalActive, lbl: "Active leads" },
    { val: totalAssigned, lbl: "Assigned" },
    { val: unassignedActive, lbl: "Round-robin eligible", warn: unassignedActive > 0 },
    { val: corefactorsUnlinked, lbl: "Owner not linked", warn: corefactorsUnlinked > 0 },
    { val: activeAgentCount, lbl: "Active agents" },
    { val: avgPerAgent, lbl: "Avg / agent" },
  ];

  const cityFilters: { label: string; href: string; on: boolean }[] = [
    { label: "All cities", href: "/leads/assignments", on: !selectedCity },
    { label: "Hyderabad", href: "/leads/assignments?city=HYDERABAD", on: selectedCity === "HYDERABAD" },
    { label: "Chennai", href: "/leads/assignments?city=CHENNAI", on: selectedCity === "CHENNAI" },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/leads"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--ink-soft)" }}
      >
        ← Back to leads
      </Link>

      <div className="page-header">
        <div>
          <h1>Lead assignments</h1>
          <div className="subtitle">
            Corefactors owners are mirrored here. Only ownerless leads enter the local round robin.
          </div>
        </div>
        <div className="page-actions">
          {cityFilters.map((c) => (
            <Link key={c.label} href={c.href} className={c.on ? "btn btn-primary btn-sm" : "btn btn-sm"}>
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.lbl} style={tile}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.1,
                color: k.warn ? "var(--warn)" : "var(--ink)",
              }}
            >
              {k.val}
            </div>
            <div style={tileLabel}>{k.lbl}</div>
          </div>
        ))}
      </div>

      {unlinkedOwners.length > 0 && (
        <div className="card card-pad" style={{ borderColor: "#efc4c4" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Corefactors owners not linked to an agent account</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>
            These leads remain with their upstream owner and are excluded from round robin. Update the
            matching platform agent email/name and city access to resolve them.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {unlinkedOwners.map((item) => (
              <Link
                key={item.owner}
                href={`/leads?owner=${encodeURIComponent(item.owner)}&assignedAgentId=__unassigned__&activity=all`}
                className="btn btn-sm"
              >
                {item.owner} ({item.count})
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Distribute */}
      <div
        className="card card-pad"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Distribute ownerless leads</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, maxWidth: 560 }}>
            Evenly assigns the {unassignedActive} active lead{unassignedActive === 1 ? "" : "s"} with no
            Corefactors owner
            {selectedCity ? ` in ${cityLabel[selectedCity]}` : ""} to the least-loaded eligible agents.
            Leads already owned in Corefactors are never redistributed here.
          </p>
        </div>
        <DistributeButton unassignedCount={unassignedActive} city={selectedCity} />
      </div>

      {/* Leads returned by agents (with reasons) — awaiting admin action */}
      {returns.length > 0 && (
        <div className="card" style={{ overflow: "hidden", borderColor: "#efc4c4" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              Leads unassigned by agents{" "}
              <span style={{ color: "var(--ink-fade)", fontWeight: 500 }}>({returns.length})</span>
            </h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
              Agents returned these leads with a reason. Reassign each (back to the same agent or to
              someone else) or dismiss to leave it in the unassigned pool.
            </p>
          </div>
          <div>
            {returns.map((r) => {
              const nm = [r.lead.firstName, r.lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
              const rq = [
                r.lead.bhkPref.length ? `${r.lead.bhkPref.join(", ")} BHK` : null,
                r.lead.transactionTypePref ? transactionTypeLabel[r.lead.transactionTypePref] : null,
                r.lead.propertyTypePref.length
                  ? r.lead.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={r.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--rule)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div>
                    <Link href={`/leads/${r.lead.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {nm}
                    </Link>
                    <span style={{ color: "var(--ink-soft)", fontSize: 12, marginLeft: 8 }}>
                      {cityLabel[r.lead.city]}
                      {rq ? ` · ${rq}` : ""}
                    </span>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                      Returned by <b>{r.agent.fullName}</b> ·{" "}
                      {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      background: "var(--bg-soft)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      borderLeft: "3px solid var(--warn)",
                    }}
                  >
                    “{r.reason}”
                  </div>
                  <UnassignmentRecordActions
                    leadId={r.lead.id}
                    recordId={r.id}
                    leadCity={r.lead.city}
                    defaultAgentId={r.agent.id}
                    agents={agentOptions}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent workload */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Agent workload</h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
              Active (non-archived) leads currently assigned to each agent.
            </p>
          </div>
          <UnassignButton
            action={unassignAllAction.bind(null, selectedCity)}
            idle={`Unassign all${selectedCity ? ` in ${cityLabel[selectedCity]}` : ""}`}
            confirm={`Unassign all ${totalAssigned}?`}
            disabled={totalAssigned === 0}
          />
        </div>
        {agents.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ink-fade)" }}>
            No agents{selectedCity ? ` in ${cityLabel[selectedCity]}` : ""}. Add agents in Settings → Users.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="lead-table assign-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Cities</th>
                  <th style={{ width: "38%" }}>Load</th>
                  <th>Last assigned</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b style={{ color: "var(--ink)" }}>{a.fullName}</b>
                      <div style={{ color: "var(--ink-fade)", fontSize: 11, marginTop: 2 }}>
                        {a.email}
                      </div>
                      {!a.isActive && (
                        <span className="role-badge agent" style={{ marginLeft: 6 }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {a.cities.map((c) => cityLabel[c]).join(", ") || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: "var(--bg-soft)",
                            borderRadius: 999,
                            overflow: "hidden",
                            minWidth: 80,
                          }}
                        >
                          <div
                            style={{
                              width: `${(a.activeAssigned / maxLoad) * 100}%`,
                              height: "100%",
                              background: a.isActive ? "var(--brand)" : "var(--ink-fade)",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 700, color: "var(--ink)", minWidth: 24, textAlign: "right" }}>
                          {a.activeAssigned}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                      {a.lastAssignedAt ? formatDistanceToNow(a.lastAssignedAt, { addSuffix: true }) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <Link
                          href={`/leads?assignedAgentId=${a.id}&activity=all${selectedCity ? `&city=${selectedCity}` : ""}`}
                          className="btn btn-sm"
                        >
                          View leads
                        </Link>
                        <UnassignButton
                          action={unassignAgentAction.bind(null, a.id, selectedCity)}
                          idle="Unassign"
                          confirm={`Unassign ${a.localAssigned}?`}
                          disabled={a.localAssigned === 0}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Round-robin eligible queue */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Round-robin eligible leads{" "}
            <span style={{ color: "var(--ink-fade)", fontWeight: 500 }}>({unassignedActive})</span>
          </h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
            These leads have no Corefactors owner. Assign one below or use auto-distribute above.
          </p>
        </div>
        {unassigned.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ink-fade)" }}>
            🎉 Every active lead{selectedCity ? ` in ${cityLabel[selectedCity]}` : ""} is assigned.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="lead-table assign-table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>City</th>
                    <th>Requirement</th>
                    <th>Pulled</th>
                    <th>Assign to</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map((l) => {
                    const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead";
                    const req = [
                      l.bhkPref.length ? `${l.bhkPref.join(", ")} BHK` : null,
                      l.transactionTypePref ? transactionTypeLabel[l.transactionTypePref] : null,
                      l.propertyTypePref.length
                        ? l.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <tr key={l.id}>
                        <td>
                          <Link href={`/leads/${l.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
                            {name}
                          </Link>
                        </td>
                        <td>{cityLabel[l.city]}</td>
                        <td style={{ color: "var(--ink-soft)" }}>{req || "—"}</td>
                        <td style={{ color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                          {formatDistanceToNow(l.createdAt, { addSuffix: true })}
                        </td>
                        <td>
                          <QuickAssign leadId={l.id} leadCity={l.city} agents={agentOptions} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {unassignedActive > unassigned.length && (
              <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--ink-soft)", borderTop: "1px solid var(--rule)" }}>
                Showing the first {unassigned.length} of {unassignedActive}. Assign or auto-distribute to work
                through the rest.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

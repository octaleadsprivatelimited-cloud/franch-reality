import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { getLeadById, listAssignableAgents } from "@/lib/queries/leads";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import { getMatchesForLead } from "@/lib/matching-service";
import { LeadAssignControl } from "@/components/leads/LeadAssignmentControls";
import {
  formatBudgetRange,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
  CITIES,
} from "@/lib/domain";
import { parseLeadMatchFilters } from "@/lib/match-filters";
import { LeadStageBadge } from "@/components/leads/LeadStageBadge";
import { PropertyMatchCard } from "@/components/matching/PropertyMatchCard";
import { MatchExplorer } from "@/components/matching/MatchExplorer";
import { LeadMatchFilters } from "@/components/matching/LeadMatchFilters";
import {
  LeadMatchDisplayProvider,
  LeadMatchDrawerControls,
} from "@/components/matching/LeadMatchDisplayContext";
import { MatchStatusBadge, WritebackBadge } from "@/components/matching/MatchBadges";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const matchFilters = parseLeadMatchFilters(sp);
  const [lead, matches, localities] = await Promise.all([
    getLeadById(user, id),
    getMatchesForLead(user, id, matchFilters),
    getLocalitiesForUser(user),
  ]);
  if (!lead || !matches) notFound();

  const isAdmin = user.role === "ADMIN";
  const agents = isAdmin ? await listAssignableAgents() : [];

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";

  const crit: [string, string][] = [
    [
      "Budget",
      formatBudgetRange(
        lead.budgetMin != null ? Number(lead.budgetMin) : null,
        lead.budgetMax != null ? Number(lead.budgetMax) : null,
        lead.transactionTypePref,
      ),
    ],
    [
      "Property type",
      lead.propertyTypePref.length
        ? lead.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
        : "Any",
    ],
    ["BHK", lead.bhkPref.length ? `${lead.bhkPref.join(", ")} BHK` : "Any"],
    [
      "Transaction",
      lead.transactionTypePref
        ? transactionTypeLabel[lead.transactionTypePref]
        : "Any",
    ],
    ["City", cityLabel[lead.city]],
    [
      "Preferred areas",
      lead.preferredLocalities.length
        ? lead.preferredLocalities.map((l) => l.name).join(", ")
        : "Whole city",
    ],
  ];
  const matchItems = matches.bands.flatMap((band) =>
    band.rows.map((row) => ({
      key: row.property.id,
      band: band.band,
      distanceKm: row.distanceKm,
      lat: row.property.locality.latitude,
      lng: row.property.locality.longitude,
      pinLabel: row.property.fileNo,
      card: <PropertyMatchCard leadId={lead.id} row={row} />,
    })),
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-fade)",
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            <Link href="/leads">← Back to leads</Link>
            {lead.teleduceLeadId && (
              <>
                {" · "}
                {lead.teleduceLeadId}
                {" · "}
                <span className="source-tag">Source: Teleduce</span>
              </>
            )}
          </div>
          <h1 style={{ marginTop: 6 }}>{name}</h1>
          <div className="subtitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LeadStageBadge stage={lead.currentStage} />
            {lead.leadOwner && (
              <span style={{ color: "var(--ink-fade)" }}>Lead Owner: {lead.leadOwner}</span>
            )}
          </div>
        </div>
        <div className="page-actions">
          {lead.mobile && (
            <a href={`tel:${lead.mobile}`} className="btn">
              Call
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="btn">
              Email
            </a>
          )}
          <Link href={`/matching/lead/${lead.id}`} className="btn btn-primary">
            Find Matching Properties →
          </Link>
        </div>
      </div>

      <div className="lead-detail-grid">
        {/* Left column — requirement + banded matches */}
        <div>
          <div className="req-card">
            <div className="label">Buyer requirement · source from Teleduce</div>
            <div className="crit-grid">
              {crit.map(([label, value]) => (
                <div key={label}>
                  {label} &nbsp;·&nbsp; <b>{value}</b>
                </div>
              ))}
            </div>
          </div>

          <LeadMatchDisplayProvider>
            <LeadMatchFilters
              actionPath={`/leads/${lead.id}`}
              filters={matches.filters}
              localities={localities}
              availableCities={user.role === "ADMIN" ? CITIES : user.cities}
              drawer
              drawerControls={
                matches.total > 0 ? (
                  <LeadMatchDrawerControls
                    distances={matchItems.map((item) => item.distanceKm)}
                    total={matches.total}
                    noun="properties"
                  />
                ) : null
              }
            />

            {/* Radius-banded matching properties */}
            <div id="matches" style={{ scrollMarginTop: 24 }}>
              <div className="lead-matches-heading">
                <h2>Matching properties</h2>
                <span>{matches.total} total</span>
              </div>

              {matches.total === 0 && (
                <div
                  className="card card-pad"
                  style={{ textAlign: "center", fontSize: 13, color: "var(--ink-fade)" }}
                >
                  No available properties match these working filters. Try adding an
                  alternative property type, adjacent BHK, a wider budget, or another
                  location.
                </div>
              )}

              {matches.total > 0 && (
                <MatchExplorer
                  noun="properties"
                  total={matches.total}
                  bands={matches.bands.map((b) => ({ band: b.band, label: b.label }))}
                  anchor={
                    matches.anchorLocalities[0]
                      ? {
                          lat: matches.anchorLocalities[0].latitude,
                          lng: matches.anchorLocalities[0].longitude,
                          label: matches.anchorLocalities[0].name,
                        }
                      : null
                  }
                  items={matchItems}
                />
              )}
            </div>
          </LeadMatchDisplayProvider>
        </div>

        {/* Right column — assignment, contact, Teleduce stage, decision history */}
        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Assigned agent</h3>
            {lead.leadOwner ? (
              <div style={{ fontSize: 13 }}>
                {lead.assignedAgent ? (
                  <b>{lead.assignedAgent.fullName}</b>
                ) : (
                  <b style={{ color: "var(--bad)" }}>Corefactors owner not linked</b>
                )}
                <div style={{ color: "var(--ink-fade)", fontSize: 11, marginTop: 4 }}>
                  Corefactors: {lead.leadOwner}. Change ownership in Corefactors; sync mirrors it here.
                </div>
              </div>
            ) : isAdmin ? (
              <LeadAssignControl
                leadId={lead.id}
                leadCity={lead.city}
                currentAgentId={lead.assignedAgent?.id ?? null}
                agents={agents}
              />
            ) : (
              <div style={{ fontSize: 13 }}>
                {lead.assignedAgent ? (
                  <>
                    <b>{lead.assignedAgent.fullName}</b>
                    <div style={{ color: "var(--ink-fade)", fontSize: 11, marginTop: 4 }}>
                      {lead.assignmentSource === "MANUAL" ? "Manual assignment" : "Round robin"}
                    </div>
                  </>
                ) : (
                  <span style={{ color: "var(--ink-fade)" }}>Round-robin eligible</span>
                )}
              </div>
            )}
          </div>

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Contact</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Mobile:</span>{" "}
                <b>{lead.mobile ?? "—"}</b>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Email:</span> <b>{lead.email ?? "—"}</b>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Source:</span>{" "}
                <b>{lead.leadSource ?? "—"}</b>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>City:</span> <b>{cityLabel[lead.city]}</b>
              </div>
            </div>
          </div>

          <div
            className="card card-pad"
            style={{ marginBottom: lead.matches.length > 0 ? 16 : 0 }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Teleduce Stage</h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
              Read-only here. Stage changes happen automatically when you action a match.
            </p>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--info-tint)",
                color: "var(--info)",
                fontWeight: 600,
                fontSize: 12.5,
              }}
            >
              ✓ {lead.currentStage} (current)
            </div>
          </div>

          {/* Persisted decisions — survive even if a property is later booked/sold */}
          {lead.matches.length > 0 && (
            <div className="card card-pad">
              <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
                Match decisions ({lead.matches.length})
              </h3>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                Properties actioned for this buyer so far.
              </p>
              {lead.matches.map((m) => (
                <div key={m.id} className="list-item">
                  <div className="text">
                    <Link
                      href={`/inventory/${m.property.id}`}
                      style={{ fontWeight: 600, color: "var(--ink)" }}
                    >
                      {m.property.fileNo}
                    </Link>{" "}
                    · {propertyTypeLabel[m.property.propertyType]}
                    {m.property.bhk ? ` · ${m.property.bhk} BHK` : ""} · {m.property.locality.name}
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <MatchStatusBadge status={m.status} />
                      {m.teleduceWritebackStatus !== "NOT_REQUIRED" && (
                        <WritebackBadge status={m.teleduceWritebackStatus} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

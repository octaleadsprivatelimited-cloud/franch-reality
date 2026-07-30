import Link from "next/link";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireUser } from "@/lib/auth-helpers";
import { listLeads, getLeadFacets, listAssignableAgents } from "@/lib/queries/leads";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import { leadFilterSchema } from "@/lib/validation/lead";
import { parseListParams, LEAD_ARRAY_KEYS } from "@/lib/search-params";
import {
  formatBudgetRange,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
} from "@/lib/domain";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadSearch } from "@/components/leads/LeadSearch";
import { LeadSort } from "@/components/leads/LeadSort";
import { LeadStageBadge } from "@/components/leads/LeadStageBadge";
import { FindMatchesButton } from "@/components/leads/FindMatchesButton";
import { LeadConversationCell } from "@/components/whatsapp/LeadConversationCell";
import { activeConversationsByLead } from "@/lib/whatsapp/conversations";
import { TableRowLink } from "@/components/TableRowLink";
import { BulkSelectProvider, BulkSelectAll, BulkRowCheckbox } from "@/components/BulkSelect";
import { bulkDeleteLeadsAction } from "@/app/(app)/leads/actions";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = parseListParams(leadFilterSchema, sp, LEAD_ARRAY_KEYS);

  const isAdmin = user.role === "ADMIN";
  const [{ items, total, page, pageCount }, localities, facets, agents] = await Promise.all([
    listLeads(user, filter),
    getLocalitiesForUser(user),
    getLeadFacets(user, filter.city),
    isAdmin ? listAssignableAgents() : Promise.resolve([]),
  ]);
  const convByLead = await activeConversationsByLead(items.map((l) => l.id));

  function pageHref(p: number) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string") next.set(k, v);
      else if (Array.isArray(v)) for (const item of v) next.append(k, item);
    }
    next.set("page", String(p));
    return `/leads?${next.toString()}`;
  }

  // Windowed page numbers: anchored at the current page, showing it plus the next 4.
  const WINDOW = 5;
  const windowStart = Math.max(1, Math.min(page, pageCount - WINDOW + 1));
  const windowEnd = Math.min(pageCount, windowStart + WINDOW - 1);
  const pageNumbers: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pageNumbers.push(p);

  return (
    <div>
      <div className="page-header">
        <div className="inventory-results">
          <h1>Leads</h1>
          <div className="subtitle">
            {total} lead{total === 1 ? "" : "s"} · synced from Teleduce
          </div>
        </div>
        {isAdmin && (
          <div className="page-actions" style={{ alignSelf: "center" }}>
            <Link href="/leads/assignments" className="btn">
              <Shuffle className="h-4 w-4" /> Assignments
            </Link>
          </div>
        )}
      </div>

      <div className="inventory-shell">
        <LeadFilters
          isAdmin={isAdmin}
          localities={localities}
          sources={facets.sources}
          owners={facets.owners}
          agents={agents}
        />

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <LeadSearch />
            </div>
            <LeadSort />
          </div>

          {items.length === 0 ? (
            <div
              className="card card-pad"
              style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}
            >
              No leads match these filters.
            </div>
          ) : (
            <BulkSelectProvider
              entity="leads"
              pageIds={items.map((l) => l.id)}
              total={total}
              filterParams={sp}
              deleteAction={bulkDeleteLeadsAction}
              canDelete={isAdmin}
            >
            <div className="table-wrap leads-table-wrap">
              <table
                className={`lead-table leads-data-table${isAdmin ? " leads-data-table-admin" : ""}`}
              >
                <colgroup>
                  {isAdmin && <col className="lead-col-select" />}
                  <col className="lead-col-primary" />
                  <col className="lead-col-requirement" />
                  <col className="lead-col-areas" />
                  <col className="lead-col-stage" />
                  <col className="lead-col-assignment" />
                </colgroup>
                <thead>
                  <tr>
                    {isAdmin && (
                      <th className="lead-select-header">
                        <BulkSelectAll />
                      </th>
                    )}
                    <th className="lead-header-primary">Lead</th>
                    <th className="lead-header-requirement">Requirement</th>
                    <th className="lead-header-areas">Location</th>
                    <th className="lead-header-stage">Stage</th>
                    <th className="lead-header-assignment">Assigned to</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const name =
                      [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead";
                    const req = [
                      l.bhkPref.length > 0 ? `${l.bhkPref.join(", ")} BHK` : null,
                      l.transactionTypePref ? transactionTypeLabel[l.transactionTypePref] : null,
                      l.propertyTypePref.length > 0
                        ? l.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const areas =
                      l.preferredLocalities.length > 0
                        ? l.preferredLocalities.map((p) => p.name).join(", ")
                        : "—";

                    return (
                      <TableRowLink key={l.id} href={`/leads/${l.id}`}>
                        {isAdmin && <BulkRowCheckbox id={l.id} className="lead-cell-select" />}
                        <td className="lead-cell-primary">
                          <span className="lead-name">{name}</span>
                          <div className="lead-table-meta lead-primary-meta">
                            <span>{l.mobile ?? "No mobile number"}</span>
                            {l.teleduceLeadId && (
                              <span
                                className="lead-source-id"
                                title={`Teleduce lead ID ${l.teleduceLeadId}`}
                              >
                                {l.teleduceLeadId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="lead-cell-requirement" data-label="Requirement">
                          <div className="lead-cell-value">{req || "No structured requirement"}</div>
                          <div className="lead-table-meta">
                            Budget{" "}
                            <span>
                              {formatBudgetRange(
                                l.budgetMin != null ? Number(l.budgetMin) : null,
                                l.budgetMax != null ? Number(l.budgetMax) : null,
                                l.transactionTypePref,
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="lead-cell-areas" data-label="Location" title={areas}>
                          <div className="lead-cell-clamp">{areas}</div>
                          <div className="lead-table-meta">{cityLabel[l.city]}</div>
                        </td>
                        <td className="lead-cell-stage" data-label="Stage">
                          <LeadStageBadge stage={l.currentStage} />
                        </td>
                        <td className="lead-cell-assignment" data-label="Assigned to">
                          {l.assignedAgent ? (
                            <>
                              <span className="lead-cell-value">{l.assignedAgent.fullName}</span>
                              <div className="lead-table-meta">
                                {l.assignmentSource === "COFACTORS"
                                  ? "Corefactors"
                                  : l.assignmentSource === "MANUAL"
                                    ? "Manual"
                                    : "Round robin"}
                              </div>
                            </>
                          ) : l.leadOwner ? (
                            <>
                              <span className="lead-owner-warning">Owner not linked</span>
                              <div className="lead-table-meta lead-owner-value" title={l.leadOwner}>
                                {l.leadOwner}
                              </div>
                            </>
                          ) : (
                            <span className="lead-table-meta">Round-robin eligible</span>
                          )}
                        </td>
                        <td className="lead-cell-footer">
                          <span className="lead-pulled-meta">
                            Pulled {formatDistanceToNow(l.createdAt, { addSuffix: true })}
                          </span>
                          <span className="lead-row-actions">
                            <LeadConversationCell
                              leadId={l.id}
                              active={convByLead.get(l.id) ?? null}
                              currentUserId={user.id}
                              isAdmin={user.role === "ADMIN"}
                            />
                            <FindMatchesButton leadId={l.id} />
                          </span>
                        </td>
                      </TableRowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </BulkSelectProvider>
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Leads pagination"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 20,
                flexWrap: "wrap",
              }}
            >
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn btn-sm" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  className="btn btn-sm"
                  style={{ opacity: 0.4, pointerEvents: "none" }}
                  aria-hidden="true"
                >
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}

              {windowStart > 1 && (
                <>
                  <Link href={pageHref(1)} className="btn btn-sm">
                    1
                  </Link>
                  {windowStart > 2 && (
                    <span style={{ color: "var(--ink-fade)", padding: "0 2px" }}>…</span>
                  )}
                </>
              )}

              {pageNumbers.map((p) =>
                p === page ? (
                  <span
                    key={p}
                    className="btn-primary btn-sm"
                    aria-current="page"
                    style={{ pointerEvents: "none" }}
                  >
                    {p}
                  </span>
                ) : (
                  <Link key={p} href={pageHref(p)} className="btn btn-sm" aria-label={`Page ${p}`}>
                    {p}
                  </Link>
                ),
              )}

              {windowEnd < pageCount && (
                <>
                  {windowEnd < pageCount - 1 && (
                    <span style={{ color: "var(--ink-fade)", padding: "0 2px" }}>…</span>
                  )}
                  <Link href={pageHref(pageCount)} className="btn btn-sm">
                    {pageCount}
                  </Link>
                </>
              )}

              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="btn btn-sm" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  className="btn btn-sm"
                  style={{ opacity: 0.4, pointerEvents: "none" }}
                  aria-hidden="true"
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

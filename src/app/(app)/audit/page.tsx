import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAuditLogs, getAuditEntityTypes } from "@/lib/queries/audit";
import { auditFilterSchema } from "@/lib/validation/audit";
import { parseSearchParams } from "@/lib/search-params";
import { describeAudit } from "@/lib/audit-format";
import { AuditFilters } from "@/components/audit/AuditFilters";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = parseSearchParams(auditFilterSchema, sp);

  const [{ items, total, page, pageCount }, entityTypes] = await Promise.all([
    listAuditLogs(filter),
    getAuditEntityTypes(),
  ]);

  function pageHref(p: number) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string") next.set(k, v);
    }
    next.set("page", String(p));
    return `/audit?${next.toString()}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <div className="subtitle">
            {total} entr{total === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>

      <AuditFilters entityTypes={entityTypes} />

      {items.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}
        >
          No audit entries match these filters.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="lead-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const view = describeAudit(a);
                const hasDetail = view.rows.length > 0 || (view.newLeads && view.newLeads.length > 0);
                return (
                  <tr key={a.id} style={{ verticalAlign: "top" }}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
                      <span title={a.createdAt.toLocaleString()}>
                        {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--ink)" }}>
                      {a.action}
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      <span>{a.entityType}</span>
                      {a.entityId && (
                        <span
                          className="source-tag"
                          style={{ marginLeft: 6, fontFamily: "var(--font-mono)" }}
                        >
                          {a.entityId}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
                      {a.user?.fullName ?? "System"}
                    </td>
                    <td style={{ color: "var(--ink)", minWidth: 260 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{view.summary}</div>
                      {hasDetail && (
                        <details style={{ marginTop: 4, maxWidth: 420 }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              userSelect: "none",
                              fontSize: 12,
                              color: "var(--brand-dark)",
                            }}
                          >
                            Details
                          </summary>
                          <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12.5 }}>
                            {view.rows.map((r, i) => (
                              <div
                                key={i}
                                style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
                              >
                                <span style={{ color: "var(--ink-soft)" }}>{r.label}</span>
                                <b style={{ color: "var(--ink)", textAlign: "right" }}>{r.value}</b>
                              </div>
                            ))}
                            {view.newLeads && view.newLeads.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.4px",
                                    color: "var(--ink-fade)",
                                    marginBottom: 4,
                                  }}
                                >
                                  New leads
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 16, color: "var(--ink-soft)" }}>
                                  {view.newLeads.map((l, i) => (
                                    <li key={i}>
                                      <b style={{ color: "var(--ink)" }}>{l.name}</b> · {l.location}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-sm">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="btn btn-sm">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

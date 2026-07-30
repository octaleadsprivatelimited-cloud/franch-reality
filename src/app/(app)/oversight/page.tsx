import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listConversationsForAdmin, OVERSIGHT_PAGE_SIZE } from "@/lib/whatsapp/conversations";
import { cityLabel } from "@/lib/domain";
import { formatDistanceToNow } from "date-fns";
import { TableRowLink } from "@/components/TableRowLink";

// Admin-only oversight of every agent's customer conversations: who is/was talking
// to which client, and how much was said / searched / shared. Drill in for the full
// reconstruction. Agents cannot reach this route (requireAdmin redirects them).
export default async function OversightPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const convs = await listConversationsForAdmin(page);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Agent oversight</h1>
          <div className="subtitle">
            Every client conversation — what each agent said, searched, and shared.
          </div>
        </div>
      </div>

      {convs.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}>
          No conversations yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Messages</th>
                <th>Searches</th>
                <th>Shared</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => {
                const client =
                  [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
                const when = c.lastMessageAt ?? c.startedAt;
                return (
                  <TableRowLink key={c.id} href={`/oversight/${c.id}`}>
                    <td>
                      <b style={{ color: "var(--ink)" }}>{client}</b>
                      <br />
                      <span className="source-tag">{c.customerPhone} · {cityLabel[c.lead.city]}</span>
                    </td>
                    <td>
                      {c.agent.fullName}
                      <br />
                      <span className="source-tag">{c.agent.email}</span>
                    </td>
                    <td>
                      <span className={`pill ${c.status === "ACTIVE" ? "live" : "mock"}`}>
                        {c.status === "ACTIVE" ? "Active" : "Ended"}
                      </span>
                    </td>
                    <td>{c._count.messages}</td>
                    <td>{c._count.searchActivities}</td>
                    <td>{c._count.sharedProperties}</td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {formatDistanceToNow(when, { addSuffix: true })}
                    </td>
                  </TableRowLink>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || convs.length === OVERSIGHT_PAGE_SIZE) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
          {page > 1 ? (
            <Link href={`/oversight?page=${page - 1}`} className="btn btn-sm">
              ← Prev
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              ← Prev
            </span>
          )}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Page {page}</span>
          {convs.length === OVERSIGHT_PAGE_SIZE ? (
            <Link href={`/oversight?page=${page + 1}`} className="btn btn-sm">
              Next →
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              Next →
            </span>
          )}
        </div>
      )}
    </div>
  );
}

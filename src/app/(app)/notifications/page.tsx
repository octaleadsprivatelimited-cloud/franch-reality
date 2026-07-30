import Link from "next/link";
import { ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const unreadOnly = sp.unreadOnly === "true";

  const where = unreadOnly ? { isRead: false } : {};

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, city: true, currentStage: true, mobile: true },
        },
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const next = new URLSearchParams();
    if (unreadOnly) next.set("unreadOnly", "true");
    next.set("page", String(p));
    return `/notifications?${next.toString()}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={20} />
            Notifications
            {unreadCount > 0 && (
              <span className="notif-badge" style={{ position: "static", transform: "none", fontSize: 13, padding: "2px 8px" }}>
                {unreadCount} unread
              </span>
            )}
          </h1>
          <div className="subtitle">{total} total notification{total !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link
            href={unreadOnly ? "/notifications" : "/notifications?unreadOnly=true"}
            className="btn btn-sm"
          >
            {unreadOnly ? "Show all" : "Unread only"}
          </Link>
          {unreadCount > 0 && <MarkAllReadButton />}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}
        >
          {unreadOnly ? "No unread notifications." : "No notifications yet — they will appear here when Corefactors syncs new leads."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="lead-table">
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th>When</th>
                <th>Lead</th>
                <th>City</th>
                <th>Stage</th>
                <th>Mobile</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr
                  key={n.id}
                  style={{
                    verticalAlign: "middle",
                    background: n.isRead ? undefined : "var(--surface-raised, #f9f7f4)",
                  }}
                >
                  <td>
                    {!n.isRead && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--brand-dark, #133022)",
                        }}
                        title="Unread"
                      />
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
                    <span title={n.createdAt.toLocaleString()}>
                      {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/leads?id=${n.lead.id}`}
                      style={{ fontWeight: 600, color: "var(--brand-dark)" }}
                    >
                      {n.lead.firstName} {n.lead.lastName ?? ""}
                    </Link>
                    <div style={{ fontSize: 12, color: "var(--ink-fade)", marginTop: 2 }}>{n.body}</div>
                  </td>
                  <td style={{ color: "var(--ink-soft)" }}>{n.lead.city}</td>
                  <td>
                    <span className="source-tag">{n.lead.currentStage}</span>
                  </td>
                  <td style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
                    {n.lead.mobile ?? "—"}
                  </td>
                  <td>
                    <span className="source-tag" style={{ textTransform: "capitalize" }}>
                      {n.source}
                    </span>
                  </td>
                </tr>
              ))}
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

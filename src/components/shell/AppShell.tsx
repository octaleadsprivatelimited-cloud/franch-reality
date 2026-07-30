"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { City } from "@prisma/client";
import { NAV_ITEMS } from "./nav";
import { UserMenu } from "./UserMenu";

/**
 * Top-nav app shell, per 03_UI_Mockup.html: sticky white top bar with the Franch
 * Realty logo lockup, horizontal nav tabs (active = brand-tint pill), a sync-mode
 * pill, a city/role pill and an avatar. Content sits in a centered .main column.
 */
export function AppShell({
  user,
  syncStatus,
  unreadNotifications,
  children,
}: {
  user: { name: string; email: string; role: "ADMIN" | "AGENT"; cities: City[] };
  syncStatus: { mode: "mock" | "realtime" | "scheduled"; lastWebhookAgo?: string | null };
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  const items = NAV_ITEMS.filter((i) => (!i.adminOnly || isAdmin) && (!i.agentOnly || !isAdmin));
  // Highlight the single MOST-SPECIFIC matching tab, so /leads/assignments lights up
  // "Assignments" only — not also "Leads" (a plain startsWith would match both).
  const activeHref = items
    .filter((i) =>
      i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Sync-mode pill: real-time (webhook delivering) vs scheduled (30-min pull only) vs mock.
  const pill = {
    mock: {
      cls: "mock",
      label: "Teleduce mock",
      title: "Teleduce sync runs in mock mode (no live credentials configured).",
    },
    realtime: {
      cls: "realtime",
      label: "Real-time sync",
      title: `Real-time Corefactors webhook active${
        syncStatus.lastWebhookAgo ? ` — last lead ${syncStatus.lastWebhookAgo}` : ""
      }. Scheduled pull every 30 min runs as a backstop.`,
    },
    scheduled: {
      cls: "scheduled",
      label: "Scheduled · 30 min",
      title:
        "Live Teleduce — leads sync via the scheduled pull every 30 min. Real-time webhook not active yet.",
    },
  }[syncStatus.mode];

  return (
    <div className="app">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link href="/" className="brand-mark" aria-label="Franch Realty — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/franch-logo.png" alt="Franch Realty" className="brand-logo" />
          </Link>

          <div className="nav-tabs">
            {items.map((item) => {
              const active = item.href === activeHref;
              const badge =
                item.href === "/notifications" && unreadNotifications && unreadNotifications > 0
                  ? unreadNotifications
                  : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-tab ${active ? "active" : ""}`}
                >
                  {item.label}
                  {badge && (
                    <span className="notif-badge">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="topnav-right">
            <span className={`pill ${pill.cls}`} title={pill.title}>
              {pill.label}
            </span>

            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}

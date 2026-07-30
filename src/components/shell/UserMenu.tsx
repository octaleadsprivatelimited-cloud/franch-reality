"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import type { City } from "@prisma/client";
import { signOutAction } from "@/lib/session-actions";
import { cityLabel } from "@/lib/domain";

export function UserMenu({
  user,
}: {
  user: { name: string; email: string; role: "ADMIN" | "AGENT"; cities: City[] };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return; // only listen while the menu is open
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // pointerdown covers both mouse and touch (mousedown alone misses touch taps).
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isAdmin = user.role === "ADMIN";
  const initials =
    user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FR";
  const firstName = user.name.split(" ")[0];
  const cities = isAdmin ? "All cities" : user.cities.map((c) => cityLabel[c]).join(" · ");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="user-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
      >
        <span className="avatar">{initials}</span>
        <span className="user-name hidden sm:inline">{firstName}</span>
        <ChevronDown className="h-4 w-4" style={{ color: "var(--ink-fade)" }} />
      </button>

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-head">
            <span className="avatar">{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="name">{user.name}</div>
              <div className="email">{user.email}</div>
            </div>
          </div>
          <div className="user-menu-row">
            <span>Role</span>
            <b>{isAdmin ? "Administrator" : "Agent"}</b>
          </div>
          <div className="user-menu-row">
            <span>Cities</span>
            <b>{cities}</b>
          </div>
          <div className="user-menu-sep" />
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "flex-start" }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

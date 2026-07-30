import Link from "next/link";
import type { City, Role } from "@prisma/client";
import { cityLabel } from "@/lib/domain";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  cities: City[];
  isActive: boolean;
}

const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  AGENT: "Agent",
};

/** "Both cities" when a user covers both, otherwise the single city, or "No city". */
function citySummary(cities: City[]): string {
  if (cities.length === 0) return "No city assigned";
  if (cities.length >= 2) return "Both cities";
  return cityLabel[cities[0]];
}

/** Up to two uppercase initials from the full name. */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UsersTable({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div
        className="card card-pad"
        style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}
      >
        No users yet.
      </div>
    );
  }

  return (
    <div className="user-grid">
      {users.map((u) => {
        const isAdmin = u.role === "ADMIN";
        return (
          <Link
            key={u.id}
            href={`/settings/users/${u.id}`}
            className="user-card"
            style={{
              textDecoration: "none",
              color: "inherit",
              opacity: u.isActive ? 1 : 0.6,
            }}
          >
            <div
              className="avatar"
              style={
                isAdmin
                  ? { background: "var(--brand)", color: "white" }
                  : undefined
              }
            >
              {initials(u.fullName)}
            </div>
            <div className="info">
              <div className="name">
                {u.fullName}
                {!u.isActive && (
                  <span
                    className="role-badge agent"
                    style={{ marginLeft: 6 }}
                  >
                    Inactive
                  </span>
                )}
              </div>
              <div className="email">{u.email}</div>
              <div className="city">{citySummary(u.cities)}</div>
            </div>
            <span className={`role-badge ${isAdmin ? "admin" : "agent"}`}>
              {roleLabel[u.role]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

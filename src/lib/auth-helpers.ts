import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { City, Prisma } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "AGENT";
  cities: City[];
}

// Re-validate the JWT principal against the DB on every request. The token is
// minted at login and is otherwise valid for the session lifetime, so trusting
// its role/cities/active claims would let a DEACTIVATED or DEMOTED user keep
// their access until the token expired. We instead read DB truth (deactivation
// and role/city changes take effect on the next request). Cached per-request so
// repeated requireUser/requireAdmin/cityScope calls hit the DB once.
const loadSessionUser = cache((id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, fullName: true, role: true, cities: true, isActive: true },
  }),
);

/** Returns the signed-in user (re-validated against the DB), or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionId) return null;

  const user = await loadSessionUser(sessionId);
  // Deactivated or deleted since the token was issued → treat as signed out.
  if (!user || !user.isActive) return null;

  return { id: user.id, email: user.email, name: user.fullName, role: user.role, cities: user.cities };
}

/** Returns the signed-in user, or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Returns the signed-in user if ADMIN, else redirects to the dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws unless the user is an admin. For use inside server actions / route handlers. */
export function assertAdmin(user: SessionUser): void {
  if (user.role !== "ADMIN") throw new ForbiddenError("Admin access required.");
}

/** Cities the user may access (admins implicitly cover all in scope). */
export function accessibleCities(user: SessionUser, all: City[]): City[] {
  return user.role === "ADMIN" ? all : user.cities;
}

/** Throws if an agent tries to act on a city outside their assignment. */
export function assertCityAccess(user: SessionUser, city: City): void {
  if (user.role === "ADMIN") return;
  if (!user.cities.includes(city)) {
    throw new ForbiddenError(`You are not assigned to ${city}.`);
  }
}

/**
 * Prisma `where` fragment that scopes a query to the user's cities.
 * Admins get an empty fragment (no restriction); agents are limited to their cities.
 */
export function cityScope(
  user: SessionUser,
): Prisma.PropertyWhereInput | Prisma.LeadWhereInput {
  if (user.role === "ADMIN") return {};
  return { city: { in: user.cities } };
}

import "server-only";
import { prisma } from "@/lib/prisma";

// SECURITY: never select passwordHash. Every read here uses an explicit select
// that omits it so it can never leak into a server component / serialized payload.
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  cities: true,
  isActive: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: userSelect,
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { ...userSelect, assignedAreas: { select: { id: true } } },
  });
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

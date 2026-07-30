import "server-only";
import { prisma } from "@/lib/prisma";

// Admin locality management reads. Includes the dependent counts used to decide
// whether a locality can be deleted (it can't while properties/leads/agents point
// at it) and to show usage in the admin table.
const dependentCounts = {
  _count: { select: { properties: true, interestedLeads: true, assignedAgents: true } },
} as const;

export async function listLocalitiesForAdmin() {
  return prisma.locality.findMany({
    orderBy: [{ city: "asc" }, { name: "asc" }],
    include: dependentCounts,
  });
}

export async function getLocalityForAdmin(id: number) {
  return prisma.locality.findUnique({
    where: { id },
    include: dependentCounts,
  });
}

export type AdminLocality = Awaited<ReturnType<typeof listLocalitiesForAdmin>>[number];
export type AdminLocalityDetail = NonNullable<Awaited<ReturnType<typeof getLocalityForAdmin>>>;

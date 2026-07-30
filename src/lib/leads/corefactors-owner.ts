import type { City, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface CorefactorsOwnerAgent {
  id: string;
  cities: City[];
}

export type CorefactorsOwnerIndex = Map<string, CorefactorsOwnerAgent[]>;

const UNASSIGNED_OWNER_VALUES = new Set([
  "unassigned",
  "not assigned",
  "no owner",
  "none",
  "null",
  "-",
  "--",
]);

/** Canonical comparison key for an owner value received from Corefactors. */
export function normalizeCorefactorsOwner(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("en-IN") ?? "";
  if (!normalized || UNASSIGNED_OWNER_VALUES.has(normalized)) return null;
  return normalized.replace(/\s+/g, " ");
}

/** Build an index from the active platform agents Corefactors is allowed to own leads as. */
export function corefactorsOwnerIndexFromAgents(
  agents: { id: string; email: string; fullName: string; cities: City[] }[],
): CorefactorsOwnerIndex {
  const index: CorefactorsOwnerIndex = new Map();
  for (const agent of agents) {
    const keys = new Set(
      [normalizeCorefactorsOwner(agent.email), normalizeCorefactorsOwner(agent.fullName)].filter(
        (key): key is string => Boolean(key),
      ),
    );
    for (const key of keys) {
      const matches = index.get(key) ?? [];
      matches.push({ id: agent.id, cities: agent.cities });
      index.set(key, matches);
    }
  }
  return index;
}

export async function buildCorefactorsOwnerIndex(db: Db): Promise<CorefactorsOwnerIndex> {
  const agents = await db.user.findMany({
    where: { role: "AGENT", isActive: true },
    select: { id: true, email: true, fullName: true, cities: true },
  });
  return corefactorsOwnerIndexFromAgents(agents);
}

/**
 * Resolve an upstream owner to exactly one active platform agent who can see the
 * lead's city. Ambiguous/missing matches deliberately return null: an upstream-
 * owned lead must never be sent to an unrelated local agent.
 */
export function resolveCorefactorsOwnerAgentId(
  owner: string | null | undefined,
  city: City,
  index: CorefactorsOwnerIndex,
): string | null {
  const key = normalizeCorefactorsOwner(owner);
  if (!key) return null;
  const matches = (index.get(key) ?? []).filter((agent) => agent.cities.includes(city));
  const uniqueIds = [...new Set(matches.map((agent) => agent.id))];
  return uniqueIds.length === 1 ? uniqueIds[0] : null;
}

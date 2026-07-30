import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth-helpers";
import { buildLeadWhere } from "@/lib/queries/leads";
import { buildPropertyWhere } from "@/lib/queries/inventory";
import { leadFilterSchema } from "@/lib/validation/lead";
import { inventoryFilterSchema } from "@/lib/validation/property";
import { parseListParams, LEAD_ARRAY_KEYS, INVENTORY_ARRAY_KEYS } from "@/lib/search-params";
import { type DeleteSelection, MAX_BULK } from "@/lib/bulk-delete";

// The single WHERE for a bulk delete/backup selection — used by BOTH the delete action
// and the export route so the deleted set is provably identical to the backed-up set.
// Filter mode re-derives the exact list WHERE, minus de-selected ids, and (crucially for
// an irreversible op) bounded to createdAt <= the selection snapshot so rows arriving
// mid-operation are never swept in.

export function leadSelectionWhere(user: SessionUser, s: DeleteSelection): Prisma.LeadWhereInput {
  if (s.mode === "ids") return { id: { in: s.ids.slice(0, MAX_BULK) } };
  const filter = parseListParams(leadFilterSchema, s.params, LEAD_ARRAY_KEYS);
  const clauses: Prisma.LeadWhereInput[] = [buildLeadWhere(user, filter)];
  if (s.excluded?.length) clauses.push({ id: { notIn: s.excluded } });
  if (s.before) clauses.push({ createdAt: { lte: new Date(s.before) } });
  return clauses.length > 1 ? { AND: clauses } : clauses[0];
}

export function propertySelectionWhere(user: SessionUser, s: DeleteSelection): Prisma.PropertyWhereInput {
  if (s.mode === "ids") {
    return {
      id: { in: s.ids.slice(0, MAX_BULK) },
      deletedAt: null,
      ...(user.role === "AGENT" ? { city: { in: user.cities } } : {}),
    };
  }
  const filter = parseListParams(inventoryFilterSchema, s.params, INVENTORY_ARRAY_KEYS);
  const clauses: Prisma.PropertyWhereInput[] = [buildPropertyWhere(user, filter)];
  if (s.excluded?.length) clauses.push({ id: { notIn: s.excluded } });
  if (s.before) clauses.push({ createdAt: { lte: new Date(s.before) } });
  return clauses.length > 1 ? { AND: clauses } : clauses[0];
}

/** Deterministic order shared by delete + export so a >MAX_BULK cap picks the same rows. */
export const SELECTION_ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];

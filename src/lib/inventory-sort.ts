// Single source of truth for inventory sort options. Plain constants (no server-only
// or Prisma imports) so this is safe to pull into the client sort control, the zod
// filter schema, AND the server query's orderBy mapping.

export const INVENTORY_SORT_VALUES = [
  "newest",
  "oldest",
  "updated",
  "price_desc",
  "price_asc",
  "fileno_asc",
] as const;

export type InventorySort = (typeof INVENTORY_SORT_VALUES)[number];

/** Default: recently added on top, oldest last. */
export const DEFAULT_INVENTORY_SORT: InventorySort = "newest";

/** Ordered list for the dropdown (labels shown to users). */
export const INVENTORY_SORTS: { value: InventorySort; label: string }[] = [
  { value: "newest", label: "Newest first (recently added)" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "fileno_asc", label: "File no: A–Z" },
];

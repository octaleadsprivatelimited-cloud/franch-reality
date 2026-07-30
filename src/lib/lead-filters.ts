// Single source of truth for lead sort orders and "pulled within" time windows.
// Plain constants (no server-only / Prisma imports) so the zod filter schema, the
// server query, and the client filter panel can all share them.

// ── Sort ──
// NOTE: there is deliberately no "recently updated" sort. The Teleduce sync writes
// lastSyncedAt on every upsert, so Prisma's @updatedAt bumps EVERY lead row on EVERY
// pull — updatedAt is just "time of last sync" for all rows and carries no per-lead
// signal. Use "synced" (lastSyncedAt) for that, which says what it means.
export const LEAD_SORT_VALUES = [
  "newest",
  "oldest",
  "synced",
  "budget_desc",
  "budget_asc",
  "name_asc",
  "name_desc",
  "stage",
] as const;

export type LeadSort = (typeof LEAD_SORT_VALUES)[number];

/** Default: most recently pulled leads on top. */
export const DEFAULT_LEAD_SORT: LeadSort = "newest";

export const LEAD_SORTS: { value: LeadSort; label: string }[] = [
  { value: "newest", label: "Newest first (recently pulled)" },
  { value: "oldest", label: "Oldest first" },
  { value: "synced", label: "Recently synced" },
  { value: "budget_desc", label: "Budget: high to low" },
  { value: "budget_asc", label: "Budget: low to high" },
  { value: "name_asc", label: "Name: A–Z" },
  { value: "name_desc", label: "Name: Z–A" },
  { value: "stage", label: "Stage (A–Z)" },
];

// ── "Pulled within" time window ──
export const LEAD_WITHIN_VALUES = ["30m", "1h", "6h", "24h", "7d", "30d"] as const;
export type LeadWithin = (typeof LEAD_WITHIN_VALUES)[number];

/** Window length in milliseconds. */
export const LEAD_WINDOW_MS: Record<LeadWithin, number> = {
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

export const LEAD_WITHIN_OPTIONS: { value: LeadWithin; label: string }[] = [
  { value: "30m", label: "Last 30 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** Which timestamp the window applies to. "created" = when the lead was first pulled in.
 *  (No "updated" option — see the note above: updatedAt bumps on every sync for every row.) */
export const LEAD_WITHIN_FIELDS = ["created", "synced"] as const;
export type LeadWithinField = (typeof LEAD_WITHIN_FIELDS)[number];

export const DEFAULT_LEAD_WITHIN_FIELD: LeadWithinField = "created";

export const LEAD_WITHIN_FIELD_OPTIONS: { value: LeadWithinField; label: string }[] = [
  { value: "created", label: "Pulled in" },
  { value: "synced", label: "Last synced" },
];

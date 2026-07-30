import type { Prisma } from "@prisma/client";

// Turn a raw audit row into a human-readable summary + clean key/value detail —
// so the audit log reads like "Synced 5 new leads from Corefactors" instead of a
// raw JSON blob. Pure (no DB); used by the audit page and could feed the
// dashboard activity feed.

export interface AuditView {
  summary: string;
  rows: { label: string; value: string }[];
  /** New leads from a sync run (name + area), for a friendly list. */
  newLeads?: { name: string; location: string }[];
}

function asRecord(v: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const nfmt = (n: number): string => n.toLocaleString("en-IN");
const plural = (n: number, w: string): string => `${nfmt(n)} ${w}${n === 1 ? "" : "s"}`;

function humanizeKey(k: string): string {
  return k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function kvRows(obj: Record<string, unknown> | null, prefix = ""): { label: string; value: string }[] {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([, v]) => v != null && typeof v !== "object") // nested arrays/objects handled separately
    .map(([k, v]) => ({ label: prefix + humanizeKey(k), value: typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) }));
}

export function describeAudit(entry: {
  action: string;
  entityType: string;
  beforeJson: Prisma.JsonValue | null;
  afterJson: Prisma.JsonValue | null;
}): AuditView {
  const after = asRecord(entry.afterJson);
  const before = asRecord(entry.beforeJson);

  // ── Teleduce pull ──
  if (entry.action === "Teleduce sync completed" && after) {
    const created = num(after.created);
    const updated = num(after.updated);
    const archived = num(after.archived);
    const failed = num(after.failed);
    const skipped = num(after.skipped);
    const mode = String(after.mode ?? "");
    const src = mode === "live" ? "Corefactors" : "Corefactors (mock)";

    let summary: string;
    if (created > 0) summary = `Synced ${plural(created, "new lead")} from ${src}`;
    else if (updated > 0) summary = `Teleduce sync — ${plural(updated, "lead")} refreshed, no new ones`;
    else summary = "Teleduce sync — no changes";
    const extras: string[] = [];
    if (created > 0 && updated > 0) extras.push(`${nfmt(updated)} updated`);
    if (archived > 0) extras.push(`${nfmt(archived)} archived`);
    if (failed > 0) extras.push(`${nfmt(failed)} failed`);
    if (extras.length) summary += ` (${extras.join(", ")})`;

    const rows = [
      { label: "Source", value: mode === "live" ? "Live · Corefactors" : "Mock dataset" },
      { label: "New leads", value: nfmt(created) },
      { label: "Updated", value: nfmt(updated) },
      { label: "Archived", value: nfmt(archived) },
      { label: "Skipped (out of scope)", value: nfmt(skipped) },
      { label: "Failed", value: nfmt(failed) },
    ];
    const newLeads = Array.isArray(after.newLeads)
      ? (after.newLeads as unknown[])
          .map((l) => (asRecord(l as Prisma.JsonValue) ? (l as { name?: unknown; location?: unknown }) : null))
          .filter(Boolean)
          .map((l) => ({ name: String(l!.name ?? "Unknown"), location: String(l!.location ?? "—") }))
      : undefined;
    return { summary, rows, newLeads: newLeads?.length ? newLeads : undefined };
  }

  // ── Archive ──
  if (entry.action === "Leads archived from Teleduce" && after) {
    const count = num(after.count);
    return {
      summary: `${plural(count, "lead")} archived — no longer present in Corefactors`,
      rows: [{ label: "Archived", value: nfmt(count) }],
    };
  }

  // ── Writeback ──
  if (entry.action === "Teleduce stage updated" && after) {
    return { summary: `Pushed stage "${String(after.stage ?? "?")}" to Corefactors`, rows: kvRows(after) };
  }
  if (entry.action === "Teleduce writeback failed" && after) {
    return { summary: `Writeback failed after ${num(after.attempts)} attempt(s)`, rows: kvRows(after) };
  }

  // ── Generic: clean key/value rows, never a raw JSON dump ──
  return { summary: entry.action, rows: [...kvRows(before, "Was: "), ...kvRows(after)] };
}

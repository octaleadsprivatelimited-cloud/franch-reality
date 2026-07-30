import { z } from "zod";

/**
 * Safely turn Next's raw searchParams into a typed filter object.
 * - Flattens repeated keys (`?a=1&a=2` → "1") so `z.string()` fields don't blow up.
 * - Uses safeParse and falls back to the schema's own defaults on any bad value
 *   (e.g. a hand-edited `?page=0`), so a malformed URL degrades gracefully instead
 *   of throwing an unhandled 500 on an admin/list page.
 */
export function parseSearchParams<S extends z.ZodTypeAny>(
  schema: S,
  sp: Record<string, string | string[] | undefined>,
): z.infer<S> {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) flat[k] = Array.isArray(v) ? v[0] : v;
  const parsed = schema.safeParse(flat);
  return parsed.success ? parsed.data : (schema.parse({}) as z.infer<S>);
}

/**
 * Like parseSearchParams but preserves repeated keys (`?bhk=2&bhk=3` → ["2","3"])
 * for the given `arrayKeys`, so multi-select checkbox filters survive the round-trip.
 * Scalar keys still collapse to their first value. Falls back to schema defaults.
 */
export function parseListParams<S extends z.ZodTypeAny>(
  schema: S,
  sp: Record<string, string | string[] | undefined>,
  arrayKeys: readonly string[],
): z.infer<S> {
  const arr = new Set(arrayKeys);
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    obj[k] = arr.has(k) ? (Array.isArray(v) ? v : [v]) : Array.isArray(v) ? v[0] : v;
  }
  const parsed = schema.safeParse(obj);
  return parsed.success ? parsed.data : (schema.parse({}) as z.infer<S>);
}

/** The inventory filter keys that are multi-select arrays. */
export const INVENTORY_ARRAY_KEYS = [
  "localityId",
  "propertyType",
  "buildingClassification",
  "transactionType",
  "bhk",
  "availabilityStatus",
] as const;

/** The leads filter keys that are multi-select arrays. */
export const LEAD_ARRAY_KEYS = ["localityId", "propertyType", "bhk"] as const;

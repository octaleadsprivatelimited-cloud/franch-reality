import { z } from "zod";
import {
  LEAD_SORT_VALUES,
  LEAD_WITHIN_VALUES,
  LEAD_WITHIN_FIELDS,
} from "@/lib/lead-filters";

// CRM lead fields are read-only in the platform (synced from Teleduce),
// so we only validate list filters here, not create/update input.
export const leadFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  city: z.enum(["HYDERABAD", "CHENNAI"]).optional(),
  stage: z.string().trim().max(120).optional(),
  transactionType: z.enum(["SALE", "RENT"]).optional(),
  // Activity buckets derived from the Teleduce stage flags (active / won / lost).
  activity: z.enum(["active", "won", "lost", "all"]).default("active"),

  // Multi-select requirement facets (repeated keys in the URL).
  propertyType: z.array(z.enum(["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"])).optional(),
  bhk: z.array(z.coerce.number().int().min(0).max(20)).optional(),
  /** Preferred localities (the lead's preferred locations). */
  localityId: z.array(z.coerce.number().int().positive()).optional(),

  // Provenance.
  source: z.string().trim().max(120).optional(),
  owner: z.string().trim().max(120).optional(),
  // Internal assigned agent (a User id, or the sentinel "__unassigned__" for none).
  assignedAgentId: z.string().trim().max(40).optional(),

  // Budget overlap (absolute INR). Matches leads whose budget range overlaps the bounds.
  budgetMinInr: z.coerce.number().min(0).optional(),
  budgetMaxInr: z.coerce.number().min(0).optional(),

  // "Pulled in the last 30 min / 1 hour / …" — window + which timestamp it applies to.
  within: z.enum(LEAD_WITHIN_VALUES).optional(),
  withinField: z.enum(LEAD_WITHIN_FIELDS).default("created"),

  // Derived flags.
  matched: z.enum(["any", "yes", "no"]).default("any"),
  contact: z.enum(["any", "mobile", "email"]).default("any"),
  archived: z.enum(["exclude", "include", "only"]).default("exclude"),

  sort: z.enum(LEAD_SORT_VALUES).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
});

export type LeadFilter = z.infer<typeof leadFilterSchema>;

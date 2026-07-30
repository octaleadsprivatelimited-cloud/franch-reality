import { z } from "zod";
import type { City } from "@prisma/client";
import type { TeleduceClient, TeleduceLead } from "./types";
import { parseRequirementText, findLocalities, inferCity } from "./requirement-parser";
import { findStage } from "./mapping";

interface CorefactorsConfig {
  baseUrl: string;
  apiKey: string;
  cityFilter: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Corefactors/Teleduce adapter — wired to the CONFIRMED Bulk Lead retrieval
// API (doc "Bulk Lead retrieval API_4", verified live 2026-06-17):
//   POST https://teleduce.corefactors.in/lead/retrieval/
//   header API-KEY: <key>   body {"page":n,"record_size":1-100}
//   → { response:[…leads…], response_code:"7000", response_type:"success",
//       is_more_leads_available: true|false }
// The feed populates the structured custom fields (Budget/Bedrooms/Property
// Type/Area of Interest/Lead Types) for only part of its leads; the buyer's
// requirement otherwise lives as free text in "Lead Requirement". We therefore
// map each field STRUCTURED-FIRST and fall back to the requirement parser, and
// infer the city from any recognised locality (the feed never carries a city).
//
// WRITEBACK (pushing a match outcome back to the lead's pipeline stage) is NOT
// yet possible: Corefactors has not provided a stage-update API. canWriteback is
// false so the writeback layer records intent as a clean PENDING without churning
// until the provider supplies a supported stage-update API (see RUNBOOK).
// ─────────────────────────────────────────────────────────────────────────────

const RETRIEVAL_PATH = "/lead/retrieval/";
const PAGE_SIZE = 100; // API hard maximum per call
const MAX_PAGES = 250; // safety cap (25k leads) — the empty/last-page check ends it normally
const REQUEST_TIMEOUT_MS = 30_000;

type RawLead = Record<string, unknown>;
// Runtime guard on the envelope shape so a Corefactors API change surfaces as a
// logged warning + clean stop, rather than silently feeding garbage into mapping.
const retrievalResponseSchema = z.object({
  response: z.union([z.array(z.record(z.string(), z.unknown())), z.string()]),
  response_code: z.union([z.string(), z.number()]).optional(),
  response_type: z.string().optional(),
  is_more_leads_available: z.union([z.boolean(), z.string()]).optional(),
});
type RetrievalResponse = z.infer<typeof retrievalResponseSchema>;

/** Raised when writeback is attempted but the live API has no stage-update endpoint. */
export class WritebackUnavailableError extends Error {
  constructor() {
    super("Corefactors stage-update API not available — writeback cannot be pushed yet.");
    this.name = "WritebackUnavailableError";
  }
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * Split a multi-value field into clean tokens. The retrieval API comma/slash/semicolon-
 * separates (e.g. "3 BHK, 4 BHK"); the real-time webhook instead bracket-wraps each value
 * (e.g. "[3 BHK][4 BHK]", "[Jubilee hills]"). Splitting on brackets too handles BOTH shapes.
 */
function splitMulti(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return s
    .split(/[,;/[\]]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Resolve the lead's stable id ACROSS both delivery channels so a lead synced via the
 * 30-min pull AND the real-time webhook maps to ONE record (idempotent upsert key).
 * The Bulk Retrieval API returns `ID` = "LD69260274". The webhook instead sends the bare
 * number as `lead_unique_id` = "69260274" and omits `ID` — so we prefix it with "LD" to
 * match the retrieval form. (Verified live 2026-07: same lead, mobile 8978719199 →
 * retrieval ID "LD69260274" == webhook lead_unique_id "69260274".)
 */
function resolveLeadId(row: RawLead): string {
  const direct = str(row["ID"]) ?? str(row["id"]);
  if (direct) return direct;
  const uniq = str(row["lead_unique_id"]);
  if (uniq) return /^LD/i.test(uniq) ? uniq : `LD${uniq}`;
  return "";
}

/**
 * Structured "Budget" may be {amount, currency_code} or a string. Returns the
 * amount EXACTLY as received from Corefactors (no clamping/alteration); only "00"
 * / "0" / empty — i.e. "no budget given" — map to null.
 */
function structuredBudget(row: RawLead): number | null {
  const b = row["Budget"];
  let amt: string | null = null;
  if (b && typeof b === "object" && "amount" in (b as Record<string, unknown>)) {
    amt = String((b as Record<string, unknown>).amount ?? "");
  } else if (typeof b === "string" || typeof b === "number") {
    amt = String(b);
  }
  if (!amt) return null;
  const n = Number(amt.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const cityLabel = (c: City | null): string | null =>
  c === "HYDERABAD" ? "Hyderabad" : c === "CHENNAI" ? "Chennai" : null;

// Resolve the lead's pipeline stage. The feed carries a granular "Leads Stages"
// field for many leads (e.g. "Registration completed", "Site visit scheduled",
// "Purchased elsewhere") — use it when it maps to a known stage. Otherwise fall
// back to the coarse "Lead Status" (only Open/Closed): Open → an active stage,
// Closed → a non-active one. This keeps won/lost classification correct (a Closed
// lead is usually a completed registration, i.e. WON — not "not interested").
function resolveStage(row: RawLead): { id: number | null; display: string } {
  const granular = findStage(str(row["Leads Stages"]));
  if (granular) return { id: granular.id, display: granular.display };
  const s = (str(row["Lead Status"]) ?? "").toLowerCase();
  if (s === "closed") return { id: 23591, display: "Purchased elsewhere" }; // non-active, neutral closed
  return { id: 22042, display: "Not yet contacted" }; // Open / unknown → active & visible
}

// Convert Corefactors "YYYY-MM-DD HH:MM:SS" (IST, no tz) to an ISO instant.
function parseTimestamp(s: string | null): string {
  if (!s) return new Date().toISOString();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Map a raw Corefactors lead → our normalised TeleduceLead, structured-first with
// a free-text "Lead Requirement" fallback for each field. Exported (not just a
// private method) so the dry-run preview, the loader and unit tests can map a
// saved corpus offline with the exact production logic.
export function mapRawLeadToTeleduceLead(row: RawLead): TeleduceLead {
  const requirement = str(row["Lead Requirement"]) ?? "";
  const parsed = parseRequirementText(requirement);

  // City: the feed never carries a city → infer it. An explicit city WORD (almost
  // always in the requirement text) must win over a structured Area-of-Interest
  // locality, since city is the agent access-control key — so infer over the
  // combined text (requirement first), which checks explicit city words before
  // falling back to a locality's city.
  const aoiText = [str(row["Area of Interest"]), str(row["Location"]), str(row["City"])]
    .filter(Boolean)
    .join(", ");
  const city = inferCity([requirement, aoiText].filter(Boolean).join(" ")) ?? parsed.city;

  // Budget: structured amount EXACTLY as received → else the free-text price when
  // the structured field is absent. No clamping/alteration of the value.
  const budget = structuredBudget(row) ?? parsed.priceInr;

  // Property type: structured label (Apartment/Villa/Plot/Office/Retail/RnR) → parsed.
  const propertyType = str(row["Property Type"]) ?? parsed.propertyTypeLabel;

  // Bedrooms: structured multi-value ("3 BHK, 4 BHK", "6 BHK and more", "0") → parsed.
  const bedStruct = splitMulti(row["Bedrooms"]);
  const bedrooms = bedStruct.length ? bedStruct : parsed.bhk.map((n) => `${n} BHK`);

  // Lead type: the structured "Lead Types" value AS RECEIVED ("Residential Sale",
  // "Commercial Rental", "Unknown", …) → only when it is absent do we derive a
  // label from the free-text requirement. The received value is never overridden.
  let leadType = str(row["Lead Types"]);
  if (!leadType && parsed.transaction) {
    const usage = parsed.isCommercial ? "Commercial" : "Residential";
    leadType = `${usage} ${parsed.transaction === "SALE" ? "Sale" : "Rental"}`;
  }

  // Area of interest: structured AoI + Location tokens + parsed localities (deduped).
  // matchLocalities (sync) resolves these against the master, city-scoped.
  const areaOfInterest = [
    ...new Set([
      ...splitMulti(row["Area of Interest"]),
      ...splitMulti(row["Location"]),
      ...findLocalities(requirement, city),
    ]),
  ];

  const stage = resolveStage(row);

  return {
    teleduceLeadId: resolveLeadId(row),
    firstName: str(row["First Name"]) ?? "Unknown",
    lastName: str(row["Last Name"]),
    mobile: str(row["Mobile"]),
    email: str(row["Email"]),
    budget,
    city: cityLabel(city),
    areaOfInterest,
    propertyType,
    bedrooms,
    leadType,
    leadSource: str(row["Lead Source"]),
    leadOwner: str(row["Lead Owner"]),
    stageId: stage.id,
    stageDisplay: stage.display,
    updatedAt: parseTimestamp(str(row["modified_at"]) ?? str(row["created_at"])),
    raw: row,
  };
}

export class CorefactorsClient implements TeleduceClient {
  readonly mode = "live" as const;
  readonly canWriteback = false; // no stage-update API yet (read-only integration)
  private readonly base: string;

  constructor(private cfg: CorefactorsConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
  }

  async listLeads(): Promise<TeleduceLead[]> {
    const url = `${this.base}${RETRIEVAL_PATH}`;
    const out: TeleduceLead[] = [];
    let page = 1;
    for (;;) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "API-KEY": this.cfg.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ page, record_size: PAGE_SIZE }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`Teleduce retrieval HTTP ${res.status} ${res.statusText} (page ${page})`);
      }
      const parsed = retrievalResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        // Shape drift from Corefactors → log once and stop (don't map garbage).
        console.error(
          JSON.stringify({
            level: "warn",
            event: "teleduce_response_shape_mismatch",
            page,
            issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") || "(root)"),
          }),
        );
        break;
      }
      const body: RetrievalResponse = parsed.data;
      const type = String(body.response_type ?? "").toLowerCase();
      // 7008 = "No More Leads" is a benign terminator, not an error.
      if (type === "error") {
        if (String(body.response_code) === "7008") break;
        // Only surface the code + a short scrubbed snippet of a STRING message —
        // never serialize a raw row array (which could carry lead PII) into an
        // error that gets persisted to SyncLog / returned over HTTP.
        const snippet = typeof body.response === "string" ? ` ${body.response.slice(0, 120)}` : "";
        throw new Error(`Teleduce retrieval error ${body.response_code ?? "?"}${snippet}`.trim());
      }
      const rows = Array.isArray(body.response) ? body.response : [];
      // Map each row in isolation: a single hostile row can't abort the whole pull.
      for (const row of rows) {
        try {
          out.push(mapRawLeadToTeleduceLead(row));
        } catch {
          /* skip an unmappable row; the per-lead upsert loop also tolerates failures */
        }
      }

      const more = String(body.is_more_leads_available).toLowerCase() === "true";
      if (!more || rows.length === 0) break;
      page += 1;
      if (page > MAX_PAGES) break;
    }

    // App-layer city scope (defence in depth; the feed has no server-side filter).
    const cities = this.cfg.cityFilter
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    return cities.length
      ? out.filter((l) => !l.city || cities.some((c) => l.city!.toLowerCase().includes(c)))
      : out;
  }

  // Defensive: the writeback layer checks canWriteback first and never reaches
  // here for the live client, but if it ever does, fail loudly & specifically.
  async updateLeadStage(): Promise<void> {
    throw new WritebackUnavailableError();
  }
}

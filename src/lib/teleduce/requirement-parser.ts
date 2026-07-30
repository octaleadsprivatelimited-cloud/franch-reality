import type { City } from "@prisma/client";
import { SEED_LOCALITIES } from "@/data/localities";

// ─────────────────────────────────────────────────────────────────────────────
// Free-text "Lead Requirement" parser for the live Corefactors Bulk Lead
// retrieval feed. The live CRM populates the structured custom fields (Budget,
// Bedrooms, Property Type, Area of Interest, Lead Types) for only part of its
// leads; the rest carry the buyer's requirement as free text in a single field,
// in several shapes seen in the real data:
//   • Portal:      "18500000, 3Bed  Apartment for Sale in Aditya Beaumont, Jubilee Hills, Hyderabad"
//   • MagicBricks: "This user is looking for 3 BHK Multistorey Apartment for Rent in Hitech City, Hyderabad ..."
//   • Agent log:   "Aj-Log: Call back cx requirement for 3bhk under 75K in JUB BAN"
//   • Pure note:   "Not answering whats app msg sent."   (no requirement → nothing extracted)
// The corefactors client prefers the structured fields and falls back to this
// parser field-by-field, so a lead is mapped as richly as the data allows.
// Everything here is pure (no DB) — locality resolution uses the static master.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedRequirement {
  /** Absolute INR from the leading/most-salient money token, or null. */
  priceInr: number | null;
  /** Bedroom counts found (e.g. [3] or [2,3]); excludes 0. */
  bhk: number[];
  /** Normalised to a label mapping.ts understands: Apartment/Villa/Plot/Office/Retail. */
  propertyTypeLabel: string | null;
  isCommercial: boolean;
  transaction: "SALE" | "RENT" | null;
  /** Canonical locality names (from the master) found in the text, city-scoped when city known. */
  localityNames: string[];
  /** City inferred from explicit mention or from a recognised locality. */
  city: City | null;
}

// ── Locality master, indexed for fast substring matching ─────────────────────
interface LocalityCand {
  name: string; // canonical display name (matches DB Locality.name)
  city: City;
  re: RegExp; // whole-token matcher for this label
  len: number; // label length — longer = more specific, wins ties
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build once: every locality contributes its display name AND its raw Teleduce
// "Area of Interest" value (spelling variants like Velacherry/Velachery), each as
// a word-boundary-ish regex so "Adyar" doesn't match inside "Adyarpalam".
const LOCALITY_CANDS: LocalityCand[] = (() => {
  const out: LocalityCand[] = [];
  const seen = new Set<string>();
  for (const l of SEED_LOCALITIES) {
    for (const label of [l.name, l.teleduceAreaOfInterestValue]) {
      const key = `${l.city}:${label.toLowerCase()}`;
      if (!label || seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: l.name,
        city: l.city,
        re: new RegExp(`(^|[^a-z0-9])${escapeRe(label.toLowerCase())}([^a-z0-9]|$)`),
        len: label.length,
      });
    }
  }
  // Longest labels first so the most specific match wins.
  return out.sort((a, b) => b.len - a.len);
})();

// Common Hyderabad shorthand seen in agent logs → canonical locality name. Only
// applied as whole uppercase/standalone tokens to avoid false positives.
const ABBREVIATIONS: { re: RegExp; name: string; city: City }[] = [
  { re: /\bjub\b/i, name: "Jubilee Hills", city: "HYDERABAD" },
  { re: /\bban\b/i, name: "Banjara Hills", city: "HYDERABAD" },
  { re: /\bmad\b/i, name: "Madhapur", city: "HYDERABAD" },
  { re: /\bgachi\b/i, name: "Gachibowli", city: "HYDERABAD" },
  { re: /\bhitec\b|\bhitex\b/i, name: "Hitech City", city: "HYDERABAD" },
  { re: /\bkondapur\b/i, name: "Kondapur", city: "HYDERABAD" },
];

/** Find canonical locality names present in free text, optionally scoped to a city. */
export function findLocalities(text: string, city?: City | null): string[] {
  if (!text) return [];
  const hay = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  const taken = new Set<string>();
  for (const c of LOCALITY_CANDS) {
    if (city && c.city !== city) continue;
    if (taken.has(c.name)) continue;
    if (c.re.test(hay)) {
      taken.add(c.name);
      found.push(c.name);
    }
  }
  for (const a of ABBREVIATIONS) {
    if (city && a.city !== city) continue;
    if (taken.has(a.name)) continue;
    if (a.re.test(text)) {
      taken.add(a.name);
      found.push(a.name);
    }
  }
  return found;
}

/** Infer the city from explicit mention, then from any recognised locality. */
export function inferCity(text: string): City | null {
  if (!text) return null;
  const l = text.toLowerCase();
  if (/\bhyderabad\b|\bhyd\b|\btelangana\b|\bsecunderabad\b|\bsecundrabad\b/.test(l)) return "HYDERABAD";
  if (/\bchennai\b|\bchn\b|\btamil\s*nadu\b/.test(l)) return "CHENNAI";
  // Fall back to the city of the first/most-specific recognised locality.
  const locs = findLocalities(text);
  if (locs.length) {
    const match = LOCALITY_CANDS.find((c) => c.name === locs[0]);
    if (match) return match.city;
  }
  return null;
}

// ── Money ────────────────────────────────────────────────────────────────────
// Parse a single money token like "75K", "3L", "1.4 lakhs", "1.85 cr", "18500000".
function parseMoneyToken(numStr: string, unit: string | undefined): number | null {
  const n = Number(numStr.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = (unit ?? "").toLowerCase();
  if (/^cr|^crore/.test(u)) return n * 1e7;
  if (/^l$|^lac|^lakh|^lkh/.test(u)) return n * 1e5;
  if (/^k$/.test(u)) return n * 1e3;
  return n;
}

/**
 * Extract the most salient INR amount from free text. Prefers an explicit
 * unitised token (e.g. "75K", "3L", "1.85cr"); otherwise the leading bare number
 * (the portal format starts with the absolute amount). Returns null if none.
 */
export function parseRequirementPrice(text: string): number | null {
  if (!text) return null;
  // 1) leading bare amount (portal format: "18500000, 2Bed Apartment ...")
  const lead = text.match(/^\s*([\d][\d,]{2,})(?:\.\d+)?\s*(?:,|\b)/);
  // 2) unitised tokens anywhere ("under 75K", "3L rent", "1.4lkhs", "budget 550k")
  const unitMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lkhs?|l|k)\b/gi)];
  const candidates: number[] = [];
  if (lead) {
    const v = parseMoneyToken(lead[1], undefined);
    if (v != null) candidates.push(v);
  }
  for (const m of unitMatches) {
    const v = parseMoneyToken(m[1], m[2]);
    if (v != null) candidates.push(v);
  }
  if (!candidates.length) return null;
  // The buyer's stated budget/price is the largest plausible figure (handles
  // "65k to 70k" → 70000, and ignores stray small numbers like "2500sft").
  return Math.max(...candidates);
}

// ── Bedrooms ─────────────────────────────────────────────────────────────────
/** All bedroom counts in the text: "3bhk", "2 BHK", "3Bed", "1-2bhk", "3+ BHK". */
export function parseRequirementBhk(text: string): number[] {
  if (!text) return [];
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d+)\s*(?:\+|-\s*\d+)?\s*(?:bhk|bed(?:room)?s?)\b/gi)) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 20) out.add(n);
  }
  // "1-2bhk" → also capture the upper bound.
  for (const m of text.matchAll(/(\d+)\s*-\s*(\d+)\s*(?:bhk|bed)/gi)) {
    const hi = parseInt(m[2], 10);
    if (hi > 0 && hi <= 20) out.add(hi);
  }
  return [...out].sort((a, b) => a - b);
}

// ── Property type ────────────────────────────────────────────────────────────
const TYPE_RULES: { re: RegExp; label: string; commercial: boolean }[] = [
  { re: /showroom/i, label: "Retail", commercial: true },
  { re: /\bretail\b|\bshop\b|\bmall\b/i, label: "Retail", commercial: true },
  { re: /\boffice\b|commercial\s*space|\bcommercial\b|co-?working|workspace/i, label: "Office", commercial: true },
  { re: /warehouse|godown|industrial/i, label: "Office", commercial: true },
  { re: /independent\s*house|individual\s*house|\bvilla\b|duplex|row\s*house|bungalow/i, label: "Villa", commercial: false },
  { re: /\bplot\b|\bland\b|open\s*plot/i, label: "Plot", commercial: false },
  { re: /apartment|\bflat\b|multistorey|gated\s*community|\bstudio\b/i, label: "Apartment", commercial: false },
];

export function parseRequirementPropertyType(text: string): { label: string | null; commercial: boolean } {
  if (text) {
    for (const r of TYPE_RULES) {
      if (r.re.test(text)) return { label: r.label, commercial: r.commercial };
    }
  }
  return { label: null, commercial: false };
}

// ── Transaction ──────────────────────────────────────────────────────────────
export function parseRequirementTransaction(text: string): "SALE" | "RENT" | null {
  if (!text) return null;
  const l = text.toLowerCase();
  const forSale = /\bfor\s+sale\b/.test(l);
  const forRent = /\bfor\s+(?:rent|lease|rental)\b/.test(l);
  if (forSale && !forRent) return "SALE";
  if (forRent && !forSale) return "RENT";
  const hasSale = /\bsale\b/.test(l);
  const hasRent = /\b(?:rent|lease|rental)\b/.test(l);
  if (hasSale && !hasRent) return "SALE";
  if (hasRent && !hasSale) return "RENT";
  return null;
}

/** Parse a full free-text requirement into its component buyer preferences. */
export function parseRequirementText(text: string | null | undefined): ParsedRequirement {
  const t = (text ?? "").trim();
  const city = inferCity(t);
  const { label, commercial } = parseRequirementPropertyType(t);
  return {
    priceInr: parseRequirementPrice(t),
    bhk: parseRequirementBhk(t),
    propertyTypeLabel: label,
    isCommercial: commercial,
    transaction: parseRequirementTransaction(t),
    localityNames: findLocalities(t, city),
    city,
  };
}

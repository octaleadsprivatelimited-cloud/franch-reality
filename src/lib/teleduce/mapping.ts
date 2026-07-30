import type {
  City,
  CommercialOrResidential,
  MatchStatus,
  PropertyType,
  TransactionType,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Corefactors Teleduce field and stage catalogue used by the integration mapping.
// Keep changes here aligned with the client's CRM configuration.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeleduceStage {
  id: number;
  display: string;
  isWon: boolean;
  isLost: boolean;
  /** Active = a live buyer requirement that should surface in the platform. */
  isActive: boolean;
}

export const TELEDUCE_STAGES: TeleduceStage[] = [
  { id: 22042, display: "Not yet contacted", isWon: false, isLost: false, isActive: true },
  { id: 22043, display: "Tried to contact but unreachable Or switched off", isWon: false, isLost: false, isActive: true },
  { id: 22044, display: "Contacted but busy call back later", isWon: false, isLost: false, isActive: true },
  { id: 22045, display: "Contacted but not interested", isWon: false, isLost: true, isActive: false },
  { id: 22046, display: "Site visit scheduled", isWon: false, isLost: false, isActive: true },
  { id: 22047, display: "Under negotiation", isWon: false, isLost: false, isActive: true },
  { id: 22048, display: "Pending registration", isWon: false, isLost: false, isActive: true },
  { id: 18511, display: "Contacted and Details Shared", isWon: false, isLost: false, isActive: true },
  { id: 14277, display: "Site visit completed", isWon: false, isLost: false, isActive: true },
  { id: 14282, display: "Registration completed", isWon: true, isLost: false, isActive: false },
  { id: 22050, display: "Suitable property not available", isWon: false, isLost: true, isActive: false },
  { id: 22388, display: "RNR", isWon: false, isLost: false, isActive: true },
  { id: 23591, display: "Purchased elsewhere", isWon: false, isLost: true, isActive: false },
];

const stageByDisplay = new Map(
  TELEDUCE_STAGES.map((s) => [s.display.trim().toLowerCase(), s]),
);

export function findStage(display: string | null | undefined): TeleduceStage | undefined {
  if (!display) return undefined;
  return stageByDisplay.get(display.trim().toLowerCase());
}

export function isActiveStage(display: string | null | undefined): boolean {
  const s = findStage(display);
  // Unknown stages are treated as active so we never silently hide a live lead.
  return s ? s.isActive : true;
}

// Display-name buckets for stage-activity filtering — shared by the leads list
// and the property→leads matching candidate query so both directions agree on
// what counts as a "live" lead.
export const ACTIVE_STAGE_DISPLAYS = TELEDUCE_STAGES.filter((s) => s.isActive).map((s) => s.display);
export const WON_STAGE_DISPLAYS = TELEDUCE_STAGES.filter((s) => s.isWon).map((s) => s.display);
export const LOST_STAGE_DISPLAYS = TELEDUCE_STAGES.filter((s) => s.isLost).map((s) => s.display);

// Writeback: our internal MatchStatus → the Teleduce stage to push.
// SHORTLISTED stays internal (no writeback) to avoid polluting the CRM with
// intermediate decisions.
export const MATCH_STATUS_TO_TELEDUCE_STAGE: Record<MatchStatus, string | null> = {
  SHORTLISTED: null,
  SHARED: "Contacted and Details Shared",
  CLOSED_WON: "Registration completed",
  CLOSED_LOST: "Contacted but not interested",
  CLOSED_NEUTRAL: "Suitable property not available",
};

export function teleduceStageForMatch(status: MatchStatus): TeleduceStage | null {
  const display = MATCH_STATUS_TO_TELEDUCE_STAGE[status];
  if (!display) return null;
  return findStage(display) ?? null;
}

// ── Property Type field (Villa / Apartment / Plot / Office / Retail / RnR) ──
export function mapTeleducePropertyType(
  value: string | null | undefined,
): { propertyType: PropertyType; usage: CommercialOrResidential } | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "apartment":
      return { propertyType: "APARTMENT", usage: "RESIDENTIAL" };
    case "villa":
      return { propertyType: "VILLA", usage: "RESIDENTIAL" };
    case "plot":
      return { propertyType: "PLOT", usage: "RESIDENTIAL" };
    case "office":
    case "retail":
    case "rnr": // RnR = commercial misc in the client's data
      return { propertyType: "COMMERCIAL", usage: "COMMERCIAL" };
    default:
      return null;
  }
}

// ── "Location" classification field → transaction type + usage ──
// Options: Residential Sale/Rental, Commercial Sale/Rental, Mix, Agent, Unknown.
export function mapTeleduceUsage(value: string | null | undefined): {
  transactionType: TransactionType;
  usage: CommercialOrResidential;
} | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "residential sale":
      return { transactionType: "SALE", usage: "RESIDENTIAL" };
    case "residential rental":
      return { transactionType: "RENT", usage: "RESIDENTIAL" };
    case "commercial sale":
      return { transactionType: "SALE", usage: "COMMERCIAL" };
    case "commercial rental":
      return { transactionType: "RENT", usage: "COMMERCIAL" };
    default:
      return null; // Mix / Agent / Unknown → leave unspecified
  }
}

// ── Bedrooms field ("3 BHK", "6 BHK and more", "1 BHK", "0") → number ──
export function mapTeleduceBhk(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// City comes through as free text in Teleduce; normalise to our enum.
export function mapTeleduceCity(value: string | null | undefined): City | null {
  if (!value) return null;
  const l = value.trim().toLowerCase();
  if (l.includes("hyderabad") || l === "hyd") return "HYDERABAD";
  if (l.includes("chennai") || l === "chn") return "CHENNAI";
  return null;
}

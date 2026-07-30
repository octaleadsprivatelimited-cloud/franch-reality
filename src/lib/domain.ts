import type {
  AssignmentStatus,
  AvailabilityStatus,
  BuildingClassification,
  City,
  CommercialOrResidential,
  Furnishing,
  PropertyType,
  TransactionType,
  PriceUnit,
  MatchStatus,
} from "@prisma/client";

// Authenticated attachment URL (served via /api/attachments/[id], not the bucket).
export const attachmentUrl = (id: string): string => `/api/attachments/${id}`;

// ── City ──
export const CITIES: City[] = ["HYDERABAD", "CHENNAI"];
export const cityLabel: Record<City, string> = {
  HYDERABAD: "Hyderabad",
  CHENNAI: "Chennai",
};
export function cityFromLabel(label: string): City | null {
  const l = label.trim().toLowerCase();
  if (l === "hyderabad" || l === "hyd") return "HYDERABAD";
  if (l === "chennai" || l === "chn") return "CHENNAI";
  return null;
}

/** Approximate city-centre coordinates. Fallback for admin-added locations that
 *  omit exact lat/long (the location is then flagged `approxCoords`). */
export const CITY_CENTER: Record<City, { latitude: number; longitude: number }> = {
  HYDERABAD: { latitude: 17.385, longitude: 78.4867 },
  CHENNAI: { latitude: 13.0827, longitude: 80.2707 },
};

// ── Building classification ──
export const BUILDING_CLASSIFICATIONS: BuildingClassification[] = [
  "GATED_COMMUNITY",
  "STAND_ALONE",
  "COMMERCIAL",
];
export const buildingClassificationLabel: Record<BuildingClassification, string> = {
  GATED_COMMUNITY: "Gated community",
  STAND_ALONE: "Stand alone",
  COMMERCIAL: "Commercial",
};

// ── Agent assignment working-status (agent-controlled, separate from Teleduce stage) ──
export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "NEW",
  "ATTEMPTED",
  "CONTACTED",
  "SITE_VISIT_SCHEDULED",
  "VISITED",
  "NEGOTIATING",
  "CLOSED_WON",
  "CLOSED_LOST",
];
export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  NEW: "New",
  ATTEMPTED: "Attempted contact",
  CONTACTED: "Contacted",
  SITE_VISIT_SCHEDULED: "Site visit scheduled",
  VISITED: "Visited",
  NEGOTIATING: "Negotiating",
  CLOSED_WON: "Closed – won",
  CLOSED_LOST: "Closed – lost",
};
/** CSS `.stage-pill` variant for an assignment status (reuses the lead badge palette). */
export function assignmentStatusVariant(s: AssignmentStatus): string {
  if (s === "CLOSED_WON") return "completed";
  if (s === "CLOSED_LOST") return "negative";
  if (s === "SITE_VISIT_SCHEDULED" || s === "VISITED" || s === "NEGOTIATING") return "site-scheduled";
  if (s === "CONTACTED" || s === "ATTEMPTED") return "contacted";
  return "";
}

// ── Property type ──
export const PROPERTY_TYPES: PropertyType[] = ["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"];
export const propertyTypeLabel: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  VILLA: "Villa",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
};

export const TRANSACTION_TYPES: TransactionType[] = ["SALE", "RENT"];
export const transactionTypeLabel: Record<TransactionType, string> = {
  SALE: "Sale",
  RENT: "Rent",
};

export const usageLabel: Record<CommercialOrResidential, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
};

export const AVAILABILITY_STATUSES: AvailabilityStatus[] = [
  "AVAILABLE",
  "BOOKED",
  "SOLD",
  "RENTED",
];
export const availabilityLabel: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  BOOKED: "Booked",
  SOLD: "Sold",
  RENTED: "Rented",
};

export const FURNISHINGS: Furnishing[] = ["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"];
export const furnishingLabel: Record<Furnishing, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-furnished",
  FURNISHED: "Furnished",
};

export const matchStatusLabel: Record<MatchStatus, string> = {
  SHORTLISTED: "Shortlisted",
  SHARED: "Shared with client",
  CLOSED_WON: "Closed — won",
  CLOSED_LOST: "Closed — lost",
  CLOSED_NEUTRAL: "Closed — neutral",
};

// Standard BHK options (client confirmed "Standard BHK format"; Teleduce offers 1–6+).
export const BHK_OPTIONS = [1, 2, 3, 4, 5, 6];

// ── Money ──
// All amounts are stored as absolute INR (priceInr). For SALE we display Lakh/Crore;
// for RENT we display ₹/month.
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatInr(amount: number): string {
  return `₹${inr.format(Math.round(amount))}`;
}

/** Trim trailing zeros from a fixed-decimal number ("4.80" → "4.8", "1.00" → "1"). */
function trimNum(n: number, maxDecimals: number): string {
  return n
    .toFixed(maxDecimals)
    .replace(/\.?0+$/, "");
}

export function formatPrice(
  amount: number,
  transactionType: TransactionType,
): string {
  if (transactionType === "RENT") {
    return `${formatInr(amount)}/mo`;
  }
  // Round into the display unit FIRST, then pick the band, so a value just below
  // 1 Cr that rounds to 100 L is shown as "₹1 Cr", never "₹100.0 L".
  const lakh = Math.round((amount / 1_00_000) * 10) / 10;
  if (lakh >= 100) {
    return `₹${trimNum(amount / 1_00_00_000, 2)} Cr`;
  }
  return `₹${trimNum(lakh, 1)} L`;
}

/**
 * Parse a human-typed price/budget like "50 L", "2 Cr", "50,00,000", "5000000"
 * into absolute INR. Returns null when blank/unparseable. Used by inventory
 * filters and budget inputs so agents can type the way the mockup shows ("50 L").
 */
export function parsePriceInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return null;
  if (/\b(cr|crore|crores)\b/.test(s)) return Math.round(num * 1_00_00_000);
  if (/\b(l|lac|lakh|lakhs|lacs)\b/.test(s)) return Math.round(num * 1_00_000);
  return Math.round(num);
}

// ── Card display helpers (match 03_UI_Mockup.html prop-card semantics) ──
/** CSS modifier for the .status-badge on a property card. */
export function statusBadgeClass(status: AvailabilityStatus): string {
  switch (status) {
    case "BOOKED":
      return "booked";
    case "SOLD":
      return "sold";
    case "RENTED":
      return "rented";
    default:
      return "";
  }
}

/** CSS modifier for the .tx-badge on a property card (rent = blue). */
export function txBadgeClass(t: TransactionType): string {
  return t === "RENT" ? "rent" : "";
}

/** Human card title, e.g. "3 BHK Apartment in Banjara Hills" / "Plot in Kondapur". */
export function propertyTitle(p: {
  bhk: number | null;
  propertyType: PropertyType;
  localityName: string;
}): string {
  const bhk = p.bhk ? `${p.bhk} BHK ` : "";
  return `${bhk}${propertyTypeLabel[p.propertyType]} in ${p.localityName}`;
}

/** Format a budget range (absolute INR min/max) for a lead, e.g. "₹80 L – ₹1.20 Cr". */
export function formatBudgetRange(
  minInr: number | null,
  maxInr: number | null,
  transactionType?: TransactionType | null,
): string {
  const tt = transactionType ?? "SALE";
  if (minInr == null && maxInr == null) return "Any budget";
  if (minInr != null && maxInr != null) {
    return `${formatPrice(minInr, tt)} – ${formatPrice(maxInr, tt)}`;
  }
  if (minInr != null) return `${formatPrice(minInr, tt)}+`;
  return `up to ${formatPrice(maxInr as number, tt)}`;
}

/** Convert a user-entered amount + unit into canonical absolute INR. */
export function toInr(amount: number, unit: PriceUnit): number {
  switch (unit) {
    case "CRORE":
      return amount * 1_00_00_000;
    case "LAKH":
      return amount * 1_00_000;
    case "PER_MONTH":
      return amount;
  }
}

/** Decompose an absolute INR amount into a display amount for the given unit. */
export function fromInr(amountInr: number, unit: PriceUnit): number {
  switch (unit) {
    case "CRORE":
      return amountInr / 1_00_00_000;
    case "LAKH":
      return amountInr / 1_00_000;
    case "PER_MONTH":
      return amountInr;
  }
}

/** Pick a sensible default display unit for an absolute INR amount + transaction. */
export function defaultPriceUnit(
  amountInr: number,
  transactionType: TransactionType,
): PriceUnit {
  if (transactionType === "RENT") return "PER_MONTH";
  return amountInr >= 1_00_00_000 ? "CRORE" : "LAKH";
}

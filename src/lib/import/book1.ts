import ExcelJS from "exceljs";
import type {
  AvailabilityStatus,
  BuildingClassification,
  City,
  CommercialOrResidential,
  Furnishing,
  PriceUnit,
  PropertyType,
  TransactionType,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Property bulk importer. Built to ingest the client's real (messy) inventory
// spreadsheet — the historical Book1.xlsx column shape is the REFERENCE, but the
// importer also accepts our clean downloadable template and tolerates header
// aliases. Key safety properties:
//   • Amounts are never silently mis-scaled: a bare "2.5" for a SALE is treated as
//     AMBIGUOUS (flagged), not ₹2.50. Use the Price Unit column or an L/Cr suffix.
//   • Rent vs sale is detected (transaction column / per-month amount / status),
//     so rentals are not all imported as SALE.
//   • Every numeric field is bounds-checked; implausible values are dropped + warned.
//   • Within-sheet duplicate FILE NOs: the LAST row wins; earlier ones are flagged.
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalityRef {
  id: number;
  name: string;
  city: City;
}

export interface MappedProperty {
  fileNo: string;
  city: City;
  localityId: number;
  transactionType: TransactionType;
  propertyType: PropertyType;
  commercialOrResidential: CommercialOrResidential;
  buildingClassification: BuildingClassification | null;
  bhk: number | null;
  builtUpAreaSqft: number | null;
  secondaryAreaSqft: number | null;
  facing: string | null;
  floor: string | null;
  parkingCount: number | null;
  priceInr: number;
  priceUnit: PriceUnit;
  maintenanceAmount: number | null;
  ageYears: number | null;
  furnishing: Furnishing | null;
  featuresText: string | null;
  additionalFeatures: string[];
  availabilityStatus: AvailabilityStatus;
  builderDeveloperName: string | null;
  description: string | null;
}

export interface RowResult {
  rowNumber: number;
  raw: Record<string, string>;
  mapped?: MappedProperty;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  totalRows: number;
  validRows: RowResult[];
  invalidRows: RowResult[];
  headers: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Canonical field → accepted header spellings (the client's sheet + our template).
const COLUMN_ALIASES: Record<string, string[]> = {
  fileNo: ["file no", "fileno", "file number", "ref", "reference", "ref no"],
  location: ["location", "area", "locality", "place", "neighbourhood"],
  status: ["not available", "status", "availability", "available"],
  builtUpArea: ["built up area", "builtup area", "built-up area", "area sqft", "sba", "super built up area", "area"],
  builtUpArea2: ["built up area 2", "carpet area", "secondary area", "plot area"],
  parking: ["parkings", "parking", "car parking", "parking count"],
  propertyType: ["property type", "type", "prop type"],
  buildingClassification: [
    "building classification",
    "classification",
    "building type",
    "gated or standalone",
    "gated/standalone",
  ],
  bhk: ["bhk", "configuration", "beds", "bedrooms"],
  facing: ["facing", "direction"],
  amount: ["amount", "price", "cost", "value", "expected price", "rent", "asking price"],
  priceUnit: ["price unit", "unit", "amount unit"],
  transaction: ["transaction", "transaction type", "for", "sale/rent", "listing type", "deal", "sale or rent"],
  maintenance: ["maintenance", "maintenance amount", "maint"],
  usage: ["commercial or residential", "usage", "category", "commercial/residential", "residential/commercial"],
  age: ["age", "property age", "age years", "age (years)"],
  floor: ["floor", "floor no", "floor number"],
  furnishing: ["furnishing", "furnished", "furnishing status"],
  features: ["features", "amenities", "additional features"],
  builder: ["builder", "developer", "builder/developer", "builder developer name", "builder name"],
  about: ["about", "description", "remarks", "notes", "details"],
  pricePerSqft: ["price per sqft", "rate", "rate per sqft", "psf"],
};

// Clean downloadable template columns (1:1 with the importer's canonical fields).
export const TEMPLATE_HEADERS = [
  "FILE NO",
  "CITY",
  "LOCATION",
  "TRANSACTION",
  "PROPERTY TYPE",
  "COMMERCIAL OR RESIDENTIAL",
  "BUILDING CLASSIFICATION",
  "BHK",
  "BUILT UP AREA",
  "CARPET AREA",
  "FACING",
  "FLOOR",
  "PARKINGS",
  "AMOUNT",
  "PRICE UNIT",
  "MAINTENANCE",
  "AGE",
  "FURNISHING",
  "FEATURES",
  "BUILDER",
  "STATUS",
  "ABOUT",
];

// ── Amount parsing (the critical safety fix) ──────────────────────────────────
interface PriceCell {
  num: number;
  unit: PriceUnit | null; // explicit unit detected in the cell, if any
}

export function parsePriceCell(raw: string): PriceCell | null {
  if (!raw) return null;
  const s = raw.toString().toLowerCase().replace(/₹|rs\.?|inr|,/g, "").trim();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let num = parseFloat(m[1]);
  const after = s.slice(s.indexOf(m[1]) + m[1].length);
  if (/\bk\b/.test(s) || /^\s*k/.test(after)) num *= 1000;
  if (!Number.isFinite(num) || num <= 0) return null;

  let unit: PriceUnit | null = null;
  if (/cr|crore/.test(s)) unit = "CRORE";
  else if (/lakh|lac\b|lacs|lakhs/.test(s) || /^\s*l\b/.test(after) || /\dl\b/.test(s)) unit = "LAKH";
  if (/per\s*month|\/\s*mo|\bp\.?m\b|month|monthly/.test(s)) unit = "PER_MONTH";
  return { num, unit };
}

/** Resolve a price cell into canonical INR + unit for a known transaction type. */
function resolvePrice(
  cell: PriceCell,
  transaction: TransactionType,
  unitHint: PriceUnit | null,
): { priceInr: number; priceUnit: PriceUnit } | { error: string } {
  if (transaction === "RENT") {
    if (cell.unit === "CRORE" || cell.unit === "LAKH" || unitHint === "CRORE" || unitHint === "LAKH") {
      return { error: "Rent should be a per-month amount, not Lakh/Crore." };
    }
    if (cell.num < 1000) {
      return { error: `Rent "${cell.num}" looks too small — enter the full monthly amount (e.g. 25000).` };
    }
    return { priceInr: Math.round(cell.num), priceUnit: "PER_MONTH" };
  }
  // SALE
  const unit = cell.unit && cell.unit !== "PER_MONTH" ? cell.unit : unitHint && unitHint !== "PER_MONTH" ? unitHint : null;
  if (cell.unit === "PER_MONTH" || unitHint === "PER_MONTH") {
    return { error: "Sale price has a per-month unit — set it to Lakh or Crore." };
  }
  if (unit === "CRORE") return { priceInr: Math.round(cell.num * 1_00_00_000), priceUnit: "CRORE" };
  if (unit === "LAKH") return { priceInr: Math.round(cell.num * 1_00_000), priceUnit: "LAKH" };
  // No unit → only safe if it's already a full absolute rupee figure.
  if (cell.num >= 1_00_000) {
    return { priceInr: Math.round(cell.num), priceUnit: cell.num >= 1_00_00_000 ? "CRORE" : "LAKH" };
  }
  return {
    error: `Ambiguous sale amount "${cell.num}" — add a unit (L/Cr) or fill the PRICE UNIT column.`,
  };
}

// Back-compat helper retained for scripts/tests; uses the new safe rules for SALE.
export function parseAmount(raw: string): { inr: number; unit: PriceUnit } | null {
  const cell = parsePriceCell(raw);
  if (!cell) return null;
  const res = resolvePrice(cell, cell.unit === "PER_MONTH" ? "RENT" : "SALE", null);
  return "error" in res ? null : { inr: res.priceInr, unit: res.priceUnit };
}

export function parsePropertyType(
  raw: string,
): { type: PropertyType; usage: CommercialOrResidential } | null {
  const s = norm(raw);
  if (!s) return null;
  if (/villa|independent|bungalow|house|duplex/.test(s)) return { type: "VILLA", usage: "RESIDENTIAL" };
  if (/apartment|flat|condo|penthouse/.test(s)) return { type: "APARTMENT", usage: "RESIDENTIAL" };
  if (/plot|land|layout|site/.test(s)) return { type: "PLOT", usage: "RESIDENTIAL" };
  if (/office|retail|shop|commercial|showroom|warehouse/.test(s)) return { type: "COMMERCIAL", usage: "COMMERCIAL" };
  return null;
}

/** Map free-text → BuildingClassification. Optional field: blank/unknown → null. */
export function parseBuildingClassification(raw: string): BuildingClassification | null {
  const s = norm(raw);
  if (!s) return null;
  if (/gated|community|complex|society|enclave|township/.test(s)) return "GATED_COMMUNITY";
  if (/stand\s*-?\s*alone|standalone|independent|individual/.test(s)) return "STAND_ALONE";
  if (/commercial|office|retail|shop|showroom|warehouse/.test(s)) return "COMMERCIAL";
  return null;
}

function parseBhk(raw: string): number | null {
  const m = (raw ?? "").match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 20 ? n : null;
}

/** Parse a bounded integer; returns { value, warning? }. Out-of-range → null + warning. */
function parseBounded(raw: string, min: number, max: number, label: string): { value: number | null; warning?: string } {
  const m = (raw ?? "").match(/(\d+)/);
  if (!m) return { value: null };
  const n = parseInt(m[1], 10);
  if (n < min || n > max) return { value: null, warning: `${label} "${n}" out of range — left blank` };
  return { value: n };
}

function parseFurnishing(raw: string): Furnishing | null {
  const s = norm(raw);
  if (!s) return null;
  if (/semi/.test(s)) return "SEMI_FURNISHED";
  if (/unfurnish|bare|none/.test(s)) return "UNFURNISHED";
  if (/furnish/.test(s)) return "FURNISHED";
  return null;
}

function detectTransaction(txRaw: string, statusRaw: string, priceUnit: PriceUnit | null): TransactionType {
  const t = norm(txRaw);
  if (/rent|lease|rental/.test(t)) return "RENT";
  if (/sale|sell|resale|buy/.test(t)) return "SALE";
  if (priceUnit === "PER_MONTH") return "RENT";
  if (/rent/.test(norm(statusRaw))) return "RENT";
  return "SALE";
}

function unitFromColumn(raw: string): PriceUnit | null {
  const s = norm(raw);
  if (/cr|crore/.test(s)) return "CRORE";
  if (/lakh|lac/.test(s)) return "LAKH";
  if (/month|pm|rent/.test(s)) return "PER_MONTH";
  return null;
}

function buildLocalityMatcher(localities: LocalityRef[]) {
  const byNorm = new Map<string, LocalityRef>();
  for (const l of localities) byNorm.set(norm(l.name), l);
  return (text: string): { match: LocalityRef | null; ambiguous: boolean } => {
    const t = norm(text);
    if (!t) return { match: null, ambiguous: false };
    if (byNorm.has(t)) return { match: byNorm.get(t)!, ambiguous: false };
    // Score substring candidates; require an unambiguous single best match.
    const cands: LocalityRef[] = [];
    for (const [n, l] of byNorm) {
      if (t.includes(n) || n.includes(t)) cands.push(l);
    }
    if (cands.length === 1) return { match: cands[0], ambiguous: false };
    if (cands.length > 1) {
      // Prefer the longest name contained in the text (most specific).
      cands.sort((a, b) => b.name.length - a.name.length);
      return { match: cands[0], ambiguous: true };
    }
    return { match: null, ambiguous: false };
  };
}

export async function parseBook1(
  buffer: Buffer,
  localities: LocalityRef[],
): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { totalRows: 0, validRows: [], invalidRows: [], headers: [] };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  const colByHeader = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const label = String(cell.value ?? "").trim();
    headers.push(label);
    colByHeader.set(norm(label), col);
  });

  // canonical field → column index, resolved via aliases.
  const colByField = new Map<string, number>();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const a of aliases) {
      const col = colByHeader.get(a);
      if (col != null) {
        colByField.set(field, col);
        break;
      }
    }
  }

  const matchLocality = buildLocalityMatcher(localities);
  const cellText = (row: ExcelJS.Row, col: number | undefined): string => {
    if (!col) return "";
    const v = row.getCell(col).value;
    if (v == null) return "";
    if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "").trim();
    if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result ?? "").trim();
    return String(v).trim();
  };

  const all: RowResult[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const field = (f: string) => cellText(row, colByField.get(f));
    const anyValue = headers.some((_, i) => cellText(row, i + 1) !== "");
    if (!anyValue) return;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => (raw[h || `Col${i + 1}`] = cellText(row, i + 1)));

    const errors: string[] = [];
    const warnings: string[] = [];

    const fileNo = field("fileNo");
    if (!fileNo) errors.push("Missing FILE NO");

    const locText = field("location");
    const loc = matchLocality(locText);
    if (!locText) errors.push("Missing LOCATION");
    else if (!loc.match) errors.push(`Locality "${locText}" not found in master`);
    else if (loc.ambiguous) warnings.push(`Locality "${locText}" matched ambiguously → ${loc.match.name}`);

    const typeInfo = parsePropertyType(field("propertyType"));
    if (!typeInfo) errors.push(`Unrecognised PROPERTY TYPE "${field("propertyType")}"`);

    const priceCell = parsePriceCell(field("amount"));
    if (!priceCell) errors.push(`Unparseable AMOUNT "${field("amount")}"`);

    const unitHint = unitFromColumn(field("priceUnit"));
    const transaction = detectTransaction(field("transaction"), field("status"), priceCell?.unit ?? unitHint);

    let priceInr: number | null = null;
    let priceUnit: PriceUnit = "LAKH";
    if (priceCell) {
      const res = resolvePrice(priceCell, transaction, unitHint);
      if ("error" in res) errors.push(res.error);
      else {
        priceInr = res.priceInr;
        priceUnit = res.priceUnit;
      }
    }

    // Usage: explicit column overrides type-derived.
    let usage: CommercialOrResidential | null = typeInfo?.usage ?? null;
    const usageRaw = norm(field("usage"));
    if (/commercial/.test(usageRaw)) usage = "COMMERCIAL";
    else if (/residential/.test(usageRaw)) usage = "RESIDENTIAL";

    // Availability from STATUS / transaction.
    const status = norm(field("status"));
    let availability: AvailabilityStatus = "AVAILABLE";
    if (status) {
      if (/sold/.test(status)) availability = "SOLD";
      else if (/rented/.test(status)) availability = "RENTED";
      else if (/book/.test(status)) availability = "BOOKED";
      else if (/available|yes\b/.test(status) && !/not/.test(status)) availability = "AVAILABLE";
      else if (status === "yes" || status === "1" || status === "true" || status === "x" || /not\s*available/.test(status))
        availability = "BOOKED";
    }

    // Building classification is optional; warn (don't fail) on an unrecognised value.
    const bcRaw = field("buildingClassification");
    const buildingClassification = parseBuildingClassification(bcRaw);
    if (bcRaw && !buildingClassification) {
      warnings.push(
        `Unrecognised BUILDING CLASSIFICATION "${bcRaw}" — left blank (use Gated community / Stand alone / Commercial).`,
      );
    }

    const bhk = parseBhk(field("bhk"));
    if ((typeInfo?.type === "APARTMENT" || typeInfo?.type === "VILLA") && bhk == null) {
      warnings.push("BHK missing for a residential unit");
    }

    const builtUp = parseBounded(field("builtUpArea"), 1, 1_000_000, "Built-up area");
    const carpet = parseBounded(field("builtUpArea2"), 1, 1_000_000, "Secondary area");
    const parking = parseBounded(field("parking"), 0, 50, "Parking");
    const age = parseBounded(field("age"), 0, 200, "Age");
    const maint = parseBounded(field("maintenance"), 0, 10_000_000, "Maintenance");
    for (const w of [builtUp.warning, carpet.warning, parking.warning, age.warning, maint.warning]) {
      if (w) warnings.push(w);
    }

    const featuresRaw = field("features");
    const additionalFeatures = featuresRaw
      ? featuresRaw.split(/[;,]/).map((x) => x.trim()).filter(Boolean).slice(0, 30)
      : [];

    const result: RowResult = { rowNumber, raw, errors, warnings };

    if (errors.length === 0 && loc.match && typeInfo && priceInr != null && usage) {
      result.mapped = {
        fileNo: fileNo.toUpperCase(),
        city: loc.match.city,
        localityId: loc.match.id,
        transactionType: transaction,
        propertyType: typeInfo.type,
        commercialOrResidential: usage,
        buildingClassification,
        bhk,
        builtUpAreaSqft: builtUp.value,
        secondaryAreaSqft: carpet.value,
        facing: field("facing") || null,
        floor: field("floor") || null,
        parkingCount: parking.value,
        priceInr,
        priceUnit,
        maintenanceAmount: maint.value,
        ageYears: age.value,
        furnishing: parseFurnishing(field("furnishing")),
        featuresText: field("features") || null,
        additionalFeatures,
        availabilityStatus: availability,
        builderDeveloperName: field("builder") || null,
        description: field("about") || null,
      };
    }
    all.push(result);
  });

  // Within-sheet duplicate FILE NO: last row wins; earlier ones flagged + invalid.
  const lastRowByFileNo = new Map<string, number>();
  for (const r of all) {
    const fn = r.mapped?.fileNo;
    if (fn) lastRowByFileNo.set(fn, Math.max(lastRowByFileNo.get(fn) ?? 0, r.rowNumber));
  }

  const valid: RowResult[] = [];
  const invalid: RowResult[] = [];
  for (const r of all) {
    const fn = r.mapped?.fileNo;
    if (r.mapped && fn && lastRowByFileNo.get(fn) !== r.rowNumber) {
      r.errors.push(`Duplicate FILE NO ${fn} — superseded by a later row; this one skipped.`);
      delete r.mapped;
    }
    if (r.mapped) valid.push(r);
    else invalid.push(r);
  }

  return { totalRows: all.length, validRows: valid, invalidRows: invalid, headers };
}

/** Build the clean .xlsx template (headers + one example row) for download. */
export async function buildTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Properties");
  ws.addRow(TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    "FRHBAN001", "Hyderabad", "Banjara Hills", "Sale", "Apartment", "Residential",
    "Gated community",
    3, 1850, 1400, "East", "5", 2, 1.85, "Crore", 4500, 3, "Semi-Furnished",
    "Power backup, Lift, Clubhouse", "My Home Builders", "Available",
    "Spacious 3BHK with great ventilation.",
  ]);
  ws.addRow([
    "FRHBAN002", "Hyderabad", "Kondapur", "Rent", "Apartment", "Residential",
    "Stand alone",
    2, 1100, 950, "West", "3", 1, 32000, "Per Month", 2500, 6, "Furnished",
    "Modular kitchen, Gym", "Aparna Constructions", "Available",
    "Well-maintained 2BHK close to IT hub.",
  ]);
  ws.columns.forEach((c) => (c.width = 18));
  return wb;
}

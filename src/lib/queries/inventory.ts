import "server-only";
import type {
  Prisma,
  City,
  PropertyType,
  TransactionType,
  AvailabilityStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth-helpers";
import type { InventoryFilter } from "@/lib/validation/property";
import type { InventorySort } from "@/lib/inventory-sort";
import { CITIES, cityLabel, cityFromLabel, propertyTitle } from "@/lib/domain";

export const PAGE_SIZE = 12;

// ── Title-aware free-text search ────────────────────────────────────────────────
// A property's card "title" (e.g. "3 BHK Apartment in Banjara Hills") is COMPOSED at
// render time from bhk + property type + locality — there is no title column, so a
// plain `contains` never matched it. We tokenise the query and match each token
// against the identifier/text columns AND the structured fields the title is built
// from (property type, BHK, city, transaction, status), then AND the tokens together
// so multi-word title queries ("3 bhk apartment banjara") narrow instead of widen.

const TYPE_SYNONYMS: Record<PropertyType, string[]> = {
  APARTMENT: ["apartment", "apartments", "flat", "flats", "apt", "condo"],
  VILLA: ["villa", "villas", "house", "independent", "bungalow", "duplex"],
  PLOT: ["plot", "plots", "land", "site", "layout"],
  COMMERCIAL: ["commercial", "office", "shop", "showroom", "retail", "warehouse"],
};
const TX_SYNONYMS: Record<TransactionType, string[]> = {
  SALE: ["sale", "sell", "buy", "resale", "purchase"],
  RENT: ["rent", "rental", "lease"],
};
const STATUS_SYNONYMS: Record<AvailabilityStatus, string[]> = {
  AVAILABLE: ["available"],
  BOOKED: ["booked"],
  SOLD: ["sold"],
  RENTED: ["rented"],
};
const STOPWORDS = new Set(["in", "for", "the", "a", "an", "with", "near", "at", "of", "bhk"]);

/** Prefix match either direction so partial typeahead tokens ("apart") still hit. */
function synMatch(synonyms: string[], tok: string): boolean {
  return synonyms.some((s) => s.startsWith(tok) || tok.startsWith(s));
}
function matchTypes(tok: string): PropertyType[] {
  return (Object.keys(TYPE_SYNONYMS) as PropertyType[]).filter((t) => synMatch(TYPE_SYNONYMS[t], tok));
}
function matchCity(tok: string): City | null {
  return cityFromLabel(tok) ?? CITIES.find((c) => cityLabel[c].toLowerCase().startsWith(tok)) ?? null;
}
function matchTx(tok: string): TransactionType | null {
  return (Object.keys(TX_SYNONYMS) as TransactionType[]).find((t) => synMatch(TX_SYNONYMS[t], tok)) ?? null;
}
function matchStatus(tok: string): AvailabilityStatus | null {
  return (Object.keys(STATUS_SYNONYMS) as AvailabilityStatus[]).find((s) => synMatch(STATUS_SYNONYMS[s], tok)) ?? null;
}

/** AND-of-ORs search conditions for a free-text query (identifiers, text, AND title parts). */
export function buildSearchConditions(search: string | undefined | null): Prisma.PropertyWhereInput[] {
  const q = (search ?? "").trim().toLowerCase();
  if (!q) return [];
  const conditions: Prisma.PropertyWhereInput[] = [];

  // "3 bhk" / "3bhk" → an exact BHK filter; strip it from the free tokens.
  for (const m of q.matchAll(/(\d+)\s*bhk/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 20) conditions.push({ bhk: n });
  }
  const rest = q.replace(/(\d+)\s*bhk/g, " ");

  const tokens = rest.split(/\s+/).filter((t) => t && !STOPWORDS.has(t)).slice(0, 6);
  for (const tok of tokens) {
    const or: Prisma.PropertyWhereInput[] = [
      { fileNo: { contains: tok, mode: "insensitive" } },
      { reraId: { contains: tok, mode: "insensitive" } },
      { builderDeveloperName: { contains: tok, mode: "insensitive" } },
      { description: { contains: tok, mode: "insensitive" } },
      { locality: { name: { contains: tok, mode: "insensitive" } } },
    ];
    // A bare number in BHK range → also match that BHK (so "3" / "3 apartment"
    // narrows like the "3 BHK" in the card title), as an OR alternative to the
    // digit appearing in a file number / description.
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10);
      if (n >= 1 && n <= 20) or.push({ bhk: n });
    }
    // Structured (title-part) matches — only for tokens long enough to be meaningful.
    if (tok.length >= 3) {
      const types = matchTypes(tok);
      if (types.length) or.push({ propertyType: { in: types } });
      const city = matchCity(tok);
      if (city) or.push({ city });
      const tx = matchTx(tok);
      if (tx) or.push({ transactionType: tx });
      const st = matchStatus(tok);
      if (st) or.push({ availabilityStatus: st });
    }
    conditions.push({ OR: or });
  }
  return conditions;
}

// Map a sort choice to a Prisma orderBy. A unique `id` tiebreaker is appended to
// every non-unique sort so paging is deterministic even when many rows share a
// timestamp/price (e.g. a bulk import stamps createdAt within the same instant).
function orderByForSort(sort: InventorySort): Prisma.PropertyOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }, { id: "desc" }];
    case "price_desc":
      return [{ priceInr: "desc" }, { id: "desc" }];
    case "price_asc":
      return [{ priceInr: "asc" }, { id: "asc" }];
    case "fileno_asc":
      return [{ fileNo: "asc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function scopeCities(user: SessionUser): City[] | undefined {
  return user.role === "ADMIN" ? undefined : user.cities;
}

/** The Prisma `where` for the inventory list — shared by the list, count, bulk delete,
 *  and backup export so all four operate on exactly the same filtered set. */
export function buildPropertyWhere(user: SessionUser, filter: InventoryFilter): Prisma.PropertyWhereInput {
  const cities = scopeCities(user);
  const where: Prisma.PropertyWhereInput = { deletedAt: null };

  // City scope (agents) intersected with an explicit city filter.
  if (cities) where.city = { in: cities };
  if (filter.city) {
    if (cities && !cities.includes(filter.city)) {
      // Agent requested a city they can't see → empty result.
      where.city = { in: [] };
    } else {
      where.city = filter.city;
    }
  }

  // Multi-select facets (mockup checkbox panel) → `in` filters.
  if (filter.localityId?.length) where.localityId = { in: filter.localityId };
  if (filter.propertyType?.length) where.propertyType = { in: filter.propertyType };
  if (filter.buildingClassification?.length)
    where.buildingClassification = { in: filter.buildingClassification };
  if (filter.transactionType?.length) where.transactionType = { in: filter.transactionType };
  if (filter.bhk?.length) where.bhk = { in: filter.bhk };
  if (filter.availabilityStatus?.length) where.availabilityStatus = { in: filter.availabilityStatus };

  if (filter.priceMinInr != null || filter.priceMaxInr != null) {
    const priceFilter: Prisma.DecimalFilter = {};
    if (filter.priceMinInr != null) priceFilter.gte = filter.priceMinInr;
    if (filter.priceMaxInr != null) priceFilter.lte = filter.priceMaxInr;
    where.priceInr = priceFilter;
  }

  const searchConditions = buildSearchConditions(filter.search);
  if (searchConditions.length) where.AND = searchConditions;

  return where;
}

export async function listProperties(user: SessionUser, filter: InventoryFilter) {
  const where = buildPropertyWhere(user, filter);

  const page = Math.max(1, filter.page || 1);
  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        locality: true,
        // Photos + docs for the card carousel / doc preview (oldest first = upload order).
        attachments: {
          orderBy: { uploadedAt: "asc" },
          select: { id: true, mimeType: true, originalFilename: true },
        },
      },
      orderBy: orderByForSort(filter.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.property.count({ where }),
  ]);

  return { items, total, page, pageSize: PAGE_SIZE, pageCount: Math.ceil(total / PAGE_SIZE) };
}

export interface PropertySuggestion {
  id: string;
  fileNo: string;
  title: string;
  locality: string;
  city: City;
  priceInr: number;
  transactionType: TransactionType;
}

/** Typeahead suggestions for the inventory search box. Same title-aware matching and
 *  city scope as the list, capped to a few rows and ordered newest-first. */
export async function searchPropertySuggestions(
  user: SessionUser,
  q: string,
  limit = 8,
): Promise<PropertySuggestion[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const cities = scopeCities(user);
  const where: Prisma.PropertyWhereInput = { deletedAt: null };
  if (cities) where.city = { in: cities };
  const conditions = buildSearchConditions(term);
  if (conditions.length) where.AND = conditions;

  const rows = await prisma.property.findMany({
    where,
    select: {
      id: true,
      fileNo: true,
      bhk: true,
      propertyType: true,
      transactionType: true,
      priceInr: true,
      city: true,
      locality: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  return rows.map((p) => ({
    id: p.id,
    fileNo: p.fileNo,
    title: propertyTitle({ bhk: p.bhk, propertyType: p.propertyType, localityName: p.locality.name }),
    locality: p.locality.name,
    city: p.city,
    priceInr: Number(p.priceInr),
    transactionType: p.transactionType,
  }));
}

export async function getPropertyById(user: SessionUser, id: string) {
  const property = await prisma.property.findFirst({
    where: { id, deletedAt: null },
    include: {
      locality: true,
      attachments: { orderBy: { uploadedAt: "asc" } },
      createdBy: { select: { fullName: true } },
      matches: {
        include: {
          lead: {
            select: { id: true, firstName: true, lastName: true, city: true, currentStage: true },
          },
          actionedBy: { select: { fullName: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!property) return null;
  // City scope for agents.
  if (user.role === "AGENT" && !user.cities.includes(property.city)) return null;
  return property;
}

/** Localities for filter/form dropdowns, scoped to the user's cities. */
export async function getLocalitiesForUser(user: SessionUser) {
  const cities = scopeCities(user);
  return prisma.locality.findMany({
    where: cities ? { city: { in: cities } } : {},
    orderBy: [{ city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
    },
  });
}

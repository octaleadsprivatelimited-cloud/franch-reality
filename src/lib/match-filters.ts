import type {
  BuildingClassification,
  City,
  Furnishing,
  PropertyType,
  TransactionType,
} from "@prisma/client";
import { z } from "zod";
import { parseListParams } from "@/lib/search-params";

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.coerce.number().pipe(schema).optional(),
  );

const leadMatchFilterSchema = z.object({
  matchMode: z.literal("custom").optional(),
  city: z.enum(["HYDERABAD", "CHENNAI"]).optional(),
  localityId: z.array(z.coerce.number().int().positive()).optional(),
  transactionType: z.array(z.enum(["SALE", "RENT"])).optional(),
  propertyType: z
    .array(z.enum(["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"]))
    .optional(),
  bhk: z.array(z.coerce.number().int().min(1).max(20)).optional(),
  buildingClassification: z
    .array(z.enum(["GATED_COMMUNITY", "STAND_ALONE", "COMMERCIAL"]))
    .optional(),
  furnishing: z
    .array(z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]))
    .optional(),
  budgetMin: optionalNumber(z.number().min(0)),
  budgetMax: optionalNumber(z.number().min(0)),
  builtUpAreaMin: optionalNumber(z.number().int().min(0)),
  parkingMin: optionalNumber(z.number().int().min(0).max(50)),
  bhkFlex: z.literal("1").optional(),
  budgetFlex: z.literal("1").optional(),
});

export const LEAD_MATCH_ARRAY_KEYS = [
  "localityId",
  "transactionType",
  "propertyType",
  "bhk",
  "buildingClassification",
  "furnishing",
] as const;

/**
 * User-supplied filter overrides. Undefined means "start from the CRM requirement";
 * an empty array in custom mode deliberately means "Any".
 */
export interface LeadMatchFilterInput {
  city?: City;
  localityIds: number[];
  transactionTypes: TransactionType[];
  propertyTypes: PropertyType[];
  bhks: number[];
  buildingClassifications: BuildingClassification[];
  furnishings: Furnishing[];
  budgetMin: number | null;
  budgetMax: number | null;
  builtUpAreaMin: number | null;
  parkingMin: number | null;
  bhkFlex: boolean;
  budgetFlex: boolean;
}

/** The effective filter set returned with results and rendered by the filter form. */
export interface ResolvedLeadMatchFilters extends LeadMatchFilterInput {
  city: City;
  isCustom: boolean;
}

export function parseLeadMatchFilters(
  searchParams: Record<string, string | string[] | undefined>,
): LeadMatchFilterInput | undefined {
  const parsed = parseListParams(
    leadMatchFilterSchema,
    searchParams,
    LEAD_MATCH_ARRAY_KEYS,
  );
  if (parsed.matchMode !== "custom") return undefined;

  return {
    city: parsed.city,
    localityIds: parsed.localityId ?? [],
    transactionTypes: parsed.transactionType ?? [],
    propertyTypes: parsed.propertyType ?? [],
    bhks: parsed.bhk ?? [],
    buildingClassifications: parsed.buildingClassification ?? [],
    furnishings: parsed.furnishing ?? [],
    budgetMin: parsed.budgetMin ?? null,
    budgetMax: parsed.budgetMax ?? null,
    builtUpAreaMin: parsed.builtUpAreaMin ?? null,
    parkingMin: parsed.parkingMin ?? null,
    bhkFlex: parsed.bhkFlex === "1",
    budgetFlex: parsed.budgetFlex === "1",
  };
}

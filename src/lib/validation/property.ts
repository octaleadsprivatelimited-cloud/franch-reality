import { z } from "zod";
import { INVENTORY_SORT_VALUES } from "@/lib/inventory-sort";

// Shared validation for property create/update. The form collects price as
// amount + unit; the action converts to canonical absolute INR (priceInr).
export const propertyInputSchema = z.object({
  fileNo: z
    .string()
    .trim()
    .min(2, "File number is required")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "File number: letters, numbers, - and _ only"),
  reraId: z.string().trim().max(60).optional().nullable(),
  city: z.enum(["HYDERABAD", "CHENNAI"]),
  localityId: z.coerce.number().int().positive("Select a locality"),
  transactionType: z.enum(["SALE", "RENT"]),
  propertyType: z.enum(["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"]),
  commercialOrResidential: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
  buildingClassification: z
    .enum(["GATED_COMMUNITY", "STAND_ALONE", "COMMERCIAL"])
    .optional()
    .nullable(),
  bhk: z.coerce.number().int().min(0).max(20).optional().nullable(),
  builtUpAreaSqft: z.coerce.number().int().positive().optional().nullable(),
  secondaryAreaSqft: z.coerce.number().int().positive().optional().nullable(),
  facing: z.string().trim().max(30).optional().nullable(),
  floor: z.string().trim().max(30).optional().nullable(),
  parkingCount: z.coerce.number().int().min(0).max(50).optional().nullable(),
  priceAmount: z.coerce.number().positive("Price must be greater than 0"),
  priceUnit: z.enum(["LAKH", "CRORE", "PER_MONTH"]),
  maintenanceAmount: z.coerce.number().min(0).optional().nullable(),
  ageYears: z.coerce.number().int().min(0).max(150).optional().nullable(),
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).optional().nullable(),
  featuresText: z.string().trim().max(2000).optional().nullable(),
  additionalFeatures: z.array(z.string().trim()).default([]),
  availabilityStatus: z.enum(["AVAILABLE", "BOOKED", "SOLD", "RENTED"]),
  builderDeveloperName: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
}).superRefine((data, ctx) => {
  // Money safety: the price UNIT must agree with the transaction type, otherwise
  // toInr() can compute a value off by 1e5–1e7 (e.g. a ₹50k rent typed as CRORE
  // would store ₹5e12). RENT is always per-month; SALE is Lakh or Crore.
  if (data.transactionType === "RENT" && data.priceUnit !== "PER_MONTH") {
    ctx.addIssue({
      code: "custom",
      path: ["priceUnit"],
      message: "Rent must be priced per month (₹/month).",
    });
  }
  if (data.transactionType === "SALE" && data.priceUnit === "PER_MONTH") {
    ctx.addIssue({
      code: "custom",
      path: ["priceUnit"],
      message: "Sale price must be in Lakh or Crore.",
    });
  }
  // A residential apartment/villa should carry a BHK; plots/commercial may not.
  if (
    (data.propertyType === "APARTMENT" || data.propertyType === "VILLA") &&
    (data.bhk == null || data.bhk < 1)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["bhk"],
      message: "BHK is required for apartments and villas.",
    });
  }
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;

// Filters for the inventory list. The mockup uses a multi-select checkbox panel,
// so transaction/type/BHK/status/locality are ARRAYS; price bounds are absolute INR.
export const inventoryFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  city: z.enum(["HYDERABAD", "CHENNAI"]).optional(),
  localityId: z.array(z.coerce.number().int().positive()).optional(),
  propertyType: z.array(z.enum(["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"])).optional(),
  buildingClassification: z
    .array(z.enum(["GATED_COMMUNITY", "STAND_ALONE", "COMMERCIAL"]))
    .optional(),
  transactionType: z.array(z.enum(["SALE", "RENT"])).optional(),
  bhk: z.array(z.coerce.number().int().min(0).max(20)).optional(),
  availabilityStatus: z.array(z.enum(["AVAILABLE", "BOOKED", "SOLD", "RENTED"])).optional(),
  priceMinInr: z.coerce.number().min(0).optional(),
  priceMaxInr: z.coerce.number().min(0).optional(),
  sort: z.enum(INVENTORY_SORT_VALUES).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
});

export type InventoryFilter = z.infer<typeof inventoryFilterSchema>;

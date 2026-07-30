import { z } from "zod";

// Admin-managed localities (locations). Latitude/longitude are OPTIONAL on input:
// when both are blank the action falls back to the city centroid and flags the row
// `approxCoords`. When supplied they must be valid WGS84 ranges — and it must be
// both-or-neither, so a half-entered coordinate can't silently become a centroid.
const latitude = z.coerce
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90")
  .optional();
const longitude = z.coerce
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180")
  .optional();

export const localityInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Location name is required")
      .max(80, "Location name must be 80 characters or fewer"),
    city: z.enum(["HYDERABAD", "CHENNAI"]),
    latitude,
    longitude,
    // Only set when this location maps to a Corefactors Teleduce "Area of Interest".
    teleduceAreaOfInterestValue: z.string().trim().max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasLat = data.latitude != null;
    const hasLng = data.longitude != null;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: "custom",
        path: [hasLat ? "longitude" : "latitude"],
        message: "Enter both latitude and longitude, or leave both blank.",
      });
    }
  });

export const createLocalitySchema = localityInputSchema;
export const updateLocalitySchema = localityInputSchema;

export type LocalityInput = z.infer<typeof localityInputSchema>;

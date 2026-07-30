import { z } from "zod";

// Shared validation for user create/update. Mirrors the internal-account model:
// 2 roles (ADMIN/AGENT) and 2 cities (HYDERABAD/CHENNAI). Email and password are
// only ever set on create or via the dedicated reset flow — never on edit.

const cities = z
  .array(z.enum(["HYDERABAD", "CHENNAI"]))
  .min(1, "Select at least one city");

// Operating areas (locality ids) an agent is bound to. Empty = whole city.
const areas = z.array(z.coerce.number().int().positive()).optional().default([]);

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be 100 characters or fewer");

// Coerce an HTML checkbox value into a boolean. Unchecked checkboxes are absent
// from FormData (undefined); checked ones submit "on" (or "true").
const checkbox = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => v === true || v === "on" || v === "true");

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  fullName: z
    .string()
    .trim()
    .min(2, "Full name is required")
    .max(120, "Full name must be 120 characters or fewer"),
  role: z.enum(["ADMIN", "AGENT"]),
  cities,
  areas,
  password,
});

export const updateUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name is required")
    .max(120, "Full name must be 120 characters or fewer"),
  role: z.enum(["ADMIN", "AGENT"]),
  cities,
  areas,
  isActive: checkbox,
});

export const resetPasswordSchema = z.object({
  password,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { CITY_CENTER } from "@/lib/domain";
import { createLocalitySchema, updateLocalitySchema } from "@/lib/validation/locality";

export interface FormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// FormData → plain object; "" becomes undefined so the optional coerced-number
// coordinate fields validate (and fall back to the city centroid) correctly.
function formObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    obj[k] = v === "" ? undefined : v;
  }
  return obj;
}

function zodToFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// Map a unique-violation to the right field. The Locality has two unique keys:
// (city, name) and the optional teleduceAreaOfInterestValue.
function uniqueError(e: Prisma.PrismaClientKnownRequestError): FormState {
  const target = Array.isArray(e.meta?.target)
    ? (e.meta!.target as string[]).join(",")
    : String(e.meta?.target ?? "");
  if (target.includes("teleduce")) {
    return {
      error: "That Teleduce area value is already mapped to another location.",
      fieldErrors: { teleduceAreaOfInterestValue: "Already mapped" },
    };
  }
  return {
    error: "A location with this name already exists in that city.",
    fieldErrors: { name: "Already in use" },
  };
}

// Resolve coordinates: exact when supplied, else the city centroid (flagged approx).
function resolveCoords(data: z.infer<typeof createLocalitySchema>) {
  const approxCoords = data.latitude == null || data.longitude == null;
  const center = CITY_CENTER[data.city];
  return {
    latitude: data.latitude ?? center.latitude,
    longitude: data.longitude ?? center.longitude,
    approxCoords,
  };
}

export async function createLocalityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = createLocalitySchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { name, city, teleduceAreaOfInterestValue } = parsed.data;
  const { latitude, longitude, approxCoords } = resolveCoords(parsed.data);

  const existing = await prisma.locality.findUnique({ where: { city_name: { city, name } } });
  if (existing) {
    return {
      error: "A location with this name already exists in that city.",
      fieldErrors: { name: "Already in use" },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.locality.create({
        data: {
          name,
          city,
          latitude,
          longitude,
          approxCoords,
          teleduceAreaOfInterestValue: teleduceAreaOfInterestValue || null,
        },
      });
      await writeAudit(
        {
          userId: admin.id,
          action: "Location created",
          entityType: "Locality",
          entityId: String(c.id),
          after: { name, city, approxCoords },
        },
        tx,
      );
      return c;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return uniqueError(e);
    }
    throw e;
  }

  // Localities feed inventory/leads/matching dropdowns and the admin table.
  revalidatePath("/settings/localities");
  revalidatePath("/inventory");
  revalidatePath("/leads");
  redirect("/settings/localities");
}

export async function updateLocalityAction(
  id: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const target = await prisma.locality.findUnique({ where: { id } });
  if (!target) return { error: "Location not found." };

  const parsed = updateLocalitySchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { name, city, teleduceAreaOfInterestValue } = parsed.data;
  const { latitude, longitude, approxCoords } = resolveCoords(parsed.data);

  // Pre-check the (city, name) unique against OTHER rows for a friendly error.
  const clash = await prisma.locality.findUnique({ where: { city_name: { city, name } } });
  if (clash && clash.id !== id) {
    return {
      error: "A location with this name already exists in that city.",
      fieldErrors: { name: "Already in use" },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.locality.update({
        where: { id },
        data: {
          name,
          city,
          latitude,
          longitude,
          approxCoords,
          teleduceAreaOfInterestValue: teleduceAreaOfInterestValue || null,
        },
      });
      await writeAudit(
        {
          userId: admin.id,
          action: "Location updated",
          entityType: "Locality",
          entityId: String(id),
          before: { name: target.name, city: target.city, approxCoords: target.approxCoords },
          after: { name, city, approxCoords },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return uniqueError(e);
    }
    throw e;
  }

  revalidatePath("/settings/localities");
  revalidatePath(`/settings/localities/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/leads");
  redirect("/settings/localities");
}

export async function deleteLocalityAction(id: number): Promise<{ error?: string } | void> {
  const admin = await requireAdmin();

  const locality = await prisma.locality.findUnique({
    where: { id },
    include: {
      _count: { select: { properties: true, interestedLeads: true, assignedAgents: true } },
    },
  });
  if (!locality) {
    revalidatePath("/settings/localities");
    redirect("/settings/localities");
  }

  // Guard: a location referenced by inventory, leads or agents can't be removed —
  // deleting it would orphan those records (properties FK is RESTRICT anyway).
  const { properties, interestedLeads, assignedAgents } = locality._count;
  if (properties > 0 || interestedLeads > 0 || assignedAgents > 0) {
    const bits: string[] = [];
    if (properties) bits.push(`${properties} propert${properties === 1 ? "y" : "ies"}`);
    if (interestedLeads) bits.push(`${interestedLeads} lead${interestedLeads === 1 ? "" : "s"}`);
    if (assignedAgents) bits.push(`${assignedAgents} agent${assignedAgents === 1 ? "" : "s"}`);
    return {
      error: `Can't delete “${locality.name}” — it's still linked to ${bits.join(", ")}. Reassign those first.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.locality.delete({ where: { id } });
      await writeAudit(
        {
          userId: admin.id,
          action: "Location deleted",
          entityType: "Locality",
          entityId: String(id),
          before: { name: locality.name, city: locality.city },
        },
        tx,
      );
    });
  } catch (e) {
    // Backstop for a race (a property attached between the count and the delete).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { error: `Can't delete “${locality.name}” — it's still linked to other records.` };
    }
    throw e;
  }

  revalidatePath("/settings/localities");
  revalidatePath("/inventory");
  revalidatePath("/leads");
  redirect("/settings/localities");
}

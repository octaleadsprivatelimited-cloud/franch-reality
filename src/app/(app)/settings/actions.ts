"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from "@/lib/validation/user";

export interface FormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// Thrown inside a guard transaction to abort with a user-facing message.
class GuardError extends Error {}

const RETRY_MSG = "Another change was happening at the same time — please try again.";

// Convert FormData to a plain object. Empty strings become undefined so optional
// fields validate correctly. `cities` is a multi-value checkbox group, so it is
// collected via getAll rather than the single-value entries() iteration.
function formObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    if (k === "cities" || k === "areas") continue; // multi-value, handled below
    obj[k] = v === "" ? undefined : v;
  }
  obj.cities = formData.getAll("cities").filter((v): v is string => typeof v === "string");
  obj.areas = formData.getAll("areas").filter((v): v is string => typeof v === "string");
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

export async function createUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const parsed = createUserSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { email, fullName, role, cities, areas, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "A user with this email already exists.", fieldErrors: { email: "Already in use" } };
  }

  // Only connect areas that actually exist AND belong to one of the selected cities
  // (filters out cross-city / stale ids and avoids a P2025 on a non-existent id).
  const validAreaIds = areas.length
    ? (
        await prisma.locality.findMany({
          where: { id: { in: areas }, city: { in: cities } },
          select: { id: true },
        })
      ).map((l) => l.id)
    : [];

  const passwordHash = await bcrypt.hash(password, 12);
  let created;
  try {
    created = await prisma.user.create({
      data: {
        email,
        fullName,
        role,
        cities,
        passwordHash,
        assignedAreas: { connect: validAreaIds.map((id) => ({ id })) },
      },
    });
  } catch (e) {
    // Race with a concurrent create of the same email — the DB @unique is the
    // source of truth; surface the friendly field error rather than a 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A user with this email already exists.", fieldErrors: { email: "Already in use" } };
    }
    throw e;
  }

  // SECURITY: never log password / passwordHash in the audit trail.
  await writeAudit({
    userId: admin.id,
    action: "User created",
    entityType: "User",
    entityId: created.id,
    after: { email, role, cities },
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function updateUserAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  const parsed = updateUserSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { fullName, role, cities, areas, isActive } = parsed.data;
  const validAreaIds = areas.length
    ? (
        await prisma.locality.findMany({
          where: { id: { in: areas }, city: { in: cities } },
          select: { id: true },
        })
      ).map((l) => l.id)
    : [];
  const areaSet = { assignedAreas: { set: validAreaIds.map((id) => ({ id })) } };

  // Lockout guard (a): you cannot strip your own admin access or deactivate yourself.
  if (id === admin.id && (role !== "ADMIN" || !isActive)) {
    return { error: "You cannot remove your own admin access or deactivate yourself." };
  }

  // Lockout guard (b): never remove the last active admin.
  const wasActiveAdmin = target.role === "ADMIN" && target.isActive;
  const becomesNonAdminOrInactive = role !== "ADMIN" || !isActive;

  try {
    if (wasActiveAdmin && becomesNonAdminOrInactive) {
      // Count OTHER active admins and update in ONE Serializable transaction, so
      // two concurrent demotions/deactivations can't both pass the check and
      // leave the system with zero active admins.
      await prisma.$transaction(
        async (tx) => {
          const others = await tx.user.count({
            where: { role: "ADMIN", isActive: true, id: { not: id } },
          });
          if (others === 0) throw new GuardError("There must be at least one active admin.");
          await tx.user.update({ where: { id }, data: { fullName, role, cities, isActive, ...areaSet } });
        },
        { isolationLevel: "Serializable" },
      );
    } else {
      await prisma.user.update({ where: { id }, data: { fullName, role, cities, isActive, ...areaSet } });
    }
  } catch (e) {
    if (e instanceof GuardError) return { error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return { error: RETRY_MSG };
    throw e;
  }

  // Keep lead assignments consistent with the agent's access:
  //  - no longer an assignable agent (deactivated / demoted) → free ALL their leads;
  //  - still an agent but territory narrowed → free only leads in cities they no longer
  //    cover (the read layer hides out-of-city leads, so they couldn't work them).
  // Freed leads return to the unassigned pool for redistribution.
  if (!isActive || role !== "AGENT") {
    await prisma.lead.updateMany({
      where: { assignedAgentId: id },
      data: {
        assignedAgentId: null,
        assignedAt: null,
        assignmentSource: null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
  } else {
    await prisma.lead.updateMany({
      where: { assignedAgentId: id, city: { notIn: cities } },
      data: {
        assignedAgentId: null,
        assignedAt: null,
        assignmentSource: null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
  }

  await writeAudit({
    userId: admin.id,
    action: "User updated",
    entityType: "User",
    entityId: id,
    before: { role: target.role, cities: target.cities, isActive: target.isActive },
    after: { role, cities, isActive },
  });

  revalidatePath("/settings");
  revalidatePath(`/settings/users/${id}`);
  redirect("/settings");
}

export async function deactivateUserAction(id: string): Promise<{ error?: string } | void> {
  const admin = await requireAdmin();

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };
  if (!target.isActive) {
    // Already inactive — nothing to do.
    revalidatePath("/settings");
    revalidatePath(`/settings/users/${id}`);
    return;
  }

  // Self guard.
  if (id === admin.id) {
    return { error: "You cannot deactivate yourself." };
  }

  // Last-active-admin guard (atomic — same Serializable approach as update).
  // SOFT deactivate only; we never hard-delete users, to preserve audit references.
  try {
    if (target.role === "ADMIN") {
      await prisma.$transaction(
        async (tx) => {
          const others = await tx.user.count({
            where: { role: "ADMIN", isActive: true, id: { not: id } },
          });
          if (others === 0) throw new GuardError("There must be at least one active admin.");
          await tx.user.update({ where: { id }, data: { isActive: false } });
        },
        { isolationLevel: "Serializable" },
      );
    } else {
      await prisma.user.update({ where: { id }, data: { isActive: false } });
    }
  } catch (e) {
    if (e instanceof GuardError) return { error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return { error: RETRY_MSG };
    throw e;
  }

  // Free any leads assigned to the now-inactive user so they can be redistributed.
  await prisma.lead.updateMany({
    where: { assignedAgentId: id },
    data: {
      assignedAgentId: null,
      assignedAt: null,
      assignmentSource: null,
      assignmentStatus: "NEW",
      assignmentNote: null,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "User deactivated",
    entityType: "User",
    entityId: id,
    before: { isActive: true },
    after: { isActive: false },
  });

  revalidatePath("/settings");
  revalidatePath(`/settings/users/${id}`);
}

export async function resetPasswordAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  const parsed = resetPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  // SECURITY: never include the new password in the audit payload.
  await writeAudit({
    userId: admin.id,
    action: "Password reset",
    entityType: "User",
    entityId: id,
  });

  revalidatePath(`/settings/users/${id}`);
  return { ok: true };
}

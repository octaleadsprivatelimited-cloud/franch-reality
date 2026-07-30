"use server";

import { revalidatePath } from "next/cache";
import type { AssignmentStatus, City } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, currentUser } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { ASSIGNMENT_STATUSES } from "@/lib/domain";
import { backfillLeadAssignments } from "@/lib/leads/assignment";
import { type DeleteSelection, MAX_BULK } from "@/lib/bulk-delete";
import { leadSelectionWhere, SELECTION_ORDER } from "@/lib/bulk-where";

export interface LeadActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * Admin override: (re)assign a lead to a specific agent, or unassign it. The lead's
 * auto-assignment is otherwise handled at ingestion — this is the manual control.
 */
export async function reassignLeadAction(
  leadId: string,
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const admin = await requireAdmin();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      assignedAgentId: true,
      assignmentSource: true,
      leadOwner: true,
      city: true,
    },
  });
  if (!lead) return { error: "Lead not found." };
  if (lead.leadOwner) {
    return {
      error: `This lead is owned by ${lead.leadOwner} in Corefactors. Change the owner there; the next sync will mirror it here.`,
    };
  }

  const raw = String(formData.get("agentId") ?? "");
  let agentId: string | null = null;
  if (raw && raw !== "__unassign__") {
    const agent = await prisma.user.findFirst({
      where: { id: raw, role: "AGENT", isActive: true },
      select: { id: true, cities: true },
    });
    if (!agent) return { error: "Choose an active agent." };
    // The agent must cover the lead's city — otherwise the read layer hides the lead
    // from them (getLeadById returns null out-of-city) and they couldn't work it.
    if (!agent.cities.includes(lead.city)) {
      return { error: "That agent isn't assigned to this lead's city." };
    }
    agentId = agent.id;
  }

  if (agentId === lead.assignedAgentId) return { ok: true }; // no-op

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      // (Re)assignment resets the agent's working state so the new owner starts fresh.
      data: {
        assignedAgentId: agentId,
        assignedAt: agentId ? new Date() : null,
        assignmentSource: agentId ? "MANUAL" : null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    // Assigning the lead RESOLVES any open agent-return records for it, so they can't
    // resurface later. (Unassigning leaves them open — the return is still relevant.)
    if (agentId) {
      await tx.leadUnassignment.updateMany({
        where: { leadId, dismissedAt: null },
        data: { dismissedAt: new Date(), dismissedById: admin.id },
      });
    }
    await writeAudit(
      {
        userId: admin.id,
        action: agentId ? "Lead reassigned" : "Lead unassigned",
        entityType: "Lead",
        entityId: leadId,
        before: { assignedAgentId: lead.assignedAgentId },
        after: { assignedAgentId: agentId },
      },
      tx,
    );
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/leads/assignments");
  return { ok: true };
}

/**
 * One-time / on-demand backfill: distribute all currently-unassigned active leads
 * across eligible agents using the even-load policy. Idempotent — only touches
 * unassigned leads, so it's safe to run repeatedly.
 */
export async function distributeUnassignedAction(city?: City): Promise<LeadActionState> {
  const admin = await requireAdmin();
  // Validate the client-supplied city so it matches the scope the console showed.
  const scope = city === "HYDERABAD" || city === "CHENNAI" ? city : undefined;
  const { assigned, skipped } = await backfillLeadAssignments(prisma, scope);

  await writeAudit({
    userId: admin.id,
    action: "Leads distributed (even-load backfill)",
    entityType: "Lead",
    after: { assigned, skipped, city: scope ?? "all" },
  });

  revalidatePath("/leads/assignments");
  revalidatePath("/leads");
  return {
    ok: true,
    message:
      assigned === 0 && skipped === 0
        ? "No unassigned leads to distribute."
        : `Assigned ${assigned} lead${assigned === 1 ? "" : "s"}${skipped ? `; ${skipped} had no eligible agent` : ""}.`,
  };
}

/** Bulk unassign: send every currently-assigned active lead back to the unassigned pool
 *  (optionally scoped to a city). Reversible via Distribute / manual reassign. */
export async function unassignAllAction(city?: City): Promise<LeadActionState> {
  const admin = await requireAdmin();
  const scope = city === "HYDERABAD" || city === "CHENNAI" ? city : undefined;
  const res = await prisma.lead.updateMany({
    where: {
      assignedAgentId: { not: null },
      assignmentSource: { in: ["ROUND_ROBIN", "MANUAL"] },
      isArchivedInTeleduce: false,
      ...(scope ? { city: scope } : {}),
    },
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
    action: "Leads unassigned (bulk)",
    entityType: "Lead",
    after: { count: res.count, city: scope ?? "all" },
  });
  revalidatePath("/leads/assignments");
  revalidatePath("/leads");
  return { ok: true, message: `Unassigned ${res.count} lead${res.count === 1 ? "" : "s"}.` };
}

/** Individual unassign: free all leads currently assigned to ONE agent (optionally scoped
 *  to a city) back to the unassigned pool. */
export async function unassignAgentAction(agentId: string, city?: City): Promise<LeadActionState> {
  const admin = await requireAdmin();
  if (!agentId) return { error: "Missing agent." };
  const scope = city === "HYDERABAD" || city === "CHENNAI" ? city : undefined;
  const res = await prisma.lead.updateMany({
    where: {
      assignedAgentId: agentId,
      assignmentSource: { in: ["ROUND_ROBIN", "MANUAL"] },
      isArchivedInTeleduce: false,
      ...(scope ? { city: scope } : {}),
    },
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
    action: "Agent leads unassigned",
    entityType: "User",
    entityId: agentId,
    after: { count: res.count, city: scope ?? "all" },
  });
  revalidatePath("/leads/assignments");
  revalidatePath("/leads");
  return { ok: true, message: `Unassigned ${res.count} lead${res.count === 1 ? "" : "s"}.` };
}

// ── Agent self-service (on a lead assigned to the current agent) ──────────────────

/** Guard: the current user must be the agent this lead is assigned to. */
async function requireOwnLead(leadId: string) {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." as const };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedAgentId: true, assignmentSource: true },
  });
  if (!lead) return { error: "Lead not found." as const };
  if (lead.assignedAgentId !== user.id) return { error: "This lead isn't assigned to you." as const };
  return { user, lead };
}

/** Agent updates the working status + feedback note on one of their assigned leads. */
export async function updateAssignmentAction(
  leadId: string,
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const guard = await requireOwnLead(leadId);
  if ("error" in guard) return { error: guard.error };

  const status = String(formData.get("status") ?? "");
  if (!ASSIGNMENT_STATUSES.includes(status as AssignmentStatus)) return { error: "Invalid status." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);

  await prisma.lead.update({
    where: { id: leadId },
    data: { assignmentStatus: status as AssignmentStatus, assignmentNote: note || null },
  });
  revalidatePath("/leads/my-assignments");
  return { ok: true, message: "Saved." };
}

/** Agent returns a lead to the pool WITH a required reason (recorded + surfaced to admins). */
export async function agentUnassignAction(
  leadId: string,
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const guard = await requireOwnLead(leadId);
  if ("error" in guard) return { error: guard.error };
  const user = guard.user;
  if (guard.lead.assignmentSource === "COFACTORS") {
    return {
      error: "This assignment comes from Corefactors. Ask an admin to update the owner there.",
    };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Please give a brief reason (at least 5 characters)." };
  if (reason.length > 1000) return { error: "Reason is too long (max 1000 characters)." };

  const returned = await prisma.$transaction(async (tx) => {
    // Atomic ownership guard: only null it if it's STILL assigned to this agent, so a
    // concurrent admin reassign can't be silently clobbered and no duplicate record is
    // created on a double-submit (the second update matches 0 rows).
    const res = await tx.lead.updateMany({
      where: { id: leadId, assignedAgentId: user.id },
      data: {
        assignedAgentId: null,
        assignedAt: null,
        assignmentSource: null,
        assignmentStatus: "NEW",
        assignmentNote: null,
      },
    });
    if (res.count === 0) return false;
    await tx.leadUnassignment.create({ data: { leadId, agentId: user.id, reason } });
    await writeAudit(
      { userId: user.id, action: "Lead returned by agent", entityType: "Lead", entityId: leadId, after: { reason } },
      tx,
    );
    return true;
  });
  if (!returned) return { error: "This lead is no longer assigned to you." };

  revalidatePath("/leads/my-assignments");
  revalidatePath("/leads/assignments");
  revalidatePath("/leads");
  return { ok: true, message: "Lead returned to the pool." };
}

// ── Admin bulk PERMANENT delete ───────────────────────────────────────────────────

/**
 * Permanently delete leads (individually or in bulk / all-matching). ADMIN ONLY. Every
 * dependent (matches, conversations, messages, shares, notifications, search activity,
 * return records) cascades. Each lead's Teleduce id is recorded so the sync never
 * re-creates it. Irreversible.
 */
export async function bulkDeleteLeadsAction(
  selection: DeleteSelection,
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  const admin = await requireAdmin();
  const where = leadSelectionWhere(admin, selection);

  const count = await prisma.lead.count({ where });
  if (count === 0) return { ok: true, deleted: 0 };
  // Refuse rather than silently truncate an irreversible delete beyond the cap.
  if (count > MAX_BULK) {
    return {
      error: `Too many selected (${count.toLocaleString("en-IN")}). Narrow the filter to ${MAX_BULK.toLocaleString("en-IN")} or fewer, then delete.`,
    };
  }
  // Deterministic order (matches the backup export) so the two sets always coincide.
  const rows = await prisma.lead.findMany({ where, select: { id: true }, orderBy: SELECTION_ORDER, take: MAX_BULK });
  const ids = rows.map((r) => r.id);

  let deleted = 0;
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const withTid = await prisma.lead.findMany({
        where: { id: { in: batch }, NOT: { teleduceLeadId: null } },
        select: { teleduceLeadId: true },
      });
      await prisma.$transaction(async (tx) => {
        if (withTid.length) {
          // Remember these ids so a still-present Corefactors lead is never re-synced.
          await tx.deletedTeleduceLead.createMany({
            data: withTid.map((l) => ({ teleduceLeadId: l.teleduceLeadId as string, deletedById: admin.id })),
            skipDuplicates: true,
          });
        }
        const res = await tx.lead.deleteMany({ where: { id: { in: batch } } });
        deleted += res.count;
      });
    }
  } catch {
    // Batches commit incrementally — audit whatever was actually removed before failing.
    await writeAudit({
      userId: admin.id,
      action: "Leads permanently deleted (partial — errored)",
      entityType: "Lead",
      after: { count: deleted, partial: true },
    });
    revalidatePath("/leads");
    revalidatePath("/leads/assignments");
    return { error: `Deletion stopped after ${deleted} due to an error — please retry to remove the rest.`, deleted };
  }

  await writeAudit({
    userId: admin.id,
    action: "Leads permanently deleted",
    entityType: "Lead",
    after: { count: deleted },
  });
  revalidatePath("/leads");
  revalidatePath("/leads/assignments");
  return { ok: true, deleted };
}

/** Admin dismisses an agent-return: resolves ALL open records for that lead (by leadId, not
 *  a single row) so a dismissed return can never resurface via an older undismissed row. */
export async function dismissUnassignmentAction(recordId: string): Promise<LeadActionState> {
  const admin = await requireAdmin();
  const rec = await prisma.leadUnassignment.findUnique({ where: { id: recordId }, select: { leadId: true } });
  if (rec) {
    await prisma.leadUnassignment.updateMany({
      where: { leadId: rec.leadId, dismissedAt: null },
      data: { dismissedAt: new Date(), dismissedById: admin.id },
    });
  }
  revalidatePath("/leads/assignments");
  return { ok: true };
}

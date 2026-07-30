"use server";

import { revalidatePath } from "next/cache";
import type { MatchStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { buildMatchSnapshot } from "@/lib/matching-service";
import { matchStatusLabel } from "@/lib/domain";
import { teleduceStageForMatch } from "@/lib/teleduce/mapping";
import { triggerWriteback } from "@/lib/teleduce/writeback";

export interface MatchActionState {
  ok?: boolean;
  error?: string;
  /** Set when the save succeeded but the Teleduce stage push did not land immediately. */
  warning?: string;
}

const VALID_STATUSES: MatchStatus[] = [
  "SHORTLISTED",
  "SHARED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "CLOSED_NEUTRAL",
];

/**
 * Create or update the Match record for a (lead, property) pair with a new
 * status. The band + criteria snapshot are recomputed server-side from the live
 * records (never trusted from the client) so the persisted decision data
 * is trustworthy. Statuses that map to a Teleduce stage are marked PENDING for
 * writeback; the integration layer performs the push and flips PENDING → SUCCESS/FAILED.
 */
export async function setMatchStatusAction(
  leadId: string,
  propertyId: string,
  status: MatchStatus,
  statusReason?: string,
): Promise<MatchActionState> {
  const user = await requireUser();

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Unknown match status." };
  }

  let snapshot;
  try {
    snapshot = await buildMatchSnapshot(user, leadId, propertyId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if (!snapshot) {
    return { error: "Lead or property not found, or they are in different cities." };
  }

  // SHORTLISTED stays internal (no writeback); SHARED/CLOSED_* push to Teleduce.
  const writeback = teleduceStageForMatch(status) ? "PENDING" : "NOT_REQUIRED";
  const reason = statusReason?.trim() ? statusReason.trim().slice(0, 500) : null;
  const distanceKm = snapshot.distanceKm < 0 ? null : snapshot.distanceKm;
  const criteriaSnapshot = snapshot.criteria as unknown as Prisma.InputJsonObject;
  const now = new Date();

  const match = await prisma.match.upsert({
    where: { leadId_propertyId: { leadId, propertyId } },
    create: {
      leadId,
      propertyId,
      band: snapshot.band,
      distanceKm,
      criteriaSnapshot,
      status,
      statusReason: reason,
      actionedById: user.id,
      actionedAt: now,
      teleduceWritebackStatus: writeback,
    },
    update: {
      band: snapshot.band,
      distanceKm,
      criteriaSnapshot,
      status,
      statusReason: reason,
      actionedById: user.id,
      actionedAt: now,
      teleduceWritebackStatus: writeback,
      teleduceWritebackAt: null,
      // Fresh intent → restart the writeback retry clock.
      teleduceWritebackAttempts: 0,
      teleduceWritebackNextRetryAt: null,
    },
  });

  await writeAudit({
    userId: user.id,
    action: `Match marked ${matchStatusLabel[status]}`,
    entityType: "Match",
    entityId: match.id,
    after: {
      leadId,
      propertyId,
      status,
      band: snapshot.band,
      reason: reason ?? undefined,
    },
  });

  // Append-only history so re-marking the pair never loses a prior decision.
  await prisma.matchHistory.create({
    data: {
      matchId: match.id,
      status,
      statusReason: reason,
      band: snapshot.band,
      changedById: user.id,
      criteriaSnapshot,
    },
  });

  // Push the stage change to Teleduce now (within seconds), flipping the match's
  // PENDING intent to SUCCESS/FAILED. A writeback hiccup must never fail the
  // user's action — the cron retry pass re-attempts anything left PENDING. We DO
  // surface a non-success outcome so the UI can show "saved, CRM push pending/failed"
  // immediately (acceptance criterion #8) rather than only via a later badge.
  let warning: string | undefined;
  if (writeback === "PENDING") {
    const res = await triggerWriteback(match.id).catch(() => null);
    if (!res || res.status === "FAILED") {
      warning = "Saved, but the Teleduce stage update failed — it will be retried.";
    } else if (res.status === "PENDING") {
      warning = "Saved. The Teleduce stage update is queued and will retry shortly.";
    }
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/inventory/${propertyId}`);
  revalidatePath("/matching");
  return { ok: true, warning };
}

/**
 * Remove a match record. Only SHORTLISTED matches can be removed — Shared and
 * Closed outcomes are deliberate decision signals and are
 * preserved.
 */
export async function clearMatchAction(
  leadId: string,
  propertyId: string,
): Promise<MatchActionState> {
  const user = await requireUser();

  const existing = await prisma.match.findUnique({
    where: { leadId_propertyId: { leadId, propertyId } },
    include: { lead: { select: { city: true } }, property: { select: { city: true } } },
  });
  if (!existing) return { ok: true };

  // Defence in depth: validate BOTH sides (a re-synced lead's city can drift
  // away from the property's), mirroring buildMatchSnapshot.
  if (
    user.role === "AGENT" &&
    (!user.cities.includes(existing.lead.city) || !user.cities.includes(existing.property.city))
  ) {
    return { error: "You are not assigned to this city." };
  }
  if (existing.status !== "SHORTLISTED") {
    return { error: "Only shortlisted matches can be removed." };
  }

  await prisma.match.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: user.id,
    action: "Match shortlist removed",
    entityType: "Match",
    entityId: existing.id,
    before: { leadId, propertyId, status: existing.status },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/inventory/${propertyId}`);
  revalidatePath("/matching");
  return { ok: true };
}

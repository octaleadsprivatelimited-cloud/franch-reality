"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth-helpers";
import { runTeleducePull } from "@/lib/teleduce/sync";
import { processPendingWritebacks } from "@/lib/teleduce/writeback";

/** Minimum gap between manual syncs (anti-abuse / anti over-fetch). */
const SYNC_COOLDOWN_MS = 5 * 60_000;

export interface SyncNowResult {
  ok: boolean;
  error?: string;
  /** True when refused because a sync ran within the cooldown window. */
  throttled?: boolean;
  /** Seconds until another sync is allowed (for the button cooldown). */
  retryAfterSec?: number;
  created?: number;
  updated?: number;
  archived?: number;
  failed?: number;
  mode?: string;
}

/**
 * Manually run the Teleduce pull (+ writeback pass) on demand — the same job the
 * 30-minute cron runs. Admin-only, and throttled to one run per
 * SYNC_COOLDOWN_MS so rapid clicks (or several admins) can't hammer the CRM. The
 * throttle is keyed on the last pull's start time, so it also respects a recent
 * cron run. Used by the "Sync now" button (and lets local development, where the
 * external scheduler does not run, sync on demand).
 */
export async function syncTeleduceNowAction(): Promise<SyncNowResult> {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return { ok: false, error: "Admins only." };

  // Server-side throttle (can't be bypassed by refreshing the page): refuse if a
  // pull started within the cooldown window.
  const lastPull = await prisma.syncLog.findFirst({
    where: { syncType: "TELEDUCE_PULL" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (lastPull) {
    const elapsed = Date.now() - lastPull.startedAt.getTime();
    if (elapsed < SYNC_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
      return {
        ok: false,
        throttled: true,
        retryAfterSec,
        error: `Synced recently — try again in ${Math.ceil(retryAfterSec / 60)} min.`,
      };
    }
  }

  try {
    const pull = await runTeleducePull();
    await processPendingWritebacks();
    revalidatePath("/");
    revalidatePath("/audit");
    revalidatePath("/leads");
    return {
      ok: true,
      created: pull.created,
      updated: pull.updated,
      archived: pull.archived,
      failed: pull.failed,
      mode: pull.mode,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
  }
}

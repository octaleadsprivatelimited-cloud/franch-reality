import "server-only";
import { prisma } from "@/lib/prisma";
import { teleduceMockMode } from "@/lib/env";

export type TeleduceSyncMode = "mock" | "realtime" | "scheduled";

export interface TeleduceSyncStatus {
  mode: TeleduceSyncMode;
  /** Most recent authenticated Corefactors webhook delivery, or null if none yet. */
  lastWebhookAt: Date | null;
  /** Most recent successful/partial scheduled pull, or null. */
  lastPullAt: Date | null;
}

/**
 * How Teleduce leads are currently flowing in — drives the nav pill + dashboard tile.
 *  - "mock"      → no live credentials (safe demo mode).
 *  - "realtime"  → the Corefactors webhook has delivered at least one authenticated
 *                  push, so leads arrive in real time. The 30-min pull stays on as a
 *                  backstop. Sticky once established (per product choice) so normal
 *                  quiet periods don't flip it; the last-event time is surfaced
 *                  separately so a genuinely stalled webhook is still visible.
 *  - "scheduled" → live, but the webhook has never delivered — leads come only from
 *                  the every-30-min pull.
 *
 * The webhook writes an audit row (action "Teleduce lead webhook") on every delivery;
 * that is the signal used here.
 */
export async function getTeleduceSyncStatus(): Promise<TeleduceSyncStatus> {
  if (teleduceMockMode) {
    return { mode: "mock", lastWebhookAt: null, lastPullAt: null };
  }
  const [lastWebhook, lastPull] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { action: "Teleduce lead webhook" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.syncLog.findFirst({
      where: { syncType: "TELEDUCE_PULL", status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, startedAt: true },
    }),
  ]);
  const lastWebhookAt = lastWebhook?.createdAt ?? null;
  const lastPullAt = lastPull ? lastPull.finishedAt ?? lastPull.startedAt : null;
  return { mode: lastWebhookAt ? "realtime" : "scheduled", lastWebhookAt, lastPullAt };
}

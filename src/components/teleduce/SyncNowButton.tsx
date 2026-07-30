"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { syncTeleduceNowAction, type SyncNowResult } from "@/app/(app)/sync-actions";

// Admin "Sync now" trigger — runs the same Teleduce pull as the 30-min cron, on
// demand. Shows a spinner while running, then a "Synced ✓" + countdown, and stays
// DISABLED for a 5-minute cooldown so the CRM can't be hammered. The server action
// is independently throttled, so the cooldown can't be bypassed by refreshing.
const COOLDOWN_MS = 5 * 60_000;

function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SyncNowButton({
  block,
  lastSyncAt,
}: {
  block?: boolean;
  /** Last successful pull (ISO) — seeds the cooldown so a refresh doesn't reset it. */
  lastSyncAt?: string | null;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncNowResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(() =>
    lastSyncAt ? new Date(lastSyncAt).getTime() + COOLDOWN_MS : 0,
  );
  // `now` stays null until mount so SSR and first client render match (no hydration
  // mismatch); then it ticks every second to drive the countdown.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Set after mount (not during render) so SSR and hydration agree on the label.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = now == null ? 0 : Math.max(0, cooldownUntil - now);
  const cooling = remaining > 0;
  const disabled = pending || cooling;

  function onClick() {
    setResult(null);
    start(async () => {
      const r = await syncTeleduceNowAction();
      setResult(r);
      if (r.ok) setCooldownUntil(Date.now() + COOLDOWN_MS);
      else if (r.throttled && r.retryAfterSec) setCooldownUntil(Date.now() + r.retryAfterSec * 1000);
    });
  }

  const justSynced = result?.ok && cooling;

  return (
    <div style={block ? { width: "100%" } : undefined}>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={disabled}
        style={block ? { width: "100%", justifyContent: "center" } : undefined}
        onClick={onClick}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 fr-spin" /> Syncing…
          </>
        ) : cooling ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            {justSynced ? "Synced ✓ · " : "Available in "}
            {mmss(remaining)}
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" /> Sync now
          </>
        )}
      </button>
      {result && !pending && (
        <p
          role="status"
          aria-live="polite"
          style={{
            fontSize: 12,
            margin: "6px 0 0",
            color: result.ok ? "var(--good)" : result.throttled ? "var(--ink-soft)" : "var(--bad)",
          }}
        >
          {result.ok
            ? `Synced — ${result.created ?? 0} new, ${result.updated ?? 0} refreshed${
                result.archived ? `, ${result.archived} archived` : ""
              }${result.failed ? `, ${result.failed} failed` : ""}.`
            : result.error}
        </p>
      )}
    </div>
  );
}

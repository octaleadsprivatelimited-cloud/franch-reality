"use client";

import { useState, useTransition } from "react";
import {
  Star,
  Send,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Undo2,
  ChevronDown,
} from "lucide-react";
import type { MatchStatus } from "@prisma/client";
import { setMatchStatusAction, clearMatchAction } from "@/app/(app)/matching/actions";
import type { MatchSummary } from "@/lib/matching-service";
import { MatchStatusBadge, WritebackBadge } from "./MatchBadges";

// Action island for a single (lead, property) pair. Calls the server actions,
// which recompute the band/criteria snapshot server-side and persist the Match.
export function MatchActions({
  leadId,
  propertyId,
  current,
}: {
  leadId: string;
  propertyId: string;
  current: MatchSummary | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState(current?.statusReason ?? "");

  const status = current?.status ?? null;
  const isClosed =
    status === "CLOSED_WON" || status === "CLOSED_LOST" || status === "CLOSED_NEUTRAL";

  function act(next: MatchStatus, statusReason?: string) {
    setError(null);
    start(async () => {
      const res = await setMatchStatusAction(leadId, propertyId, next, statusReason);
      if (res.error) setError(res.error);
      else setCloseOpen(false);
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await clearMatchAction(leadId, propertyId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {current && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <MatchStatusBadge status={current.status} />
          {current.teleduceWritebackStatus !== "NOT_REQUIRED" && (
            <WritebackBadge status={current.teleduceWritebackStatus} />
          )}
        </div>
      )}

      <div className="match-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("SHORTLISTED")}
          className={`btn btn-sm${status === "SHORTLISTED" ? " btn-primary" : ""}`}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          Shortlist
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => act("SHARED")}
          className={`btn btn-sm${status === "SHARED" ? " btn-primary" : ""}`}
        >
          <Send className="h-3.5 w-3.5" /> Mark Shared
        </button>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            disabled={pending}
            onClick={() => setCloseOpen((o) => !o)}
            className={`btn btn-sm${isClosed ? " btn-primary" : ""}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Close
            <ChevronDown className="h-3 w-3" />
          </button>
          {closeOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCloseOpen(false)} />
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  zIndex: 20,
                  marginTop: 4,
                  width: 240,
                  padding: 8,
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="search-input"
                  style={{ marginBottom: 8, width: "100%", fontSize: 12 }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("CLOSED_WON", reason)}
                  className="btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start", color: "var(--good)" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Won — registered
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("CLOSED_LOST", reason)}
                  className="btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start", color: "var(--bad)" }}
                >
                  <XCircle className="h-3.5 w-3.5" /> Lost — not interested
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("CLOSED_NEUTRAL", reason)}
                  className="btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start", color: "var(--ink-soft)" }}
                >
                  <MinusCircle className="h-3.5 w-3.5" /> No suitable property
                </button>
              </div>
            </>
          )}
        </div>

        {status === "SHORTLISTED" && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="btn-ghost btn-sm"
          >
            <Undo2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 11, color: "var(--bad)" }}>{error}</p>
      )}
    </div>
  );
}

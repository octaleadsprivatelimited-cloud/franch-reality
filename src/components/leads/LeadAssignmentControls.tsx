"use client";

import { useActionState, useState } from "react";
import type { City } from "@prisma/client";
import { cityLabel } from "@/lib/domain";
import {
  reassignLeadAction,
  distributeUnassignedAction,
  dismissUnassignmentAction,
  type LeadActionState,
} from "@/app/(app)/leads/actions";

interface AgentOption {
  id: string;
  fullName: string;
  cities: City[];
}

/** Admin override: (re)assign or unassign a single lead. */
export function LeadAssignControl({
  leadId,
  leadCity,
  currentAgentId,
  agents,
}: {
  leadId: string;
  leadCity: City;
  currentAgentId: string | null;
  agents: AgentOption[];
}) {
  const action = reassignLeadAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState<LeadActionState, FormData>(action, {});
  // Only agents who cover the lead's city can actually work it (the read layer hides
  // out-of-city leads), so the override only offers those.
  const eligible = agents.filter((a) => a.cities.includes(leadCity));

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        name="agentId"
        defaultValue={currentAgentId ?? "__unassign__"}
        style={{
          width: "100%",
          padding: "7px 10px",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-sm)",
          fontSize: 13,
          background: "white",
          color: "var(--ink)",
        }}
      >
        <option value="__unassign__">Unassigned</option>
        {eligible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
            {a.cities.length ? ` · ${a.cities.map((c) => cityLabel[c]).join("/")}` : ""}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="submit" className="btn btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save assignment"}
        </button>
        {state.error && <span className="field-error" style={{ margin: 0 }}>{state.error}</span>}
        {state.ok && !state.error && (
          <span style={{ fontSize: 12, color: "var(--good)" }}>Saved</span>
        )}
      </div>
    </form>
  );
}

/** Inline quick-assign for the unassigned queue: pick an agent → it assigns immediately
 *  (the row then drops off the queue on revalidation). Only shows agents who cover the
 *  lead's city, since an out-of-city agent couldn't work it. */
export function QuickAssign({
  leadId,
  leadCity,
  agents,
}: {
  leadId: string;
  leadCity: City;
  agents: AgentOption[];
}) {
  const action = reassignLeadAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState<LeadActionState, FormData>(action, {});
  // Controlled value + an explicit "Assign" button — NOT submit-on-change: a native
  // <select> fires `change` on every arrow key, so auto-submitting would assign the
  // lead the instant a keyboard user starts browsing the list (WCAG 3.2.2).
  const [value, setValue] = useState("");
  const eligible = agents.filter((a) => a.cities.includes(leadCity));

  if (eligible.length === 0) {
    return <span style={{ fontSize: 12, color: "var(--ink-fade)" }}>No agent in city</span>;
  }

  return (
    <form action={formAction} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <select
        name="agentId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        aria-label="Assign lead to agent"
        style={{
          padding: "5px 8px",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12.5,
          background: "white",
          color: "var(--ink)",
          maxWidth: 190,
        }}
      >
        <option value="">Assign to…</option>
        {eligible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-sm" disabled={pending || !value}>
        {pending ? "…" : "Assign"}
      </button>
      {state.error && (
        <span className="field-error" style={{ margin: 0, fontSize: 11 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Admin actions on an agent-returned lead: reassign (the dropdown defaults to the agent
 *  who returned it → "back", or pick someone else) + dismiss. Reassigning drops the record
 *  from the open list because the lead is assigned again. */
export function UnassignmentRecordActions({
  leadId,
  recordId,
  leadCity,
  defaultAgentId,
  agents,
}: {
  leadId: string;
  recordId: string;
  leadCity: City;
  defaultAgentId: string;
  agents: AgentOption[];
}) {
  const [rState, rAction, rPending] = useActionState<LeadActionState, FormData>(
    reassignLeadAction.bind(null, leadId),
    {},
  );
  const [dState, dAction, dPending] = useActionState<LeadActionState, FormData>(
    async () => dismissUnassignmentAction(recordId),
    {},
  );
  const eligible = agents.filter((a) => a.cities.includes(leadCity));
  const hasDefault = eligible.some((a) => a.id === defaultAgentId);
  const [value, setValue] = useState(hasDefault ? defaultAgentId : "");

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <form action={rAction} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <select
          name="agentId"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Reassign to agent"
          style={{
            padding: "5px 8px",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12.5,
            background: "white",
            color: "var(--ink)",
            maxWidth: 210,
          }}
        >
          {!hasDefault && <option value="">Assign to…</option>}
          {eligible.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName}
              {a.id === defaultAgentId ? " (returned it)" : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary btn-sm" disabled={rPending || !value}>
          {rPending ? "…" : "Reassign"}
        </button>
      </form>
      <form action={dAction}>
        <button type="submit" className="btn btn-sm" disabled={dPending}>
          {dPending ? "…" : "Dismiss"}
        </button>
      </form>
      {rState.error && (
        <span className="field-error" style={{ margin: 0, fontSize: 11 }}>
          {rState.error}
        </span>
      )}
      {dState.error && (
        <span className="field-error" style={{ margin: 0, fontSize: 11 }}>
          {dState.error}
        </span>
      )}
    </div>
  );
}

/** Two-step "unassign" button (bulk or per-agent). First click arms it, second confirms —
 *  so a bulk destructive action can't fire on a single stray click, and it's fully keyboard
 *  operable. `action` is a bound server action; the leads it frees return to the pool. */
export function UnassignButton({
  action,
  idle,
  confirm,
  disabled = false,
}: {
  action: () => Promise<LeadActionState>;
  idle: string;
  confirm: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction, pending] = useActionState<LeadActionState, FormData>(
    async () => {
      const result = await action();
      if (result.ok) setArmed(false);
      return result;
    },
    {},
  );

  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled}
        onClick={() => setArmed(true)}
        style={{ color: "var(--bad)" }}
      >
        {idle}
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="submit" className="btn-danger btn-sm" disabled={pending}>
        {pending ? "Working…" : confirm}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setArmed(false)} disabled={pending}>
        Cancel
      </button>
      {state.error && (
        <span className="field-error" style={{ margin: 0, fontSize: 11 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Admin backfill trigger on the assignments dashboard. Scoped to the console's city
 *  filter so the button, its count, and the mutation all describe the same lead set. */
export function DistributeButton({ unassignedCount, city }: { unassignedCount: number; city?: City }) {
  const [state, formAction, pending] = useActionState<LeadActionState, FormData>(
    async () => distributeUnassignedAction(city),
    {},
  );

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="submit"
        className="btn-primary"
        disabled={pending || unassignedCount === 0}
        style={{ alignSelf: "flex-start" }}
      >
        {pending
          ? "Distributing…"
          : unassignedCount === 0
            ? "No unassigned leads"
            : `Distribute ${unassignedCount} unassigned lead${unassignedCount === 1 ? "" : "s"}`}
      </button>
      {state.message && <span style={{ fontSize: 12, color: "var(--good)" }}>{state.message}</span>}
      {state.error && <span className="field-error" style={{ margin: 0 }}>{state.error}</span>}
    </form>
  );
}

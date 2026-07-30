"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MessageCircle, GitCompareArrows, Undo2, Save } from "lucide-react";
import type {
  AssignmentSource,
  AssignmentStatus,
  City,
  PropertyType,
  TransactionType,
} from "@prisma/client";
import {
  ASSIGNMENT_STATUSES,
  assignmentStatusLabel,
  assignmentStatusVariant,
  cityLabel,
  formatBudgetRange,
  propertyTypeLabel,
  transactionTypeLabel,
} from "@/lib/domain";
import { LeadStageBadge } from "./LeadStageBadge";
import {
  updateAssignmentAction,
  agentUnassignAction,
  type LeadActionState,
} from "@/app/(app)/leads/actions";

export interface AgentLead {
  id: string;
  firstName: string;
  lastName: string | null;
  city: City;
  mobile: string | null;
  email: string | null;
  currentStage: string;
  assignmentSource: AssignmentSource | null;
  assignmentStatus: AssignmentStatus;
  assignmentNote: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  transactionTypePref: TransactionType | null;
  propertyTypePref: PropertyType[];
  bhkPref: number[];
  preferredLocalities: { name: string }[];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--rule)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  background: "white",
  color: "var(--ink)",
};

export function AgentAssignmentCard({ lead }: { lead: AgentLead }) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
  const [updateState, updateAction, updating] = useActionState<LeadActionState, FormData>(
    updateAssignmentAction.bind(null, lead.id),
    {},
  );
  const [returning, setReturning] = useState(false);
  const [unassignState, unassignAction, unassigning] = useActionState<LeadActionState, FormData>(
    agentUnassignAction.bind(null, lead.id),
    {},
  );

  const variant = assignmentStatusVariant(lead.assignmentStatus);
  const req = [
    lead.bhkPref.length ? `${lead.bhkPref.join(", ")} BHK` : null,
    lead.transactionTypePref ? transactionTypeLabel[lead.transactionTypePref] : null,
    lead.propertyTypePref.length ? lead.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/leads/${lead.id}`} style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
              {name}
            </Link>
            <span className={`stage-pill${variant ? ` ${variant}` : ""}`}>
              {assignmentStatusLabel[lead.assignmentStatus]}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginTop: 4,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <LeadStageBadge stage={lead.currentStage} />
            <span>{cityLabel[lead.city]}</span>
            {req && <span>· {req}</span>}
            <span>· {formatBudgetRange(lead.budgetMin, lead.budgetMax, lead.transactionTypePref)}</span>
          </div>
          {lead.preferredLocalities.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--ink-fade)", marginTop: 2 }}>
              Areas: {lead.preferredLocalities.map((l) => l.name).join(", ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lead.mobile && (
            <a href={`tel:${lead.mobile}`} className="btn btn-sm">
              Call
            </a>
          )}
          <Link href={`/leads/${lead.id}/conversation`} className="btn btn-sm" title="Message this lead">
            <MessageCircle className="h-4 w-4" />
          </Link>
          <Link href={`/matching/lead/${lead.id}`} className="btn btn-sm" title="Find matching properties">
            <GitCompareArrows className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Status + feedback (one Save; the select never auto-submits) */}
      <form
        action={updateAction}
        style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--rule)", paddingTop: 10 }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label htmlFor={`status-${lead.id}`} style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>
            Status
          </label>
          <select
            id={`status-${lead.id}`}
            name="status"
            defaultValue={lead.assignmentStatus}
            style={{ ...inputStyle, width: "auto", minWidth: 190 }}
          >
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {assignmentStatusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          name="note"
          aria-label="Feedback / notes (visible to admins)"
          defaultValue={lead.assignmentNote ?? ""}
          rows={2}
          maxLength={2000}
          placeholder="Feedback / notes (visible to admins)…"
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="submit" className="btn btn-sm" disabled={updating}>
            <Save className="h-4 w-4" /> {updating ? "Saving…" : "Save"}
          </button>
          {updateState.ok && !updateState.error && (
            <span style={{ fontSize: 12, color: "var(--good)" }}>{updateState.message ?? "Saved"}</span>
          )}
          {updateState.error && <span className="field-error" style={{ margin: 0 }}>{updateState.error}</span>}
        </div>
      </form>

      {/* Return the lead (unassign) — reason required */}
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
        {lead.assignmentSource === "COFACTORS" ? (
          <div style={{ color: "var(--ink-fade)", fontSize: 12 }}>
            Assigned in Corefactors. Ask an admin to change the upstream owner if this lead needs to move.
          </div>
        ) : !returning ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ color: "var(--bad)" }}
            onClick={() => setReturning(true)}
          >
            <Undo2 className="h-4 w-4" /> Return lead
          </button>
        ) : (
          <form action={unassignAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor={`reason-${lead.id}`} style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>
              Reason for returning this lead (required)
            </label>
            <textarea
              id={`reason-${lead.id}`}
              name="reason"
              rows={2}
              required
              minLength={5}
              maxLength={1000}
              placeholder="e.g. Not reachable after 3 attempts / outside my area…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="submit" className="btn-danger btn-sm" disabled={unassigning}>
                {unassigning ? "Returning…" : "Confirm return"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setReturning(false)} disabled={unassigning}>
                Cancel
              </button>
              {unassignState.error && <span className="field-error" style={{ margin: 0 }}>{unassignState.error}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

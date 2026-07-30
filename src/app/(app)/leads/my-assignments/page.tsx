import { requireUser } from "@/lib/auth-helpers";
import { listAgentAssignments } from "@/lib/queries/leads";
import { AgentAssignmentCard, type AgentLead } from "@/components/leads/AgentAssignmentCard";

export default async function MyAssignmentsPage() {
  const user = await requireUser();
  const leads = await listAgentAssignments(user.id);

  const items: AgentLead[] = leads.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    city: l.city,
    mobile: l.mobile,
    email: l.email,
    currentStage: l.currentStage,
    assignmentSource: l.assignmentSource,
    assignmentStatus: l.assignmentStatus,
    assignmentNote: l.assignmentNote,
    budgetMin: l.budgetMin != null ? Number(l.budgetMin) : null,
    budgetMax: l.budgetMax != null ? Number(l.budgetMax) : null,
    transactionTypePref: l.transactionTypePref,
    propertyTypePref: l.propertyTypePref,
    bhkPref: l.bhkPref,
    preferredLocalities: l.preferredLocalities.map((p) => ({ name: p.name })),
  }));

  const openCount = items.filter(
    (i) => i.assignmentStatus !== "CLOSED_WON" && i.assignmentStatus !== "CLOSED_LOST",
  ).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My assignments</h1>
          <div className="subtitle">
            {items.length} lead{items.length === 1 ? "" : "s"} assigned to you · {openCount} open
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--ink-fade)", padding: 40 }}
        >
          You have no assigned leads right now. New leads are distributed automatically as they arrive.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((l) => (
            <AgentAssignmentCard key={l.id} lead={l} />
          ))}
        </div>
      )}
    </div>
  );
}

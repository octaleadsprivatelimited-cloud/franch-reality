import Link from "next/link";
import type { LeadMatchRow } from "@/lib/matching-service";
import {
  formatBudgetRange,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
} from "@/lib/domain";
import { LeadStageBadge } from "@/components/leads/LeadStageBadge";
import { CriteriaChips } from "./CriteriaChips";
import { MatchActions } from "./MatchActions";

// One lead in a property → leads result list, rendered as the mockup's
// .match-card. The thumb shows the lead's initials (leads have no image).
export function LeadMatchCard({ propertyId, row }: { propertyId: string; row: LeadMatchRow }) {
  const l = row.lead;
  const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead";
  const initials =
    [l.firstName, l.lastName]
      .filter(Boolean)
      .map((s) => s![0]!.toUpperCase())
      .join("")
      .slice(0, 2) || "?";

  const reqBits = [
    l.bhkPref.length > 0 ? `${l.bhkPref.join(", ")} BHK` : null,
    l.propertyTypePref.length > 0
      ? l.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
      : null,
    l.transactionTypePref ? transactionTypeLabel[l.transactionTypePref] : null,
  ].filter(Boolean);

  return (
    <div className="match-card">
      <div
        className="match-thumb"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "0.5px",
        }}
      >
        {initials}
      </div>
      <div className="match-body">
        <div className="file-no" style={{ color: "var(--ink-fade)" }}>
          {l.city ? cityLabel[l.city] : ""}
          {l.mobile ? ` · ${l.mobile}` : ""}
        </div>
        <h4>
          <Link href={`/leads/${l.id}`} style={{ color: "var(--ink)" }}>
            {name}
          </Link>
        </h4>
        <div className="meta">{reqBits.join(" · ")}</div>

        <div className="match-price">
          {formatBudgetRange(
            l.budgetMin != null ? Number(l.budgetMin) : null,
            l.budgetMax != null ? Number(l.budgetMax) : null,
            l.transactionTypePref,
          )}
        </div>

        <div style={{ marginBottom: 8 }}>
          <LeadStageBadge stage={l.currentStage} />
        </div>

        <CriteriaChips criteria={row.criteria} />

        <MatchActions leadId={l.id} propertyId={propertyId} current={row.existing} />
      </div>
    </div>
  );
}

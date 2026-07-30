import Link from "next/link";
import type { PropertyMatchRow } from "@/lib/matching-service";
import {
  formatPrice,
  furnishingLabel,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
} from "@/lib/domain";
import { CriteriaChips } from "./CriteriaChips";
import { MatchActions } from "./MatchActions";

// One property in a lead → properties result list, rendered as the mockup's
// .match-card (thumb + body with file-no, title, meta, chips, price, actions).
export function PropertyMatchCard({ leadId, row }: { leadId: string; row: PropertyMatchRow }) {
  const p = row.property;
  const rent = p.transactionType === "RENT";

  const metaBits = [
    `${p.locality.name}, ${cityLabel[p.city]}`,
    p.builtUpAreaSqft != null ? `${p.builtUpAreaSqft.toLocaleString("en-IN")} sqft` : null,
    p.facing ? `${p.facing} facing` : null,
    p.furnishing ? furnishingLabel[p.furnishing] : null,
  ].filter(Boolean);

  return (
    <div className="match-card">
      <Link href={`/inventory/${p.id}`} className="match-thumb" aria-label={`View ${p.fileNo}`} />
      <div className="match-body">
        <Link href={`/inventory/${p.id}`} className="file-no" style={{ color: "var(--ink-fade)" }}>
          {p.fileNo}
        </Link>
        <h4>
          {propertyTypeLabel[p.propertyType]}
          {p.bhk ? ` · ${p.bhk} BHK` : ""} for {transactionTypeLabel[p.transactionType]}
        </h4>
        <div className="meta">{metaBits.join(" · ")}</div>

        <div className="match-price">
          {rent ? (
            <>
              ₹{Number(p.priceInr).toLocaleString("en-IN")}{" "}
              <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 500 }}>/ month</span>
            </>
          ) : (
            formatPrice(Number(p.priceInr), p.transactionType)
          )}
        </div>

        <CriteriaChips criteria={row.criteria} />

        <MatchActions leadId={leadId} propertyId={p.id} current={row.existing} />
      </div>
    </div>
  );
}

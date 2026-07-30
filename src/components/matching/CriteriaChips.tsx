import type { CriteriaSnapshot } from "@/lib/matching";

// Visual explanation of WHY a property/lead matched — drives agent trust and
// doubles as a readable view of the persisted criteria snapshot.
// Rendered with the ported .chip terracotta classes: the location/band chip uses
// .chip.distance (terracotta), exact-match criteria use the default green .chip.
export function CriteriaChips({
  criteria,
}: {
  criteria: CriteriaSnapshot;
}) {
  const chips: { label: string; kind: "match" | "distance" }[] = [];

  // Location / band chip first — always the terracotta "distance" variant.
  if (criteria.localityExact) {
    chips.push({ label: "Preferred locality", kind: "distance" });
  } else if (criteria.distanceKm >= 0) {
    chips.push({ label: `+ ${criteria.distanceKm} km away`, kind: "distance" });
  } else {
    chips.push({ label: "City-wide", kind: "distance" });
  }

  if (criteria.bhkExact) chips.push({ label: "BHK ✓", kind: "match" });
  else if (criteria.bhkWithinOne) chips.push({ label: "BHK ±1", kind: "match" });

  if (criteria.typeMatch) chips.push({ label: "Type ✓", kind: "match" });
  if (criteria.transactionMatch) chips.push({ label: "Deal ✓", kind: "match" });
  if (criteria.budgetInRange) chips.push({ label: "Budget ✓", kind: "match" });
  return (
    <div className="match-chips">
      {chips.map((c, i) => (
        <span
          key={i}
          className={c.kind === "distance" ? "chip distance" : "chip"}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

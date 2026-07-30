"use client";

import { useRouter } from "next/navigation";
import { GitCompareArrows } from "lucide-react";

// Per-row "Find Matches" action in the leads table. The whole row is itself a
// link (TableRowLink), so we stop propagation and navigate to the dedicated
// lead-first matching page rather than the lead detail page.
export function FindMatchesButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/matching/lead/${leadId}`);
      }}
      // The row itself is a keyboard-activatable link (TableRowLink); stop Enter/Space
      // here so a focused button doesn't ALSO trigger the row's navigation.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      title="Find matching properties for this lead"
      aria-label="Find matching properties for this lead"
    >
      <GitCompareArrows className="h-4 w-4" />
    </button>
  );
}

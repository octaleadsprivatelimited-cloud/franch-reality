import { findStage } from "@/lib/teleduce/mapping";

// Map a Teleduce pipeline stage onto one of the mockup's .stage-pill variants
// (default/info, contacted, site-scheduled, completed, negative).
function stageVariant(stage: string): string {
  const s = findStage(stage);
  const l = stage.toLowerCase();

  // Won / completed outcomes → green "completed" pill.
  if (s?.isWon || l.includes("completed") || l.includes("registration")) return "completed";
  // Lost outcomes → red "negative" pill.
  if (s?.isLost || l.includes("not interested") || l.includes("purchased elsewhere")) {
    return "negative";
  }
  // Site visits / negotiation in progress → amber "site-scheduled" pill.
  if (l.includes("site visit") || l.includes("negotiation") || l.includes("registration")) {
    return "site-scheduled";
  }
  // Contacted / shared → terracotta "contacted" pill.
  if (l.includes("contacted") || l.includes("shared")) return "contacted";
  // Everything else (e.g. "Not yet contacted") → default info pill.
  return "";
}

// Colour a Teleduce pipeline stage via the ported .stage-pill terracotta classes.
export function LeadStageBadge({ stage }: { stage: string }) {
  const variant = stageVariant(stage);
  return <span className={`stage-pill${variant ? ` ${variant}` : ""}`}>{stage}</span>;
}

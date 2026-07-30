"use client";

import { useMemo, useState } from "react";
import {
  BandList,
  MatchMap,
  RadiusControl,
  ViewToggle,
  filterByRadius,
  type MatchAnchor,
  type MatchPin,
  type MatchView,
} from "./match-shared";
import { useLeadMatchDisplay } from "./LeadMatchDisplayContext";

// Compact, in-detail-page matching view: a control card (radius slider + presets +
// List/Map toggle) above the radius-banded results. Keeps the same external API it
// had before so the lead/inventory detail pages don't change. The full-page,
// mockup-faithful experience lives in MatchWorkspace (used by /matching/...).
export type { MatchPin, MatchAnchor } from "./match-shared";

export function MatchExplorer({
  bands,
  items,
  anchor,
  total,
  noun,
}: {
  bands: { band: number; label: string }[];
  items: MatchPin[];
  anchor: MatchAnchor | null;
  total: number;
  noun: string;
}) {
  const [radiusKm, setRadiusKm] = useState(20); // default: no limit (nothing hidden)
  const [view, setView] = useState<MatchView>("list");
  const sharedDisplay = useLeadMatchDisplay();
  const activeRadiusKm = sharedDisplay?.radiusKm ?? radiusKm;
  const setActiveRadiusKm = sharedDisplay?.setRadiusKm ?? setRadiusKm;
  const activeView = sharedDisplay?.view ?? view;
  const setActiveView = sharedDisplay?.setView ?? setView;

  const visible = useMemo(
    () => filterByRadius(items, activeRadiusKm),
    [items, activeRadiusKm],
  );

  if (total === 0) return null;

  return (
    <div>
      {!sharedDisplay && (
        <div
          className="card card-pad match-controls"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 18, marginBottom: 14 }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 260 }}>
            <RadiusControl
              radiusKm={activeRadiusKm}
              setRadiusKm={setActiveRadiusKm}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
              Showing <b style={{ color: "var(--ink)" }}>{visible.length}</b> of {total} {noun}
            </span>
            <ViewToggle view={activeView} setView={setActiveView} />
          </div>
        </div>
      )}

      {!anchor && activeRadiusKm < 20 && (
        <p style={{ fontSize: 12, color: "var(--ink-fade)", margin: "0 0 12px" }}>
          This {noun === "properties" ? "lead" : "property"} has no preferred locality, so distances are
          city-wide — set the radius to &ldquo;No limit&rdquo; to see all matches.
        </p>
      )}

      {activeView === "list" ? (
        <BandList bands={bands} visible={visible} />
      ) : (
        <MatchMap pins={visible} anchor={anchor} />
      )}
    </div>
  );
}

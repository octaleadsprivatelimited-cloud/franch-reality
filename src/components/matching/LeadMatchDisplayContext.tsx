"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  MAX_KM,
  RadiusControl,
  ViewToggle,
  type MatchView,
} from "./match-shared";

type LeadMatchDisplayState = {
  radiusKm: number;
  setRadiusKm: (radiusKm: number) => void;
  view: MatchView;
  setView: (view: MatchView) => void;
};

const LeadMatchDisplayContext = createContext<LeadMatchDisplayState | null>(null);

export function LeadMatchDisplayProvider({ children }: { children: ReactNode }) {
  const [radiusKm, setRadiusKm] = useState(MAX_KM);
  const [view, setView] = useState<MatchView>("list");
  const value = useMemo(
    () => ({ radiusKm, setRadiusKm, view, setView }),
    [radiusKm, view],
  );

  return (
    <LeadMatchDisplayContext.Provider value={value}>
      {children}
    </LeadMatchDisplayContext.Provider>
  );
}

export function useLeadMatchDisplay() {
  return useContext(LeadMatchDisplayContext);
}

export function LeadMatchDrawerControls({
  distances,
  total,
  noun,
}: {
  distances: number[];
  total: number;
  noun: string;
}) {
  const display = useLeadMatchDisplay();
  if (!display) return null;

  const visibleCount =
    display.radiusKm >= MAX_KM
      ? total
      : distances.filter(
          (distanceKm) => distanceKm >= 0 && distanceKm <= display.radiusKm,
        ).length;

  return (
    <section
      className="match-drawer-results-controls"
      aria-label="Result display controls"
    >
      <div className="match-drawer-results-head">
        <div>
          <div className="match-filter-eyebrow">Results display</div>
          <div className="match-drawer-results-count">
            Showing <b>{visibleCount}</b> of {total} {noun}
          </div>
        </div>
        <ViewToggle view={display.view} setView={display.setView} />
      </div>
      <RadiusControl
        radiusKm={display.radiusKm}
        setRadiusKm={display.setRadiusKm}
      />
    </section>
  );
}

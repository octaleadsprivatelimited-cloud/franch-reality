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

// Full-page matching experience that reproduces 03_UI_Mockup.html "Matching" screen:
// a sticky left panel (who we're matching + their criteria + the radius slider +
// the hard-filters note) beside the radius-banded results / static map. Used by
// /matching/lead/[id] and /matching/property/[id].

export interface MatchSubject {
  /** 1–2 char initials shown in the avatar tile. */
  avatar: string;
  title: string;
  /** Secondary line under the title, e.g. "LD-… · +91 …" or "FRHBAN338 · Banjara Hills". */
  metaLine: string;
  criteria: { key: string; val: string }[];
}

export function MatchWorkspace({
  subject,
  bands,
  items,
  anchor,
  total,
  noun,
  filterPanel,
}: {
  subject: MatchSubject;
  bands: { band: number; label: string }[];
  items: MatchPin[];
  anchor: MatchAnchor | null;
  total: number;
  noun: string;
  filterPanel?: React.ReactNode;
}) {
  const [radiusKm, setRadiusKm] = useState(20); // default: no limit
  const [view, setView] = useState<MatchView>("list");
  const visible = useMemo(() => filterByRadius(items, radiusKm), [items, radiusKm]);

  return (
    <div className="match-shell">
      {/* Left: subject panel + radius control + note */}
      <aside className="match-lead-panel sticky-filters">
        <div className="avatar-row">
          <div className="avatar">{subject.avatar}</div>
          <div style={{ minWidth: 0 }}>
            <h3>{subject.title}</h3>
            <div className="lead-meta">{subject.metaLine}</div>
          </div>
        </div>

        <div className="crit-list">
          <div
            style={{
              marginBottom: 6,
              color: "var(--ink-fade)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.45px",
              textTransform: "uppercase",
            }}
          >
            Source requirement
          </div>
          {subject.criteria.map((c) => (
            <div className="crit" key={c.key}>
              <span className="key">{c.key}</span>
              <span className="val">{c.val}</span>
            </div>
          ))}
        </div>

        {filterPanel}

        <RadiusControl radiusKm={radiusKm} setRadiusKm={setRadiusKm} />

        <div className="match-note">
          {filterPanel ? (
            <>
              <b>Filters are negotiable; the source requirement is not.</b>
              <br />
              Adjust the working criteria, then compare exact-locality, 3 km and
              5 km options before expanding city-wide.
            </>
          ) : (
            <>
              <b>Hard filters never relax.</b>
              <br />
              Budget ±10%, BHK exact (or ±1), type &amp; transaction exact — even
              at the widest radius. Only location expands.
            </>
          )}
        </div>
      </aside>

      {/* Right: results */}
      <div>
        <div className="match-results-head">
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Showing <b style={{ color: "var(--ink)" }}>{visible.length}</b> of {total} {noun}
          </span>
          <ViewToggle view={view} setView={setView} />
        </div>

        {total === 0 ? (
          <div
            className="card card-pad"
            style={{ textAlign: "center", color: "var(--ink-fade)", fontSize: 13, padding: 36 }}
          >
            No {noun} match the current filters.
          </div>
        ) : view === "list" ? (
          <BandList bands={bands} visible={visible} />
        ) : (
          <MatchMap pins={visible} anchor={anchor} />
        )}
      </div>
    </div>
  );
}

"use client";

import { List, Map as MapIcon } from "lucide-react";
import { BandSection } from "./BandSection";

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks for the matching experience (used by both the in-detail
// MatchExplorer and the full-page MatchWorkspace):
//   • RadiusControl — the polished distance slider + preset chips + live readout
//   • ViewToggle    — List / Map segmented control
//   • MatchMap      — STATIC Google map, pins placed purely from our own stored
//                     locality lat/lng (no Google data/geocoding calls)
//   • BandList      — the radius-banded result list
// distanceKm is precomputed per match by the engine, so radius filtering is a pure
// client-side filter — no re-query.
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchPin {
  key: string;
  band: number;
  /** Straight-line km to the closest anchor locality; < 0 = unknown (no anchor). */
  distanceKm: number;
  lat: number | null;
  lng: number | null;
  pinLabel: string;
  card: React.ReactNode;
}
export interface MatchAnchor {
  lat: number;
  lng: number;
  label: string;
}
export type MatchView = "list" | "map";

export const MAX_KM = 20; // top of the slider = "No limit"
export const RADIUS_PRESETS: { label: string; km: number }[] = [
  { label: "≤ 3 km", km: 3 },
  { label: "≤ 5 km", km: 5 },
  { label: "≤ 10 km", km: 10 },
  { label: "No limit", km: MAX_KM },
];

export function filterByRadius(items: MatchPin[], radiusKm: number): MatchPin[] {
  if (radiusKm >= MAX_KM) return items;
  return items.filter((it) => it.distanceKm >= 0 && it.distanceKm <= radiusKm);
}

const BAND_PIN_COLOR: Record<number, string> = { 0: "0x2e7d32", 1: "0x1565c0", 2: "0x8e44ad", 3: "0x9e9e9e" };
const BAND_LEGEND: Record<number, string> = { 0: "#2e7d32", 1: "#1565c0", 2: "#8e44ad", 3: "#9e9e9e" };
const ANCHOR_COLOR = "0x16325c"; // brand navy
const MAP_PIN_CAP = 80;

export function buildStaticMapUrl(pins: MatchPin[], anchor: MatchAnchor | null): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_STATIC_MAPS_KEY;
  if (!key) return null;
  const withCoords = pins.filter((p) => p.lat != null && p.lng != null).slice(0, MAP_PIN_CAP);
  if (!withCoords.length && !anchor) return null;

  const params = ["size=640x440", "scale=2", "maptype=roadmap"];
  if (anchor) params.push(`markers=color:${ANCHOR_COLOR}|label:A|${anchor.lat},${anchor.lng}`);

  // One markers= group per band so pins are colour-coded by radius band.
  const byBand = new Map<number, string[]>();
  for (const p of withCoords) {
    const arr = byBand.get(p.band) ?? [];
    arr.push(`${p.lat},${p.lng}`);
    byBand.set(p.band, arr);
  }
  for (const [band, coords] of byBand) {
    params.push(`markers=color:${BAND_PIN_COLOR[band] ?? "0x9e9e9e"}|size:small|${coords.join("|")}`);
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join("&")}&key=${key}`;
}

// ── Radius slider + presets ───────────────────────────────────────────────────

export function RadiusControl({
  radiusKm,
  setRadiusKm,
}: {
  radiusKm: number;
  setRadiusKm: (km: number) => void;
}) {
  const unlimited = radiusKm >= MAX_KM;
  const pct = ((radiusKm - 1) / (MAX_KM - 1)) * 100;
  const fill = `linear-gradient(to right, var(--brand) 0%, var(--brand) ${pct}%, var(--rule) ${pct}%, var(--rule) 100%)`;

  return (
    <div className="radius-control">
      <div className="radius-control-head">
        <span className="label">Distance radius</span>
        <span className="radius-value">{unlimited ? "No limit" : `Within ${radiusKm} km`}</span>
      </div>

      <input
        type="range"
        className="fr-range"
        min={1}
        max={MAX_KM}
        step={1}
        value={radiusKm}
        onChange={(e) => setRadiusKm(Number(e.target.value))}
        style={{ background: fill }}
        aria-label="Filter matches by radius in kilometres"
      />
      <div className="radius-ticks">
        <span>1 km</span>
        <span>No limit</span>
      </div>

      <div className="radius-presets">
        {RADIUS_PRESETS.map((p) => (
          <button
            key={p.km}
            type="button"
            className={radiusKm === p.km ? "on" : ""}
            onClick={() => setRadiusKm(p.km)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── List / Map toggle ─────────────────────────────────────────────────────────

export function ViewToggle({
  view,
  setView,
}: {
  view: MatchView;
  setView: (v: MatchView) => void;
}) {
  return (
    <div className="view-toggle" role="tablist" aria-label="Result view">
      <button
        type="button"
        role="tab"
        aria-selected={view === "list"}
        className={view === "list" ? "on" : ""}
        onClick={() => setView("list")}
      >
        <List className="h-3.5 w-3.5" style={{ marginRight: 5 }} /> List
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "map"}
        className={view === "map" ? "on" : ""}
        onClick={() => setView("map")}
      >
        <MapIcon className="h-3.5 w-3.5" style={{ marginRight: 5 }} /> Map
      </button>
    </div>
  );
}

// ── Banded result list ────────────────────────────────────────────────────────

export function BandList({
  bands,
  visible,
}: {
  bands: { band: number; label: string }[];
  visible: MatchPin[];
}) {
  return (
    <>
      {bands.map((b) => {
        const rows = visible.filter((it) => it.band === b.band);
        return (
          <BandSection
            key={b.band}
            band={b.band}
            label={b.label}
            count={rows.length}
            defaultOpen={b.band <= 1 && rows.length > 0}
          >
            {rows.map((it) => (
              <div key={it.key}>{it.card}</div>
            ))}
          </BandSection>
        );
      })}
    </>
  );
}

// ── Static map view ───────────────────────────────────────────────────────────

export function MatchMap({
  pins,
  anchor,
}: {
  pins: MatchPin[];
  anchor: MatchAnchor | null;
}) {
  const url = buildStaticMapUrl(pins, anchor);
  if (!url) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-fade)", fontSize: 13 }}>
        <MapIcon className="h-6 w-6" style={{ margin: "0 auto 8px", color: "var(--ink-fade)" }} />
        <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--ink-soft)" }}>Map view not configured</p>
        <p style={{ margin: 0 }}>
          Set <code>NEXT_PUBLIC_GOOGLE_STATIC_MAPS_KEY</code> in <code>.env</code> to enable the static map.
          The radius slider and list view work without it.
        </p>
      </div>
    );
  }
  const count = pins.filter((p) => p.lat != null && p.lng != null).length;
  return (
    <div className="card card-pad">
      {/* Static image from Google Static Maps — pins are placed from our own
          locality lat/lng; no Google data/geocoding APIs are called. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Map of ${count} match${count === 1 ? "" : "es"}`}
        style={{ width: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--rule)", display: "block" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: 12, color: "var(--ink-soft)" }}>
        {anchor && <Legend color="#16325c" label={`A · ${anchor.label}`} />}
        <Legend color={BAND_LEGEND[0]} label="Exact locality" />
        <Legend color={BAND_LEGEND[1]} label="≤ 3 km" />
        <Legend color={BAND_LEGEND[2]} label="≤ 5 km" />
        <Legend color={BAND_LEGEND[3]} label="Beyond 5 km" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

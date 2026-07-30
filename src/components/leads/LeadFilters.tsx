"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { City } from "@prisma/client";
import {
  CITIES,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
  BHK_OPTIONS,
  cityLabel,
  propertyTypeLabel,
  transactionTypeLabel,
  parsePriceInput,
} from "@/lib/domain";
import {
  LEAD_WITHIN_OPTIONS,
  LEAD_WITHIN_FIELD_OPTIONS,
  DEFAULT_LEAD_WITHIN_FIELD,
} from "@/lib/lead-filters";
import { TELEDUCE_STAGES } from "@/lib/teleduce/mapping";

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 30px 7px 10px",
  border: "1px solid var(--rule)",
  borderRadius: "var(--radius-sm)",
  fontSize: 12.5,
  backgroundColor: "white",
  color: "var(--ink)",
};

/**
 * Left filter panel for the leads list — mirrors the inventory panel. All state
 * lives in the URL (repeated keys for the multi-selects) so it is shareable and
 * server-rendered.
 */
export function LeadFilters({
  isAdmin,
  localities,
  sources,
  owners,
  agents = [],
}: {
  isAdmin: boolean;
  localities: { id: number; name: string; city: City }[];
  sources: string[];
  owners: string[];
  agents?: { id: string; fullName: string; cities: City[] }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [localityQuery, setLocalityQuery] = useState("");

  const get = (k: string) => params.get(k) ?? "";

  function push(next: URLSearchParams) {
    next.delete("page"); // any filter change resets pagination
    router.push(`/leads?${next.toString()}`);
  }

  function setScalar(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  /** Switching city must drop any selected localities from the other city — they stop
   *  rendering as checkboxes but would otherwise stay in the URL and force zero rows
   *  with nothing on screen to explain why. */
  function setCity(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("city", value);
    else next.delete("city");

    const keep = params
      .getAll("localityId")
      .filter((id) => {
        const loc = localities.find((l) => String(l.id) === id);
        return loc && (!value || loc.city === value);
      });
    next.delete("localityId");
    for (const id of keep) next.append("localityId", id);

    push(next);
  }

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const current = next.getAll(key);
    next.delete(key);
    if (current.includes(value)) {
      for (const v of current) if (v !== value) next.append(key, v);
    } else {
      for (const v of current) next.append(key, v);
      next.append(key, value);
    }
    push(next);
  }

  function setBudget(key: "budgetMinInr" | "budgetMaxInr", raw: string) {
    const next = new URLSearchParams(params.toString());
    const inr = parsePriceInput(raw);
    if (inr != null) next.set(key, String(inr));
    else next.delete(key);
    push(next);
  }

  const checked = (key: string, value: string) => params.getAll(key).includes(value);

  const activity = get("activity") || "active";
  const matched = get("matched") || "any";
  const contact = get("contact") || "any";
  const archived = get("archived") || "exclude";
  const selectedCity = get("city");
  const withinField = get("withinField") || DEFAULT_LEAD_WITHIN_FIELD;

  const cityLocalities = selectedCity
    ? localities.filter((l) => l.city === selectedCity)
    : localities;
  const q = localityQuery.trim().toLowerCase();
  const shownLocalities = q
    ? cityLocalities.filter((l) => l.name.toLowerCase().includes(q))
    : cityLocalities;

  const budgetMin = get("budgetMinInr");
  const budgetMax = get("budgetMaxInr");
  const hasFilters = Array.from(params.keys()).some((k) => k !== "page");

  return (
    <aside className="filter-panel sticky-filters">
      <h4>Filters</h4>

      <div className="filter-group">
        <span className="filter-legend">Activity</span>
        {(
          [
            ["active", "Active"],
            ["won", "Won"],
            ["lost", "Lost"],
            ["all", "All"],
          ] as [string, string][]
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="activity"
              checked={activity === value}
              onChange={() => setScalar("activity", value === "active" ? "" : value)}
            />
            {label}
          </label>
        ))}
      </div>

      {/* "Leads pulled in the last 30 min / 1 hour / …" */}
      <div className="filter-group">
        <span className="filter-legend">Time window</span>
        <select
          value={get("within")}
          onChange={(e) => setScalar("within", e.target.value)}
          style={{ ...selectStyle, marginBottom: 6 }}
        >
          <option value="">Any time</option>
          {LEAD_WITHIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={withinField}
          disabled={!get("within")}
          onChange={(e) =>
            setScalar("withinField", e.target.value === DEFAULT_LEAD_WITHIN_FIELD ? "" : e.target.value)
          }
          style={{ ...selectStyle, opacity: get("within") ? 1 : 0.5 }}
          aria-label="Which timestamp the time window applies to"
        >
          {LEAD_WITHIN_FIELD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Based on: {o.label}
            </option>
          ))}
        </select>
      </div>

      {isAdmin && (
        <div className="filter-group">
          <span className="filter-legend">City</span>
          <label>
            <input
              type="radio"
              name="city"
              checked={!selectedCity}
              onChange={() => setCity("")}
            />
            All cities
          </label>
          {CITIES.map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="city"
                checked={selectedCity === c}
                onChange={() => setCity(c)}
              />
              {cityLabel[c]}
            </label>
          ))}
        </div>
      )}

      <div className="filter-group">
        <span className="filter-legend">Transaction</span>
        <label>
          <input
            type="radio"
            name="transactionType"
            checked={!get("transactionType")}
            onChange={() => setScalar("transactionType", "")}
          />
          Sale &amp; rent
        </label>
        {TRANSACTION_TYPES.map((t) => (
          <label key={t}>
            <input
              type="radio"
              name="transactionType"
              checked={get("transactionType") === t}
              onChange={() => setScalar("transactionType", t)}
            />
            {transactionTypeLabel[t]}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">Stage</span>
        <select value={get("stage")} onChange={(e) => setScalar("stage", e.target.value)} style={selectStyle}>
          <option value="">All stages</option>
          {TELEDUCE_STAGES.map((s) => (
            <option key={s.id} value={s.display}>
              {s.display}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-legend">Property type</span>
        {PROPERTY_TYPES.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={checked("propertyType", t)}
              onChange={() => toggle("propertyType", t)}
            />
            {propertyTypeLabel[t]}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">BHK</span>
        {BHK_OPTIONS.map((b) => (
          <label key={b}>
            <input
              type="checkbox"
              checked={checked("bhk", String(b))}
              onChange={() => toggle("bhk", String(b))}
            />
            {b} BHK
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">Budget (₹)</span>
        {/* Prefill with the EXACT rupee value, never a re-formatted "0.2 L" — the compact
            display rounds, and blurring the field would re-parse that rounded text and
            silently shift the filter (a ₹15,000 rent budget became ₹20,000). You can still
            TYPE "50 L" / "2 Cr"; parsePriceInput accepts both. `key` remounts the inputs
            when the URL changes so "Clear all filters" really clears them. */}
        <div className="filter-range">
          <input
            key={`min-${budgetMin}`}
            type="text"
            defaultValue={budgetMin || ""}
            placeholder="Min (e.g. 50 L)"
            onBlur={(e) => setBudget("budgetMinInr", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBudget("budgetMinInr", e.currentTarget.value);
            }}
          />
          <span style={{ color: "var(--ink-fade)" }}>to</span>
          <input
            key={`max-${budgetMax}`}
            type="text"
            defaultValue={budgetMax || ""}
            placeholder="Max (e.g. 2 Cr)"
            onBlur={(e) => setBudget("budgetMaxInr", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBudget("budgetMaxInr", e.currentTarget.value);
            }}
          />
        </div>
      </div>

      {cityLocalities.length > 0 && (
        <div className="filter-group">
          <span className="filter-legend">Preferred areas ({cityLocalities.length})</span>
          <input
            type="text"
            className="filter-search"
            placeholder="Search areas…"
            value={localityQuery}
            onChange={(e) => setLocalityQuery(e.target.value)}
          />
          <div className="filter-scroll">
            {shownLocalities.map((l) => (
              <label key={l.id}>
                <input
                  type="checkbox"
                  checked={checked("localityId", String(l.id))}
                  onChange={() => toggle("localityId", String(l.id))}
                />
                {l.name}
              </label>
            ))}
            {shownLocalities.length === 0 && (
              <span className="filter-legend" style={{ marginTop: 4 }}>
                No areas match “{localityQuery}”.
              </span>
            )}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="filter-group">
          <span className="filter-legend">Source</span>
          <select value={get("source")} onChange={(e) => setScalar("source", e.target.value)} style={selectStyle}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {owners.length > 0 && (
        <div className="filter-group">
          <span className="filter-legend">Owner</span>
          <select value={get("owner")} onChange={(e) => setScalar("owner", e.target.value)} style={selectStyle}>
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )}

      {isAdmin && agents.length > 0 && (
        <div className="filter-group">
          <span className="filter-legend">Assigned agent</span>
          <select
            value={get("assignedAgentId")}
            onChange={(e) => setScalar("assignedAgentId", e.target.value)}
            style={selectStyle}
          >
            <option value="">All agents</option>
            <option value="__unassigned__">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-group">
        <span className="filter-legend">Matches</span>
        {(
          [
            ["any", "Any"],
            ["yes", "Has matches"],
            ["no", "No matches yet"],
          ] as [string, string][]
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="matched"
              checked={matched === value}
              onChange={() => setScalar("matched", value === "any" ? "" : value)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">Contact details</span>
        {(
          [
            ["any", "Any"],
            ["mobile", "Has mobile"],
            ["email", "Has email"],
          ] as [string, string][]
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="contact"
              checked={contact === value}
              onChange={() => setScalar("contact", value === "any" ? "" : value)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">Archived in Teleduce</span>
        {(
          [
            ["exclude", "Hide archived"],
            ["include", "Include archived"],
            ["only", "Only archived"],
          ] as [string, string][]
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="archived"
              checked={archived === value}
              onChange={() => setScalar("archived", value === "exclude" ? "" : value)}
            />
            {label}
          </label>
        ))}
      </div>

      {hasFilters && (
        <button
          className="btn btn-sm"
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={() => router.push("/leads")}
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}

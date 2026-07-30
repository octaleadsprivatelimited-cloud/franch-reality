"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { City } from "@prisma/client";
import {
  CITIES,
  PROPERTY_TYPES,
  BUILDING_CLASSIFICATIONS,
  TRANSACTION_TYPES,
  AVAILABILITY_STATUSES,
  BHK_OPTIONS,
  cityLabel,
  propertyTypeLabel,
  buildingClassificationLabel,
  transactionTypeLabel,
  availabilityLabel,
  parsePriceInput,
} from "@/lib/domain";

/**
 * Left filter panel — matches 03_UI_Mockup.html: grouped multi-select checkboxes
 * for Transaction / Status / Property type / BHK / Locality, plus a price range.
 * State lives in the URL (repeated keys for arrays) so it is shareable and
 * server-rendered.
 */
export function InventoryFilters({
  localities,
  isAdmin,
}: {
  localities: { id: number; name: string; city: City }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [localityQuery, setLocalityQuery] = useState("");

  function push(next: URLSearchParams) {
    next.delete("page"); // reset pagination on any filter change
    router.push(`/inventory?${next.toString()}`);
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

  function setScalar(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  function setPrice(key: "priceMinInr" | "priceMaxInr", raw: string) {
    const next = new URLSearchParams(params.toString());
    const inr = parsePriceInput(raw);
    if (inr != null) next.set(key, String(inr));
    else next.delete(key);
    push(next);
  }

  const checked = (key: string, value: string) => params.getAll(key).includes(value);
  const selectedCity = params.get("city");
  const cityLocalities = selectedCity
    ? localities.filter((l) => l.city === selectedCity)
    : localities;
  const q = localityQuery.trim().toLowerCase();
  const shownLocalities = q
    ? cityLocalities.filter((l) => l.name.toLowerCase().includes(q))
    : cityLocalities;
  const priceMin = params.get("priceMinInr");
  const priceMax = params.get("priceMaxInr");
  const hasFilters = Array.from(params.keys()).some((k) => k !== "page" && k !== "view");

  return (
    <aside className="filter-panel sticky-filters">
      <h4>Filters</h4>

      {isAdmin && (
        <div className="filter-group">
          <span className="filter-legend">City</span>
          <label>
            <input
              type="radio"
              name="city"
              checked={!selectedCity}
              onChange={() => setScalar("city", "")}
            />
            All cities
          </label>
          {CITIES.map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="city"
                checked={selectedCity === c}
                onChange={() => setScalar("city", c)}
              />
              {cityLabel[c]}
            </label>
          ))}
        </div>
      )}

      <div className="filter-group">
        <span className="filter-legend">Transaction</span>
        {TRANSACTION_TYPES.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={checked("transactionType", t)}
              onChange={() => toggle("transactionType", t)}
            />
            {transactionTypeLabel[t]}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-legend">Status</span>
        {AVAILABILITY_STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={checked("availabilityStatus", s)}
              onChange={() => toggle("availabilityStatus", s)}
            />
            {availabilityLabel[s]}
          </label>
        ))}
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
        <span className="filter-legend">Building classification</span>
        {BUILDING_CLASSIFICATIONS.map((b) => (
          <label key={b}>
            <input
              type="checkbox"
              checked={checked("buildingClassification", b)}
              onChange={() => toggle("buildingClassification", b)}
            />
            {buildingClassificationLabel[b]}
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
        <span className="filter-legend">Price (₹)</span>
        {/* Prefill the EXACT rupee value, not a re-formatted "52.6 L": the compact display
            rounds, and blurring re-parsed that rounded text, silently shifting the filter
            (₹52,55,000 → ₹52,60,000). Typing "50 L" / "2 Cr" still works. `key` remounts
            the input on URL change so "Clear all filters" really clears it. */}
        <div className="filter-range">
          <input
            key={`min-${priceMin}`}
            type="text"
            defaultValue={priceMin || ""}
            placeholder="Min (e.g. 50 L)"
            onBlur={(e) => setPrice("priceMinInr", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setPrice("priceMinInr", e.currentTarget.value);
            }}
          />
          <span style={{ color: "var(--ink-fade)" }}>to</span>
          <input
            key={`max-${priceMax}`}
            type="text"
            defaultValue={priceMax || ""}
            placeholder="Max (e.g. 2 Cr)"
            onBlur={(e) => setPrice("priceMaxInr", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setPrice("priceMaxInr", e.currentTarget.value);
            }}
          />
        </div>
      </div>

      {cityLocalities.length > 0 && (
        <div className="filter-group">
          <span className="filter-legend">Locality ({cityLocalities.length})</span>
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

      {hasFilters && (
        <button
          className="btn btn-sm"
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={() => {
            // Preserve the view toggle (a display preference, not a filter).
            const keep = new URLSearchParams();
            if (params.get("view") === "list") keep.set("view", "list");
            const qs = keep.toString();
            router.push(`/inventory${qs ? `?${qs}` : ""}`);
          }}
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}

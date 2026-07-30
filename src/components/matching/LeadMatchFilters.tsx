"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { City } from "@prisma/client";
import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  BHK_OPTIONS,
  BUILDING_CLASSIFICATIONS,
  FURNISHINGS,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
  buildingClassificationLabel,
  cityLabel,
  furnishingLabel,
  propertyTypeLabel,
  transactionTypeLabel,
} from "@/lib/domain";
import type { ResolvedLeadMatchFilters } from "@/lib/match-filters";

type FilterLocality = { id: number; name: string; city: City };
type FilterDraft = {
  city: City;
  localityIds: number[];
  transactionTypes: ResolvedLeadMatchFilters["transactionTypes"];
  propertyTypes: ResolvedLeadMatchFilters["propertyTypes"];
  bhks: number[];
  buildingClassifications: ResolvedLeadMatchFilters["buildingClassifications"];
  furnishings: ResolvedLeadMatchFilters["furnishings"];
  budgetMin: string;
  budgetMax: string;
  builtUpAreaMin: string;
  parkingMin: string;
  bhkFlex: boolean;
  budgetFlex: boolean;
};

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function LeadMatchFilters({
  actionPath,
  filters,
  localities,
  availableCities,
  compact = false,
  drawer = false,
  drawerControls,
}: {
  actionPath: string;
  filters: ResolvedLeadMatchFilters;
  localities: FilterLocality[];
  availableCities: City[];
  compact?: boolean;
  drawer?: boolean;
  drawerControls?: React.ReactNode;
}) {
  const router = useRouter();
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [updateQueued, setUpdateQueued] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [city, setCity] = useState(filters.city);
  const [localityIds, setLocalityIds] = useState(filters.localityIds);
  const [transactionTypes, setTransactionTypes] = useState(filters.transactionTypes);
  const [propertyTypes, setPropertyTypes] = useState(filters.propertyTypes);
  const [bhks, setBhks] = useState(filters.bhks);
  const [buildingClassifications, setBuildingClassifications] = useState(
    filters.buildingClassifications,
  );
  const [furnishings, setFurnishings] = useState(filters.furnishings);
  const [budgetMin, setBudgetMin] = useState(filters.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(filters.budgetMax?.toString() ?? "");
  const [builtUpAreaMin, setBuiltUpAreaMin] = useState(
    filters.builtUpAreaMin?.toString() ?? "",
  );
  const [parkingMin, setParkingMin] = useState(filters.parkingMin?.toString() ?? "");
  const [bhkFlex, setBhkFlex] = useState(filters.bhkFlex);
  const [budgetFlex, setBudgetFlex] = useState(filters.budgetFlex);
  const [localityQuery, setLocalityQuery] = useState("");

  useEffect(
    () => () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    },
    [],
  );

  const currentDraft = (): FilterDraft => ({
    city,
    localityIds,
    transactionTypes,
    propertyTypes,
    bhks,
    buildingClassifications,
    furnishings,
    budgetMin,
    budgetMax,
    builtUpAreaMin,
    parkingMin,
    bhkFlex,
    budgetFlex,
  });

  function scheduleLiveUpdate(next: FilterDraft, delayMs = 180) {
    if (!drawer) return;
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    setUpdateQueued(true);
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      setUpdateQueued(false);

      const params = new URLSearchParams();
      params.set("matchMode", "custom");
      params.set("city", next.city);
      for (const id of next.localityIds) params.append("localityId", String(id));
      for (const type of next.transactionTypes) params.append("transactionType", type);
      for (const type of next.propertyTypes) params.append("propertyType", type);
      for (const bhk of next.bhks) params.append("bhk", String(bhk));
      for (const classification of next.buildingClassifications) {
        params.append("buildingClassification", classification);
      }
      for (const furnishing of next.furnishings) {
        params.append("furnishing", furnishing);
      }
      if (next.budgetMin) params.set("budgetMin", next.budgetMin);
      if (next.budgetMax) params.set("budgetMax", next.budgetMax);
      if (next.builtUpAreaMin) params.set("builtUpAreaMin", next.builtUpAreaMin);
      if (next.parkingMin) params.set("parkingMin", next.parkingMin);
      if (next.bhkFlex) params.set("bhkFlex", "1");
      if (next.budgetFlex) params.set("budgetFlex", "1");

      startTransition(() => {
        router.replace(`${actionPath}?${params.toString()}`, { scroll: false });
      });
    }, delayMs);
  }

  const cityLocalities = localities.filter((locality) => locality.city === city);
  const normalizedQuery = localityQuery.trim().toLowerCase();
  const extraFiltersActive =
    buildingClassifications.length > 0 ||
    furnishings.length > 0 ||
    builtUpAreaMin !== "" ||
    parkingMin !== "";
  const loadingResults = updateQueued || isPending;

  const selectedLocalityNames = localities
    .filter((locality) => localityIds.includes(locality.id))
    .map((locality) => locality.name);
  const locationSummary =
    selectedLocalityNames.length === 0
      ? "Whole city"
      : selectedLocalityNames.length <= 2
        ? selectedLocalityNames.join(", ")
        : `${selectedLocalityNames.slice(0, 2).join(", ")} +${selectedLocalityNames.length - 2}`;
  const budgetSummary =
    budgetMin === "" && budgetMax === ""
      ? "Any budget"
      : budgetMin !== "" && budgetMax !== ""
        ? `₹${Number(budgetMin).toLocaleString("en-IN")}–₹${Number(budgetMax).toLocaleString("en-IN")}`
        : budgetMin !== ""
          ? `₹${Number(budgetMin).toLocaleString("en-IN")}+`
          : `Up to ₹${Number(budgetMax).toLocaleString("en-IN")}`;
  const summaryItems = [
    { label: "Location", value: locationSummary },
    {
      label: "Deal",
      value: transactionTypes.length
        ? transactionTypes.map((value) => transactionTypeLabel[value]).join(" + ")
        : "Any",
    },
    {
      label: "Type",
      value: propertyTypes.length
        ? propertyTypes.map((value) => propertyTypeLabel[value]).join(" + ")
        : "Any",
    },
    {
      label: "BHK",
      value: bhks.length ? bhks.join(", ") + (bhkFlex ? " ±1" : "") : "Any",
    },
    { label: "Budget", value: budgetSummary },
  ];

  const filterForm = (
    <form
      action={actionPath}
      method="get"
      className={[
        "match-filter-form",
        compact ? "compact" : "",
        drawer ? "in-drawer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loadingResults}
      onSubmit={drawer ? (event) => event.preventDefault() : undefined}
    >
      <input type="hidden" name="matchMode" value="custom" />

      <div className="match-filter-head">
        <div>
          <div className="match-filter-eyebrow">Working filters</div>
          <div className="match-filter-title">Fine-tune this property search</div>
        </div>
        <div className="match-filter-head-actions">
          <span className="match-available-pill">Available only</span>
          {drawer && (
            <button
              type="button"
              className="match-drawer-close"
              aria-label="Close filters"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="match-filter-help">
        Starts from the buyer&apos;s requirement. Changes affect this search only and
        never overwrite Teleduce.
      </p>

      {drawerControls}

      <div className="match-filter-grid">
        <fieldset className="match-filter-field">
          <legend>City</legend>
          {availableCities.length === 1 ? (
            <>
              <input type="hidden" name="city" value={city} />
              <div className="match-filter-static">{cityLabel[city]}</div>
            </>
          ) : (
            <select
              name="city"
              value={city}
              onChange={(event) => {
                const nextCity = event.target.value as City;
                setCity(nextCity);
                setLocalityIds([]);
                setLocalityQuery("");
                scheduleLiveUpdate({
                  ...currentDraft(),
                  city: nextCity,
                  localityIds: [],
                });
              }}
            >
              {availableCities.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {cityLabel[candidate]}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <fieldset className="match-filter-field">
          <legend>Transaction</legend>
          <div className="match-filter-options">
            {TRANSACTION_TYPES.map((transactionType) => (
              <label key={transactionType}>
                <input
                  type="checkbox"
                  name="transactionType"
                  value={transactionType}
                  checked={transactionTypes.includes(transactionType)}
                  onChange={() => {
                    const next = toggleValue(transactionTypes, transactionType);
                    setTransactionTypes(next);
                    scheduleLiveUpdate({
                      ...currentDraft(),
                      transactionTypes: next,
                    });
                  }}
                />
                <span>{transactionTypeLabel[transactionType]}</span>
              </label>
            ))}
          </div>
          <small>None selected means either sale or rent.</small>
        </fieldset>

        <fieldset className="match-filter-field match-filter-span">
          <legend>Property type</legend>
          <div className="match-filter-options">
            {PROPERTY_TYPES.map((propertyType) => (
              <label key={propertyType}>
                <input
                  type="checkbox"
                  name="propertyType"
                  value={propertyType}
                  checked={propertyTypes.includes(propertyType)}
                  onChange={() => {
                    const next = toggleValue(propertyTypes, propertyType);
                    setPropertyTypes(next);
                    scheduleLiveUpdate({
                      ...currentDraft(),
                      propertyTypes: next,
                    });
                  }}
                />
                <span>{propertyTypeLabel[propertyType]}</span>
              </label>
            ))}
          </div>
          <small>Select alternatives together, such as Apartment + Villa.</small>
        </fieldset>

        <fieldset className="match-filter-field match-filter-span">
          <legend>BHK</legend>
          <div className="match-filter-options">
            {BHK_OPTIONS.map((bhk) => (
              <label key={bhk}>
                <input
                  type="checkbox"
                  name="bhk"
                  value={bhk}
                  checked={bhks.includes(bhk)}
                  onChange={() => {
                    const next = toggleValue(bhks, bhk);
                    setBhks(next);
                    scheduleLiveUpdate({ ...currentDraft(), bhks: next });
                  }}
                />
                <span>{bhk} BHK</span>
              </label>
            ))}
          </div>
          <label className="match-flex-check">
            <input
              type="checkbox"
              name="bhkFlex"
              value="1"
              checked={bhkFlex}
              onChange={(event) => {
                setBhkFlex(event.target.checked);
                scheduleLiveUpdate({
                  ...currentDraft(),
                  bhkFlex: event.target.checked,
                });
              }}
            />
            Also include adjacent configurations (±1 BHK)
          </label>
        </fieldset>

        <fieldset className="match-filter-field match-filter-span">
          <legend>Budget (₹)</legend>
          <div className="match-filter-range">
            <input
              type="number"
              min={0}
              step={1}
              name="budgetMin"
              value={budgetMin}
              onChange={(event) => {
                setBudgetMin(event.target.value);
                scheduleLiveUpdate(
                  { ...currentDraft(), budgetMin: event.target.value },
                  450,
                );
              }}
              placeholder="Minimum"
            />
            <span>to</span>
            <input
              type="number"
              min={0}
              step={1}
              name="budgetMax"
              value={budgetMax}
              onChange={(event) => {
                setBudgetMax(event.target.value);
                scheduleLiveUpdate(
                  { ...currentDraft(), budgetMax: event.target.value },
                  450,
                );
              }}
              placeholder="Maximum"
            />
          </div>
          <label className="match-flex-check">
            <input
              type="checkbox"
              name="budgetFlex"
              value="1"
              checked={budgetFlex}
              onChange={(event) => {
                setBudgetFlex(event.target.checked);
                scheduleLiveUpdate({
                  ...currentDraft(),
                  budgetFlex: event.target.checked,
                });
              }}
            />
            Include properties up to 10% outside this budget
          </label>
          <small>Rent uses monthly rent; sale uses total sale price.</small>
        </fieldset>

        <fieldset className="match-filter-field match-filter-span">
          <legend>Location anchors</legend>
          <input
            type="search"
            className="match-locality-search"
            value={localityQuery}
            onChange={(event) => setLocalityQuery(event.target.value)}
            placeholder={`Search ${cityLabel[city]} areas`}
          />
          <div className="match-locality-list">
            {cityLocalities.map((locality) => {
              const visible =
                !normalizedQuery ||
                locality.name.toLowerCase().includes(normalizedQuery) ||
                localityIds.includes(locality.id);
              return (
                <label key={locality.id} style={{ display: visible ? undefined : "none" }}>
                  <input
                    type="checkbox"
                    name="localityId"
                    value={locality.id}
                    checked={localityIds.includes(locality.id)}
                    onChange={() => {
                      const next = toggleValue(localityIds, locality.id);
                      setLocalityIds(next);
                      scheduleLiveUpdate({
                        ...currentDraft(),
                        localityIds: next,
                      });
                    }}
                  />
                  <span>{locality.name}</span>
                </label>
              );
            })}
          </div>
          <small>
            {localityIds.length
              ? `${localityIds.length} selected · results group into exact locality, 3 km and 5 km.`
              : "Select an area to calculate exact, 3 km and 5 km matches."}
          </small>
        </fieldset>
      </div>

      <details className="match-extra-filters" open={extraFiltersActive}>
        <summary>Additional property filters</summary>
        <div className="match-filter-grid">
          <fieldset className="match-filter-field match-filter-span">
            <legend>Building classification</legend>
            <div className="match-filter-options">
              {BUILDING_CLASSIFICATIONS.map((classification) => (
                <label key={classification}>
                  <input
                    type="checkbox"
                    name="buildingClassification"
                    value={classification}
                    checked={buildingClassifications.includes(classification)}
                    onChange={() => {
                      const next = toggleValue(
                        buildingClassifications,
                        classification,
                      );
                      setBuildingClassifications(next);
                      scheduleLiveUpdate({
                        ...currentDraft(),
                        buildingClassifications: next,
                      });
                    }}
                  />
                  <span>{buildingClassificationLabel[classification]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="match-filter-field match-filter-span">
            <legend>Furnishing</legend>
            <div className="match-filter-options">
              {FURNISHINGS.map((furnishing) => (
                <label key={furnishing}>
                  <input
                    type="checkbox"
                    name="furnishing"
                    value={furnishing}
                    checked={furnishings.includes(furnishing)}
                    onChange={() => {
                      const next = toggleValue(furnishings, furnishing);
                      setFurnishings(next);
                      scheduleLiveUpdate({
                        ...currentDraft(),
                        furnishings: next,
                      });
                    }}
                  />
                  <span>{furnishingLabel[furnishing]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="match-filter-field">
            <legend>Minimum built-up area</legend>
            <input
              type="number"
              min={0}
              step={1}
              name="builtUpAreaMin"
              value={builtUpAreaMin}
              onChange={(event) => {
                setBuiltUpAreaMin(event.target.value);
                scheduleLiveUpdate(
                  { ...currentDraft(), builtUpAreaMin: event.target.value },
                  450,
                );
              }}
              placeholder="Sq ft"
            />
          </fieldset>

          <fieldset className="match-filter-field">
            <legend>Minimum parking</legend>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              name="parkingMin"
              value={parkingMin}
              onChange={(event) => {
                setParkingMin(event.target.value);
                scheduleLiveUpdate(
                  { ...currentDraft(), parkingMin: event.target.value },
                  450,
                );
              }}
              placeholder="Spaces"
            />
          </fieldset>
        </div>
      </details>

      {drawer ? (
        <div className="match-filter-live-footer">
          <div className="match-filter-live-status" aria-live="polite">
            {loadingResults ? (
              <>
                <span className="match-loading-spinner" aria-hidden="true" />
                Updating matching properties…
              </>
            ) : (
              "Results update automatically"
            )}
          </div>
          <a href={actionPath} className="btn">
            Reset to buyer requirement
          </a>
        </div>
      ) : (
        <div className="match-filter-actions">
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
          <a href={actionPath} className="btn">
            Reset to buyer requirement
          </a>
        </div>
      )}
    </form>
  );

  if (!drawer) return filterForm;

  return (
    <>
      <section
        className="match-filter-toolbar"
        aria-label="Working filter summary"
        aria-busy={loadingResults}
      >
        <div className="match-filter-toolbar-icon" aria-hidden="true">
          {loadingResults ? (
            <span className="match-loading-spinner match-loading-spinner-dark" />
          ) : (
            <SlidersHorizontal className="h-4 w-4" />
          )}
        </div>
        <div className="match-filter-toolbar-content">
          <div className="match-filter-toolbar-title">
            Working filters
            <span>
              {loadingResults
                ? "Updating results"
                : filters.isCustom
                  ? "Custom"
                  : "From buyer requirement"}
            </span>
          </div>
          <div className="match-filter-summary">
            {summaryItems.map((item) => (
              <span key={item.label}>
                <b>{item.label}</b> {item.value}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn match-filter-edit"
          aria-controls="lead-match-filter-panel"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          Edit filters
        </button>
      </section>

      {loadingResults && (
        <div className="match-results-loading" role="status" aria-live="polite">
          <span className="match-loading-spinner" aria-hidden="true" />
          Updating matching properties…
        </div>
      )}

      {drawerOpen && (
        <aside
          id="lead-match-filter-panel"
          className="match-filter-drawer"
          aria-label="Edit property matching filters"
          onKeyDown={(event) => {
            if (event.key === "Escape") setDrawerOpen(false);
          }}
        >
          {filterForm}
        </aside>
      )}
    </>
  );
}

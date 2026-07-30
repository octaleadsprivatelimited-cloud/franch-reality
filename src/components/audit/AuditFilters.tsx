"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export function AuditFilters({ entityTypes }: { entityTypes: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // reset pagination on filter change
    router.push(`/audit?${next.toString()}`);
  }

  const hasFilters = Array.from(params.keys()).some((k) => k !== "page");

  return (
    <div
      className="card card-pad"
      style={{ marginBottom: 16, padding: 14 }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <select
          value={get("entityType")}
          onChange={(e) => setParam("entityType", e.target.value)}
          className="search-input"
          style={{ flex: "0 0 auto", width: 190 }}
        >
          <option value="">All entity types</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 16,
              height: 16,
              color: "var(--ink-fade)",
              pointerEvents: "none",
            }}
          />
          <input
            defaultValue={get("action")}
            onChange={(e) => setParam("action", e.target.value)}
            placeholder="Search action…"
            className="search-input"
            style={{ width: "100%", paddingLeft: 34 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="date"
            value={get("from")}
            onChange={(e) => setParam("from", e.target.value)}
            aria-label="From date"
            className="search-input"
            style={{ width: 150 }}
          />
          <span style={{ color: "var(--ink-fade)" }}>–</span>
          <input
            type="date"
            value={get("to")}
            onChange={(e) => setParam("to", e.target.value)}
            aria-label="To date"
            className="search-input"
            style={{ width: 150 }}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => router.push("/audit")}
            className="btn btn-sm"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

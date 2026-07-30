"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LEAD_SORTS, DEFAULT_LEAD_SORT } from "@/lib/lead-filters";

/** Sort-order dropdown for the leads list. Writes `sort` to the URL (omitted when it's
 *  the default, to keep URLs clean) and resets pagination. */
export function LeadSort() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? DEFAULT_LEAD_SORT;

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === DEFAULT_LEAD_SORT) next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    router.push(`/leads?${next.toString()}`);
  }

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--ink-soft)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 600 }}>Sort</span>
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        style={{
          borderRadius: 6,
          border: "1px solid var(--rule)",
          background: "white",
          padding: "8px 10px",
          fontSize: 13,
          color: "var(--ink)",
        }}
      >
        {LEAD_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { INVENTORY_SORTS, DEFAULT_INVENTORY_SORT } from "@/lib/inventory-sort";

/** Sort-order dropdown for the inventory list. Writes the `sort` param to the URL
 *  (omits it when it's the default, to keep URLs clean) and resets pagination. */
export function InventorySort() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? DEFAULT_INVENTORY_SORT;

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === DEFAULT_INVENTORY_SORT) next.delete("sort");
    else next.set("sort", value);
    next.delete("page"); // a new sort order should start from page 1
    router.push(`/inventory?${next.toString()}`);
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
        {INVENTORY_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

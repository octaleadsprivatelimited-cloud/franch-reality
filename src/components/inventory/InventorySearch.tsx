"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cityLabel, formatPrice } from "@/lib/domain";
import type { PropertySuggestion } from "@/lib/queries/inventory";

/**
 * Search bar above the property grid. Updates the URL `search` param on Enter and
 * shows a live typeahead dropdown of matching properties (title-aware) fetched from
 * /api/inventory/suggest. Picking a suggestion jumps straight to that property.
 */
export function InventorySearch({ initialSearch = "" }: { initialSearch?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialSearch);
  const [suggestionResult, setSuggestionResult] = useState<{
    query: string;
    items: PropertySuggestion[];
  }>({ query: "", items: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // index into the current suggestions; -1 = "search all"
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const dismissedRef = useRef(false); // user explicitly closed the dropdown → don't auto-reopen

  const query = value.trim();
  const suggestions =
    suggestionResult.query === query ? suggestionResult.items : [];

  // Track mount state and abort any in-flight request on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Debounced suggestion fetch (min 2 chars). Aborts the previous/in-flight request
  // on each keystroke and on unmount (via cleanup), and never sets state or reopens
  // after the component is gone or the user has dismissed the dropdown.
  useEffect(() => {
    const q = query;
    if (q.length < 2) {
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/inventory/suggest?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        if (!res.ok || !mountedRef.current || ac.signal.aborted) return;
        const data: { suggestions: PropertySuggestion[] } = await res.json();
        if (!mountedRef.current || ac.signal.aborted) return;
        setSuggestionResult({ query: q, items: data.suggestions ?? [] });
        setActive(-1);
        if (!dismissedRef.current) setOpen(true);
      } catch {
        /* aborted or network error — ignore */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [query]);

  // Close the dropdown on any outside click (and keep it closed until the user acts).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        dismissedRef.current = true;
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function runSearch(term: string) {
    const next = new URLSearchParams(params.toString());
    if (term.trim()) next.set("search", term.trim());
    else next.delete("search");
    next.delete("page");
    setOpen(false);
    router.push(`/inventory?${next.toString()}`);
  }

  function goTo(id: string) {
    setOpen(false);
    router.push(`/inventory/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && open && suggestions.length) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && open && suggestions.length) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && active < suggestions.length) goTo(suggestions[active].id);
      else runSearch(value);
    } else if (e.key === "Escape") {
      dismissedRef.current = true;
      setOpen(false);
    }
  }

  const showDropdown = open && value.trim().length >= 2;

  return (
    <div className="search-bar" style={{ marginBottom: 0, position: "relative" }} ref={boxRef}>
      <input
        className="search-input"
        value={value}
        placeholder="Search by title, file number, locality, builder, type…"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="inventory-search-suggestions"
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          dismissedRef.current = false;
          setValue(e.target.value);
        }}
        onFocus={() => {
          dismissedRef.current = false;
          if (suggestions.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      {showDropdown && (
        <div
          id="inventory-search-suggestions"
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "white",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            overflow: "hidden",
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {/* Run the full text search over all matches */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              runSearch(value);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              borderBottom: suggestions.length ? "1px solid var(--rule)" : "none",
              fontSize: 13,
              color: "var(--ink)",
            }}
          >
            <Search className="h-4 w-4" style={{ color: "var(--ink-fade)" }} />
            Search all matches for <strong>“{value.trim()}”</strong>
          </button>

          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                goTo(s.id);
              }}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                background: i === active ? "var(--brand-tint)" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.title}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-fade)" }}>
                  {s.fileNo} · {cityLabel[s.city]}
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                {formatPrice(s.priceInr, s.transactionType)}
              </span>
            </button>
          ))}

          {suggestions.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--ink-fade)" }}>
              No matching properties — press Enter to search anyway.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

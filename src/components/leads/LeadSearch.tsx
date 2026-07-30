"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Search bar above the leads table. Commits on Enter/blur (the old version pushed a
 *  new route on every keystroke, which made typing feel laggy). */
export function LeadSearch() {
  const router = useRouter();
  const params = useSearchParams();

  function commit(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("search", value.trim());
    else next.delete("search");
    next.delete("page");
    router.push(`/leads?${next.toString()}`);
  }

  const current = params.get("search") ?? "";

  return (
    <div className="search-bar" style={{ marginBottom: 0 }}>
      <input
        // Remount when the URL search term changes, so "Clear all filters" (a soft nav
        // that doesn't unmount this component) really empties the uncontrolled input
        // instead of leaving stale text that re-applies on the next blur.
        key={current}
        className="search-input"
        defaultValue={current}
        placeholder="Search leads by name, mobile, email, source, owner…"
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
        onBlur={(e) => commit(e.target.value)}
      />
    </div>
  );
}

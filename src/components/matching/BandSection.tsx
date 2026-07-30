"use client";

import { useEffect, useRef, useState } from "react";

// Band-grouped, collapsible result section. The band header shows
// the match count; agent can collapse/expand). Rendered with the ported mockup
// .band / .band-header / .band-dot / .count / .band-body terracotta classes; the
// band index drives the .b1/.b2/.b3 modifier (band 0 = the base terracotta band).
const bandModifier: Record<number, string> = { 1: "b1", 2: "b2", 3: "b3" };

export function BandSection({
  band,
  label,
  count,
  defaultOpen,
  emptyHint,
  children,
}: {
  band: number;
  label: string;
  count: number;
  defaultOpen?: boolean;
  emptyHint?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0);
  // Keep the section in sync with the radius slider: reveal a band that just gained
  // matches, collapse one that just emptied. Manual toggles are preserved while the
  // count stays > 0 (we only react to the 0↔non-zero transitions).
  const prevCount = useRef(count);
  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = count;
    if (prev === 0 && count > 0) setOpen(true);
    else if (prev > 0 && count === 0) setOpen(false);
  }, [count]);
  const modifier = bandModifier[band] ?? "";

  return (
    <section className={`band${modifier ? ` ${modifier}` : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="band-header"
      >
        <span className="name">
          <span className="band-dot" />
          <span>Band {band} · {label}</span>
        </span>
        <span className="count">{count}</span>
      </button>
      {open &&
        (count > 0 ? (
          <div className="band-body">{children}</div>
        ) : (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--ink-fade)",
            }}
          >
            {emptyHint ?? "No matches in this band."}
          </div>
        ))}
    </section>
  );
}

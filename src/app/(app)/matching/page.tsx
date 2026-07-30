import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { listLeads } from "@/lib/queries/leads";
import { listProperties } from "@/lib/queries/inventory";
import { inventoryFilterSchema } from "@/lib/validation/property";
import { leadFilterSchema } from "@/lib/validation/lead";
import {
  formatBudgetRange,
  formatPrice,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
} from "@/lib/domain";
import { LeadStageBadge } from "@/components/leads/LeadStageBadge";

type Mode = "lead" | "property";

export default async function MatchingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mode: Mode = sp.mode === "property" ? "property" : "lead";
  // Sanitise before the schemas' throwing .parse() below: `search` is capped at 120 chars
  // and `page` must be a positive integer, so an over-long paste or a "?page=1.5" would
  // otherwise raise an uncaught ZodError — a 500 on this page (there is no error boundary).
  const q = (typeof sp.q === "string" ? sp.q : "").slice(0, 120);
  const page = Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1);

  const leadData =
    mode === "lead"
      ? await listLeads(
          user,
          leadFilterSchema.parse({ activity: "active", search: q || undefined, page }),
        )
      : null;
  const propData =
    mode === "property"
      ? await listProperties(
          user,
          inventoryFilterSchema.parse({ availabilityStatus: ["AVAILABLE"], search: q, page: String(page) }),
        )
      : null;

  const active = mode === "lead" ? leadData! : propData!;

  function hrefWith(params: Record<string, string>) {
    const next = new URLSearchParams();
    next.set("mode", mode);
    if (q) next.set("q", q);
    for (const [k, v] of Object.entries(params)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/matching?${next.toString()}`;
  }

  function tabHref(m: Mode) {
    return `/matching?mode=${m}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-fade)",
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Smart Matching · {mode === "lead" ? "Lead-first view" : "Property-first view"}
          </div>
          <h1 style={{ marginTop: 6 }}>Matching</h1>
          <div className="subtitle">
            Radius-expanding matching, both directions. Pick a {mode === "lead" ? "lead" : "property"}{" "}
            to find {mode === "lead" ? "properties" : "leads"}.
          </div>
        </div>
        <div className="page-actions">
          <Link href={tabHref("lead")} className={mode === "lead" ? "btn btn-primary" : "btn"}>
            Lead → properties
          </Link>
          <Link
            href={tabHref("property")}
            className={mode === "property" ? "btn btn-primary" : "btn"}
          >
            Property → leads
          </Link>
        </div>
      </div>

      {/* Search */}
      <form method="GET" action="/matching" className="search-bar" style={{ flexWrap: "wrap" }}>
        <input type="hidden" name="mode" value={mode} />
        <input
          name="q"
          defaultValue={q}
          placeholder={
            mode === "lead"
              ? "Search leads by name, mobile, email…"
              : "Search properties by file no, locality…"
          }
          className="search-input"
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
        {active.total} {mode === "lead" ? "active lead" : "available propert"}
        {mode === "lead" ? (active.total === 1 ? "" : "s") : active.total === 1 ? "y" : "ies"}
      </p>

      {/* List */}
      {mode === "lead" ? (
        leadData!.items.length === 0 ? (
          <div
            className="card card-pad"
            style={{ textAlign: "center", color: "var(--ink-fade)", padding: 40 }}
          >
            No active leads found.
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            {leadData!.items.map((l) => {
              const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead";
              return (
                <Link key={l.id} href={`/matching/lead/${l.id}`} className="pick-row">
                  <div className="pick-main">
                    <div className="pick-title">
                      <span>{name}</span>
                      <LeadStageBadge stage={l.currentStage} />
                      <span className="source-tag">{cityLabel[l.city]}</span>
                    </div>
                    <div className="pick-meta">
                      <span style={{ fontWeight: 600, color: "var(--brand-dark)" }}>
                        {formatBudgetRange(
                          l.budgetMin != null ? Number(l.budgetMin) : null,
                          l.budgetMax != null ? Number(l.budgetMax) : null,
                          l.transactionTypePref,
                        )}
                      </span>
                      {l.bhkPref.length > 0 && <span>{l.bhkPref.join(", ")} BHK</span>}
                      {l.propertyTypePref.length > 0 && (
                        <span>{l.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="pick-chevron h-5 w-5" />
                </Link>
              );
            })}
          </div>
        )
      ) : propData!.items.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--ink-fade)", padding: 40 }}
        >
          No available properties found.
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {propData!.items.map((p) => (
            <Link key={p.id} href={`/matching/property/${p.id}`} className="pick-row">
              <div className="pick-main">
                <div className="pick-title">
                  <span className="source-tag">{p.fileNo}</span>
                  <span>
                    {propertyTypeLabel[p.propertyType]}
                    {p.bhk ? ` · ${p.bhk} BHK` : ""}
                  </span>
                  <span className="source-tag">{transactionTypeLabel[p.transactionType]}</span>
                </div>
                <div className="pick-meta">
                  <span>
                    {p.locality.name}, {cityLabel[p.city]}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--brand-dark)" }}>
                    {formatPrice(Number(p.priceInr), p.transactionType)}
                  </span>
                </div>
              </div>
              <ChevronRight className="pick-chevron h-5 w-5" />
            </Link>
          ))}
        </div>
      )}

      {active.pageCount > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          {page > 1 ? (
            <Link href={hrefWith({ page: String(page - 1) })} className="btn btn-sm">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Page {page} of {active.pageCount}
          </span>
          {page < active.pageCount ? (
            <Link href={hrefWith({ page: String(page + 1) })} className="btn btn-sm">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

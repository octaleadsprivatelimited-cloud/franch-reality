import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, User } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import { getMatchesForLead } from "@/lib/matching-service";
import {
  CITIES,
  formatBudgetRange,
  propertyTypeLabel,
  transactionTypeLabel,
  cityLabel,
} from "@/lib/domain";
import { parseLeadMatchFilters } from "@/lib/match-filters";
import { PropertyMatchCard } from "@/components/matching/PropertyMatchCard";
import { MatchWorkspace, type MatchSubject } from "@/components/matching/MatchWorkspace";
import { LeadMatchFilters } from "@/components/matching/LeadMatchFilters";

export default async function LeadMatchingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const [matches, localities] = await Promise.all([
    getMatchesForLead(user, id, parseLeadMatchFilters(sp)),
    getLocalitiesForUser(user),
  ]);
  if (!matches) notFound();

  const lead = matches.lead;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
  const initials =
    [lead.firstName, lead.lastName]
      .filter(Boolean)
      .map((s) => s![0]!.toUpperCase())
      .join("")
      .slice(0, 2) || "?";

  const subject: MatchSubject = {
    avatar: initials,
    title: name,
    metaLine: [lead.teleduceLeadId, lead.mobile].filter(Boolean).join(" · ") || cityLabel[lead.city],
    criteria: [
      {
        key: "Budget",
        val: formatBudgetRange(
          lead.budgetMin != null ? Number(lead.budgetMin) : null,
          lead.budgetMax != null ? Number(lead.budgetMax) : null,
          lead.transactionTypePref,
        ),
      },
      { key: "BHK", val: lead.bhkPref.length ? `${lead.bhkPref.join(", ")} BHK` : "Any" },
      {
        key: "Type",
        val: lead.propertyTypePref.length
          ? lead.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", ")
          : "Any",
      },
      {
        key: "Transaction",
        val: lead.transactionTypePref ? transactionTypeLabel[lead.transactionTypePref] : "Any",
      },
      { key: "City", val: cityLabel[lead.city] },
      {
        key: "Preferred",
        val: lead.preferredLocalities.length
          ? lead.preferredLocalities.map((l) => l.name).join(", ")
          : "Whole city",
      },
    ],
  };

  const anchor = matches.anchorLocalities[0]
    ? {
        lat: matches.anchorLocalities[0].latitude,
        lng: matches.anchorLocalities[0].longitude,
        label: matches.anchorLocalities[0].name,
      }
    : null;

  const items = matches.bands.flatMap((b) =>
    b.rows.map((row) => ({
      key: row.property.id,
      band: b.band,
      distanceKm: row.distanceKm,
      lat: row.property.locality.latitude,
      lng: row.property.locality.longitude,
      pinLabel: row.property.fileNo,
      card: <PropertyMatchCard leadId={lead.id} row={row} />,
    })),
  );

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
            Smart Matching · Lead-first view
          </div>
          <h1 style={{ marginTop: 6 }}>
            Find properties for <span style={{ color: "var(--brand-dark)" }}>{name}</span>
          </h1>
          <div className="subtitle">
            {matches.total} {matches.total === 1 ? "property matches" : "properties match"} the
            working filters · grouped by exact locality, 3 km and 5 km
          </div>
        </div>
        <div className="page-actions">
          <Link href={`/leads/${lead.id}`} className="btn">
            <User className="h-4 w-4" /> Lead profile
          </Link>
          <Link href="/matching?mode=property" className="btn">
            <ArrowLeftRight className="h-4 w-4" /> Property-first
          </Link>
        </div>
      </div>

      <MatchWorkspace
        subject={subject}
        bands={matches.bands.map((b) => ({ band: b.band, label: b.label }))}
        items={items}
        anchor={anchor}
        total={matches.total}
        noun="properties"
        filterPanel={
          <LeadMatchFilters
            key={JSON.stringify(matches.filters)}
            actionPath={`/matching/lead/${lead.id}`}
            filters={matches.filters}
            localities={localities}
            availableCities={user.role === "ADMIN" ? CITIES : user.cities}
            compact
          />
        }
      />
    </div>
  );
}

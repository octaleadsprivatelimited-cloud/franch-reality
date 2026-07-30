import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { getMatchesForProperty } from "@/lib/matching-service";
import {
  formatPrice,
  propertyTitle,
  propertyTypeLabel,
  transactionTypeLabel,
  usageLabel,
  cityLabel,
} from "@/lib/domain";
import { LeadMatchCard } from "@/components/matching/LeadMatchCard";
import { MatchWorkspace, type MatchSubject } from "@/components/matching/MatchWorkspace";

export default async function PropertyMatchingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const matches = await getMatchesForProperty(user, id);
  if (!matches) notFound();

  const p = matches.property;
  const title = propertyTitle({ bhk: p.bhk, propertyType: p.propertyType, localityName: p.locality.name });

  const subject: MatchSubject = {
    avatar: p.fileNo.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "PR",
    title,
    metaLine: `${p.fileNo} · ${p.locality.name}`,
    criteria: [
      { key: "Price", val: formatPrice(Number(p.priceInr), p.transactionType) },
      {
        key: "Type",
        val: `${propertyTypeLabel[p.propertyType]} (${usageLabel[p.commercialOrResidential]})`,
      },
      { key: "BHK", val: p.bhk ? `${p.bhk} BHK` : "—" },
      { key: "Transaction", val: transactionTypeLabel[p.transactionType] },
      { key: "City", val: cityLabel[p.city] },
      { key: "Locality", val: p.locality.name },
    ],
  };

  const anchor = {
    lat: p.locality.latitude,
    lng: p.locality.longitude,
    label: p.locality.name,
  };

  const items = matches.bands.flatMap((b) =>
    b.rows.map((row) => ({
      key: row.lead.id,
      band: b.band,
      distanceKm: row.distanceKm,
      lat: row.lead.preferredLocalities[0]?.latitude ?? null,
      lng: row.lead.preferredLocalities[0]?.longitude ?? null,
      pinLabel: [row.lead.firstName, row.lead.lastName].filter(Boolean).join(" ") || "Lead",
      card: <LeadMatchCard propertyId={p.id} row={row} />,
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
            Smart Matching · Property-first view
          </div>
          <h1 style={{ marginTop: 6 }}>
            Find leads for <span style={{ color: "var(--brand-dark)" }}>{p.fileNo}</span>
          </h1>
          <div className="subtitle">
            {matches.total} {matches.total === 1 ? "lead matches" : "leads match"} all hard filters · grouped
            by distance from the property
          </div>
        </div>
        <div className="page-actions">
          <Link href={`/inventory/${p.id}`} className="btn">
            <Building2 className="h-4 w-4" /> Property
          </Link>
          <Link href="/matching?mode=lead" className="btn">
            <ArrowLeftRight className="h-4 w-4" /> Lead-first
          </Link>
        </div>
      </div>

      <MatchWorkspace
        subject={subject}
        bands={matches.bands.map((b) => ({ band: b.band, label: b.label }))}
        items={items}
        anchor={anchor}
        total={matches.total}
        noun="leads"
      />
    </div>
  );
}

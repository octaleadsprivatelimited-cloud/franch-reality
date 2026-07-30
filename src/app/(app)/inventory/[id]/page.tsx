import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, GitCompareArrows } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { getPropertyById } from "@/lib/queries/inventory";
import { getMatchesForProperty } from "@/lib/matching-service";
import {
  formatPrice,
  formatInr,
  propertyTitle,
  propertyTypeLabel,
  buildingClassificationLabel,
  transactionTypeLabel,
  usageLabel,
  furnishingLabel,
  availabilityLabel,
  cityLabel,
  attachmentUrl,
  statusBadgeClass,
  txBadgeClass,
} from "@/lib/domain";
import { StatusBadge } from "@/components/inventory/StatusBadge";
import { AttachmentManager } from "@/components/inventory/AttachmentManager";
import { PropertyGallery } from "@/components/inventory/PropertyGallery";
import { PortfolioDownloadButton } from "@/components/inventory/PortfolioDownloadButton";
import { LeadMatchCard } from "@/components/matching/LeadMatchCard";
import { MatchExplorer } from "@/components/matching/MatchExplorer";
import { MatchStatusBadge, WritebackBadge } from "@/components/matching/MatchBadges";
import { deletePropertyAction } from "../actions";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mediaFailed = Number(typeof sp.mediaFailed === "string" ? sp.mediaFailed : 0) || 0;
  const user = await requireUser();
  const [p, propertyMatches] = await Promise.all([
    getPropertyById(user, id),
    getMatchesForProperty(user, id),
  ]);
  if (!p) notFound();

  const images = p.attachments.filter((a) => a.mimeType.startsWith("image/"));
  const galleryImages = images.map((a) => ({
    id: a.id,
    url: attachmentUrl(a.id),
    alt: a.originalFilename,
  }));
  // Status + transaction badges overlaid on the main slide / placeholder hero.
  const heroBadges = (
    <>
      <span
        className={`status-badge ${statusBadgeClass(p.availabilityStatus)}`}
        style={{ position: "absolute", top: 12, left: 12 }}
      >
        {availabilityLabel[p.availabilityStatus]}
      </span>
      <span
        className={`tx-badge ${txBadgeClass(p.transactionType)}`}
        style={{ position: "absolute", top: 12, right: 12 }}
      >
        {transactionTypeLabel[p.transactionType]}
      </span>
    </>
  );

  const specs: [string, React.ReactNode][] = [
    ["File number", <span key="f" style={{ fontFamily: "var(--font-mono)" }}>{p.fileNo}</span>],
    ["Type", `${propertyTypeLabel[p.propertyType]} (${usageLabel[p.commercialOrResidential]})`],
    ["Building", p.buildingClassification ? buildingClassificationLabel[p.buildingClassification] : "—"],
    ["Transaction", transactionTypeLabel[p.transactionType]],
    ["BHK", p.bhk ?? "—"],
    ["Built-up area", p.builtUpAreaSqft ? `${p.builtUpAreaSqft.toLocaleString("en-IN")} sq.ft` : "—"],
    ["Secondary area", p.secondaryAreaSqft ? `${p.secondaryAreaSqft.toLocaleString("en-IN")} sq.ft` : "—"],
    ["Facing", p.facing ?? "—"],
    ["Floor", p.floor ?? "—"],
    ["Parking", p.parkingCount ?? "—"],
    ["Furnishing", p.furnishing ? furnishingLabel[p.furnishing] : "—"],
    ["Age", p.ageYears != null ? `${p.ageYears} yr` : "—"],
    ["Maintenance", p.maintenanceAmount ? `${formatInr(Number(p.maintenanceAmount))}/mo` : "—"],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            <Link href="/inventory">← Back to inventory</Link> · {p.fileNo}
          </div>
          <h1 style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {propertyTitle({ bhk: p.bhk, propertyType: p.propertyType, localityName: p.locality.name })}
            <StatusBadge status={p.availabilityStatus} />
          </h1>
          <div className="subtitle">{p.locality.name}, {cityLabel[p.city]}</div>
        </div>
        <div className="page-actions">
          <PortfolioDownloadButton propertyId={p.id} />
          <Link href={`/inventory/${p.id}/edit`} className="btn">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          {user.role === "ADMIN" && (
            <form action={deletePropertyAction.bind(null, p.id)}>
              <button className="btn-danger" type="submit">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </form>
          )}
        </div>
      </div>

      {mediaFailed > 0 && (
        <div
          className="alert-error"
          style={{ marginBottom: 16, background: "var(--warn-tint)", color: "var(--warn)", borderColor: "#ecd9a3" }}
        >
          {mediaFailed} file{mediaFailed === 1 ? "" : "s"} couldn&apos;t be attached (wrong type or too large).
          Add {mediaFailed === 1 ? "it" : "them"} from Attachments below.
        </div>
      )}

      {/* Photo gallery (all images, slideshow + lightbox). Falls back to a placeholder
          hero when the property has no photos yet. */}
      {galleryImages.length > 0 ? (
        <PropertyGallery images={galleryImages} overlay={heroBadges} />
      ) : (
        <div className="pd-hero">
          <div className="pd-img-big">{heroBadges}</div>
          <div className="pd-img-side">
            <div className="pd-img-small" />
            <div className="pd-img-small" />
          </div>
        </div>
      )}

      <div className="pd-main">
        {/* Left: price + specs + features */}
        <div>
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div className="match-price" style={{ fontSize: 28 }}>
              {formatPrice(Number(p.priceInr), p.transactionType)}
            </div>

            <div className="section-title" style={{ marginTop: 6 }}>Specifications</div>
            <div className="spec-grid">
              {specs.map(([label, value]) => (
                <div className="spec-row" key={label}>
                  <div className="label">{label}</div>
                  <div className="value">{value}</div>
                </div>
              ))}
            </div>

            {(p.additionalFeatures.length > 0 || p.featuresText || p.description) && (
              <div className="features-row">
                {p.additionalFeatures.map((f) => (
                  <span key={f} className="feature-chip">{f}</span>
                ))}
                {p.featuresText && (
                  <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-soft)" }}>{p.featuresText}</p>
                )}
                {p.description && (
                  <p style={{ marginTop: 8, fontSize: 13, color: "var(--ink-soft)" }}>{p.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Property → leads (radius-banded) */}
          {propertyMatches && (
            <div id="matches" style={{ scrollMarginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, margin: 0 }}>
                  <GitCompareArrows className="h-5 w-5" style={{ color: "var(--brand)" }} /> Matching leads
                </h2>
                <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{propertyMatches.total} total</span>
              </div>

              {propertyMatches.total === 0 && (
                <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-fade)" }}>
                  {p.availabilityStatus === "AVAILABLE"
                    ? "No active leads match this property (city, deal type, property type, BHK ±1, budget ±10%)."
                    : `Matching runs on available properties only — this one is ${availabilityLabel[p.availabilityStatus].toLowerCase()}.`}
                </div>
              )}

              {propertyMatches.total > 0 && (
                <MatchExplorer
                  noun="leads"
                  total={propertyMatches.total}
                  bands={propertyMatches.bands.map((b) => ({ band: b.band, label: b.label }))}
                  anchor={{
                    lat: propertyMatches.property.locality.latitude,
                    lng: propertyMatches.property.locality.longitude,
                    label: propertyMatches.property.locality.name,
                  }}
                  items={propertyMatches.bands.flatMap((b) =>
                    b.rows.map((row) => ({
                      key: row.lead.id,
                      band: b.band,
                      distanceKm: row.distanceKm,
                      lat: row.lead.preferredLocalities[0]?.latitude ?? null,
                      lng: row.lead.preferredLocalities[0]?.longitude ?? null,
                      pinLabel:
                        [row.lead.firstName, row.lead.lastName].filter(Boolean).join(" ") || "Lead",
                      card: <LeadMatchCard propertyId={p.id} row={row} />,
                    })),
                  )}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: attachments + decision history */}
        <div>
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <AttachmentManager
              propertyId={p.id}
              canManage
              attachments={p.attachments.map((a) => ({
                id: a.id,
                kind: a.kind,
                originalFilename: a.originalFilename,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
              }))}
            />
          </div>

          {p.matches.length > 0 && (
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 12 }}>
                Match decisions ({p.matches.length})
              </div>
              <ul>
                {p.matches.map((m) => {
                  const name = [m.lead.firstName, m.lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
                  return (
                    <li key={m.id} className="list-item">
                      <div className="text">
                        <Link href={`/leads/${m.lead.id}`} style={{ fontWeight: 600 }}>{name}</Link>
                        <div className="meta">{m.lead.currentStage}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <MatchStatusBadge status={m.status} />
                        {m.teleduceWritebackStatus !== "NOT_REQUIRED" && (
                          <WritebackBadge status={m.teleduceWritebackStatus} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type {
  AvailabilityStatus,
  BuildingClassification,
  Furnishing,
  PropertyType,
  TransactionType,
} from "@prisma/client";
import {
  availabilityLabel,
  buildingClassificationLabel,
  formatPrice,
  furnishingLabel,
  propertyTitle,
  statusBadgeClass,
  transactionTypeLabel,
  txBadgeClass,
} from "@/lib/domain";
import { PropertyCardMedia, type CardImage } from "./PropertyCardMedia";
import type { PreviewDoc } from "./DocPreview";

export interface PropertyCardData {
  id: string;
  fileNo: string;
  propertyType: PropertyType;
  transactionType: TransactionType;
  availabilityStatus: AvailabilityStatus;
  buildingClassification: BuildingClassification | null;
  bhk: number | null;
  builtUpAreaSqft: number | null;
  parkingCount: number | null;
  facing: string | null;
  ageYears: number | null;
  furnishing: Furnishing | null;
  priceInr: number;
  localityName: string;
  /** All photo attachments (rendered as a mini carousel). */
  images: CardImage[];
  /** PDF documents (brochures / floor plans) — previewable from the card. */
  docs: PreviewDoc[];
}

/** Property card — image header + status/transaction/file-no badges, per the mockup. */
export function PropertyCard({ p }: { p: PropertyCardData }) {
  const subtitleBits = [
    p.buildingClassification ? buildingClassificationLabel[p.buildingClassification] : null,
    p.builtUpAreaSqft ? `${p.builtUpAreaSqft.toLocaleString("en-IN")} sq ft` : null,
    p.facing ? `${p.facing} facing` : null,
    p.ageYears != null ? (p.ageYears === 0 ? "Brand new" : `${p.ageYears} yr old`) : null,
    p.furnishing ? furnishingLabel[p.furnishing] : null,
  ].filter(Boolean);

  const rent = p.transactionType === "RENT";
  const href = `/inventory/${p.id}`;
  const badges = (
    <>
      <span className={`status-badge ${statusBadgeClass(p.availabilityStatus)}`}>
        {availabilityLabel[p.availabilityStatus]}
      </span>
      <span className={`tx-badge ${txBadgeClass(p.transactionType)}`}>
        {transactionTypeLabel[p.transactionType]}
      </span>
      <span className="file-no">{p.fileNo}</span>
    </>
  );

  return (
    <div className="prop-card">
      <PropertyCardMedia href={href} images={p.images} docs={p.docs} badges={badges} />
      <Link href={href} className="prop-info" style={{ textDecoration: "none", color: "inherit" }}>
        <h3>{propertyTitle({ bhk: p.bhk, propertyType: p.propertyType, localityName: p.localityName })}</h3>
        <div className="locality">{[p.localityName, ...subtitleBits].join(" · ")}</div>
        <div className="prop-specs">
          {p.bhk != null && <span>🏠 {p.bhk} BHK</span>}
          {p.builtUpAreaSqft != null && <span>📐 {p.builtUpAreaSqft.toLocaleString("en-IN")} sqft</span>}
          {p.parkingCount != null && p.parkingCount > 0 && (
            <span>🚗 {p.parkingCount} parking</span>
          )}
        </div>
        <div className="prop-price">
          {rent ? (
            <>
              ₹{p.priceInr.toLocaleString("en-IN")} <span className="unit">/ month</span>
            </>
          ) : (
            formatPrice(p.priceInr, p.transactionType)
          )}
        </div>
      </Link>
    </div>
  );
}

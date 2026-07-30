import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Prisma, PropertyType } from "@prisma/client";
import {
  availabilityLabel,
  buildingClassificationLabel,
  cityLabel,
  furnishingLabel,
  propertyTitle,
  propertyTypeLabel,
  transactionTypeLabel,
  usageLabel,
} from "@/lib/domain";

const fontDirectory = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(fontDirectory, "Montserrat-Regular.ttf"), fontWeight: 400 },
    { src: path.join(fontDirectory, "Montserrat-Medium.ttf"), fontWeight: 500 },
    { src: path.join(fontDirectory, "Montserrat-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(fontDirectory, "Montserrat-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const ORANGE = "#F07E1A";
const BLACK = "#141414";
const MUTED = "#666666";
const FAINT = "#8A8A8A";
const RULE = "#E4E4E4";
const SOFT = "#F7F7F7";
const WHITE = "#FFFFFF";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Montserrat",
    fontSize: 9,
    color: BLACK,
    backgroundColor: WHITE,
    paddingTop: 34,
    paddingHorizontal: 38,
    paddingBottom: 52,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 3,
    borderBottomColor: ORANGE,
  },
  logo: { width: 178, height: 55, objectFit: "contain", objectPosition: "left center" },
  wordmark: { fontSize: 18, fontWeight: 600, letterSpacing: 0.6 },
  headerRight: { alignItems: "flex-end", maxWidth: 190 },
  documentType: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 },
  reference: { fontSize: 8, color: MUTED, marginTop: 5 },
  titleBlock: { marginTop: 26, flexDirection: "row", justifyContent: "space-between", gap: 20 },
  eyebrow: {
    color: ORANGE,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  title: { fontSize: 23, fontWeight: 700, lineHeight: 1.15 },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 7 },
  priceBox: {
    width: 160,
    backgroundColor: SOFT,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
  },
  priceLabel: {
    fontSize: 7.5,
    color: MUTED,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  price: { fontSize: 16, fontWeight: 700, marginTop: 6 },
  summaryRow: {
    flexDirection: "row",
    marginTop: 18,
    borderWidth: 1,
    borderColor: RULE,
  },
  summaryItem: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRightWidth: 1,
    borderRightColor: RULE,
  },
  summaryItemLast: { borderRightWidth: 0 },
  summaryLabel: {
    color: FAINT,
    fontSize: 6.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  summaryValue: { fontSize: 9.5, fontWeight: 700, marginTop: 4 },
  summaryValueOrange: { color: ORANGE },
  coverImageBox: {
    height: 310,
    marginTop: 20,
    padding: 5,
    borderWidth: 1,
    borderColor: RULE,
    backgroundColor: SOFT,
  },
  coverImage: { width: "100%", height: "100%", objectFit: "contain" },
  coverCaption: { color: FAINT, fontSize: 7, marginTop: 6, textAlign: "right" },
  columns: { flexDirection: "row", gap: 18, marginTop: 22, alignItems: "flex-start" },
  column: { flex: 1, gap: 14 },
  section: { borderWidth: 1, borderColor: RULE },
  sectionTitle: {
    backgroundColor: SOFT,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingVertical: 8,
    paddingHorizontal: 11,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.65,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: MUTED, fontSize: 8.2, flex: 1 },
  rowValue: { fontWeight: 600, fontSize: 8.2, flex: 1.15, textAlign: "right" },
  detailTitle: { fontSize: 16, fontWeight: 700, marginTop: 24 },
  bodyText: { color: MUTED, fontSize: 9.3, lineHeight: 1.55, marginTop: 9 },
  featureWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  feature: {
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: RULE,
    paddingVertical: 6,
    paddingHorizontal: 9,
    fontSize: 8.5,
  },
  gallery: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 18 },
  imageCell: { width: "48.5%", marginBottom: 14 },
  imageBox: {
    height: 154,
    borderWidth: 1,
    borderColor: RULE,
    backgroundColor: SOFT,
    padding: 4,
  },
  image: { width: "100%", height: "100%", objectFit: "contain" },
  imageLabel: { marginTop: 5, fontSize: 7.5, color: FAINT },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 20,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  footerText: { color: FAINT, fontSize: 6.8, lineHeight: 1.35, flex: 1 },
  pageNumber: { color: MUTED, fontSize: 7, textAlign: "right" },
});

export type PortfolioProperty = Prisma.PropertyGetPayload<{ include: { locality: true } }>;

export interface PortfolioImage {
  src: string;
  label: string;
}

export interface PortfolioDocument {
  label: string;
  filename: string;
}

export interface PortfolioInput {
  property: PortfolioProperty;
  images: PortfolioImage[];
  documents?: PortfolioDocument[];
  logo?: string;
  issuedToName: string;
  issuedToRole: "ADMIN" | "AGENT";
  now: Date;
}

export interface PortfolioField {
  label: string;
  value: string;
}

export interface PortfolioSection {
  title: string;
  fields: PortfolioField[];
}

export interface PortfolioSummaryItem {
  label: string;
  value: string;
  accent?: boolean;
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function trimNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function formatMoney(amount: number, transactionType: "SALE" | "RENT"): string {
  if (transactionType === "RENT") return `Rs. ${inr.format(Math.round(amount))} / month`;
  const lakh = Math.round((amount / 100_000) * 10) / 10;
  if (lakh >= 100) return `Rs. ${trimNumber(amount / 10_000_000, 2)} Cr`;
  return `Rs. ${trimNumber(lakh, 1)} L`;
}

function formatArea(value: number): string {
  return `${value.toLocaleString("en-IN")} sq.ft`;
}

function formatListingDate(value: Date): string {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function add(fields: PortfolioField[], label: string, value: string | null | undefined) {
  const clean = value?.trim();
  if (clean) fields.push({ label, value: clean });
}

function typeDetails(property: PortfolioProperty): PortfolioSection {
  const fields: PortfolioField[] = [];
  const type = property.propertyType;

  if ((type === "APARTMENT" || type === "VILLA") && property.bhk) {
    add(fields, "Configuration", `${property.bhk} BHK`);
  }
  if (property.builtUpAreaSqft) {
    add(fields, type === "PLOT" ? "Plot area" : "Built-up area", formatArea(property.builtUpAreaSqft));
  }
  if (property.secondaryAreaSqft) {
    const secondaryLabel =
      type === "APARTMENT" || type === "COMMERCIAL"
        ? "Carpet / secondary area"
        : "Secondary area";
    add(fields, secondaryLabel, formatArea(property.secondaryAreaSqft));
  }
  if (type !== "PLOT") {
    add(fields, "Floor", property.floor);
  }
  add(fields, "Facing", property.facing);
  if (type !== "PLOT") {
    add(fields, "Furnishing", property.furnishing ? furnishingLabel[property.furnishing] : null);
    if (property.parkingCount != null) {
      add(fields, "Parking", `${property.parkingCount} space${property.parkingCount === 1 ? "" : "s"}`);
    }
    if (property.ageYears != null) {
      add(
        fields,
        "Property age",
        property.ageYears === 0 ? "New construction" : `${property.ageYears} year${property.ageYears === 1 ? "" : "s"}`,
      );
    }
  }

  return { title: `${propertyTypeLabel[type]} details`, fields };
}

/** Stored fields shown in the portfolio, grouped by relevance to the property type. */
export function buildPortfolioSections(property: PortfolioProperty): PortfolioSection[] {
  const listing: PortfolioField[] = [];
  add(listing, "Reference", property.fileNo);
  add(listing, "Locality", property.locality.name);
  add(listing, "City", cityLabel[property.city]);
  add(listing, "Property type", propertyTypeLabel[property.propertyType]);
  add(listing, "Transaction", transactionTypeLabel[property.transactionType]);
  add(listing, "Availability", availabilityLabel[property.availabilityStatus]);
  add(listing, "Use", usageLabel[property.commercialOrResidential]);
  add(
    listing,
    "Building type",
    property.buildingClassification
      ? buildingClassificationLabel[property.buildingClassification]
      : null,
  );
  add(listing, "Builder / developer", property.builderDeveloperName);
  add(listing, "RERA ID (as provided)", property.reraId);
  add(listing, "Listing updated", formatListingDate(property.updatedAt));

  const financial: PortfolioField[] = [];
  add(
    financial,
    property.transactionType === "RENT" ? "Monthly rent" : "Listed sale price",
    formatMoney(Number(property.priceInr), property.transactionType),
  );
  if (property.pricePerSqft != null) {
    add(financial, "Price per sq.ft", `Rs. ${inr.format(Math.round(Number(property.pricePerSqft)))}`);
  }
  if (property.maintenanceAmount != null) {
    add(
      financial,
      "Monthly maintenance",
      `Rs. ${inr.format(Math.round(Number(property.maintenanceAmount)))}`,
    );
  }

  return [
    { title: "Listing", fields: listing },
    typeDetails(property),
    { title: "Financials", fields: financial },
  ].filter((section) => section.fields.length > 0);
}

export function portfolioDocumentLabel(type: PropertyType, transaction: "SALE" | "RENT"): string {
  return `${propertyTypeLabel[type]} ${transaction === "SALE" ? "sale" : "rental"} portfolio`;
}

export function buildPortfolioSummary(property: PortfolioProperty): PortfolioSummaryItem[] {
  return [
    {
      label: "Availability status",
      value: availabilityLabel[property.availabilityStatus],
      accent: true,
    },
    {
      label: "Transaction",
      value: property.transactionType === "SALE" ? "For sale" : "For rent",
    },
    {
      label: "Property type",
      value: propertyTypeLabel[property.propertyType],
    },
  ];
}

function Header({
  logo,
  label,
  fileNo,
}: {
  logo?: string;
  label: string;
  fileNo: string;
}) {
  return (
    <View style={styles.header} wrap={false}>
      {logo ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={logo} style={styles.logo} />
      ) : (
        <Text style={styles.wordmark}>FRANCH REALTY</Text>
      )}
      <View style={styles.headerRight}>
        <Text style={styles.documentType}>{label}</Text>
        <Text style={styles.reference}>Reference {fileNo}</Text>
      </View>
    </View>
  );
}

function Footer({
  generated,
  issuedTo,
}: {
  generated: string;
  issuedTo: string;
}) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Property information is based on the current listing record. Buyers and tenants should
        independently verify legal, financial and technical details before a transaction.
      </Text>
      <View>
        <Text style={styles.pageNumber}>{generated} | Prepared for {issuedTo}</Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </View>
  );
}

function SectionCard({ section }: { section: PortfolioSection }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.fields.map((field, index) => (
        <View
          key={`${field.label}-${field.value}`}
          style={[styles.row, index === section.fields.length - 1 ? styles.rowLast : {}]}
        >
          <Text style={styles.rowLabel}>{field.label}</Text>
          <Text style={styles.rowValue}>{field.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SummaryStrip({ property }: { property: PortfolioProperty }) {
  const items = buildPortfolioSummary(property);

  return (
    <View style={styles.summaryRow} wrap={false}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={[
            styles.summaryItem,
            index === items.length - 1 ? styles.summaryItemLast : {},
          ]}
        >
          <Text style={styles.summaryLabel}>{item.label}</Text>
          <Text style={[styles.summaryValue, item.accent ? styles.summaryValueOrange : {}]}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SpecificationColumns({ sections }: { sections: PortfolioSection[] }) {
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        {sections.filter((_, index) => index % 2 === 0).map((section) => (
          <SectionCard key={section.title} section={section} />
        ))}
      </View>
      <View style={styles.column}>
        {sections.filter((_, index) => index % 2 === 1).map((section) => (
          <SectionCard key={section.title} section={section} />
        ))}
      </View>
    </View>
  );
}

function supportingDocumentsSection(documents: PortfolioDocument[]): PortfolioSection | null {
  if (documents.length === 0) return null;
  const fields = documents.slice(0, 8).map((document) => ({
    label: document.label,
    value: document.filename,
  }));
  if (documents.length > 8) {
    fields.push({
      label: "Additional files",
      value: `${documents.length - 8} more document${documents.length - 8 === 1 ? "" : "s"} on record`,
    });
  }
  return { title: "Supporting documents", fields };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function paginatePortfolioImages(images: PortfolioImage[]): {
  primaryImage: PortfolioImage | null;
  galleryPages: PortfolioImage[][];
} {
  const validImages = images.filter((image) => Boolean(image.src));
  return {
    primaryImage: validImages[0] ?? null,
    galleryPages: chunks(validImages.slice(1), 4),
  };
}

export function PropertyPortfolioDocument(input: PortfolioInput) {
  const {
    property,
    images,
    documents = [],
    logo,
    issuedToName,
    issuedToRole,
    now,
  } = input;
  const title = propertyTitle({
    bhk: property.bhk,
    propertyType: property.propertyType,
    localityName: property.locality.name,
  });
  const label = portfolioDocumentLabel(property.propertyType, property.transactionType);
  const documentSection = supportingDocumentsSection(documents);
  const sections = [
    ...buildPortfolioSections(property),
    ...(documentSection ? [documentSection] : []),
  ];
  const generated = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const issuedTo = `${issuedToName} (${issuedToRole === "ADMIN" ? "Admin" : "Agent"})`;
  // Keep every successfully loaded listing image. Gallery pages are generated in
  // deterministic groups of four, so large listings expand naturally instead of
  // silently dropping everything after the eighth upload.
  const { primaryImage, galleryPages } = paginatePortfolioImages(images);
  const description = property.description?.trim();
  const featureNotes = property.featuresText?.trim();
  const features = property.additionalFeatures.map((item) => item.trim()).filter(Boolean);
  const hasNotes = Boolean(description || featureNotes || features.length);

  return (
    <Document title={`${label} - ${property.fileNo}`} author="Franch Realty" subject={label}>
      <Page size="A4" style={styles.page}>
        <Header logo={logo} label={label} fileNo={property.fileNo} />
        <View style={styles.titleBlock}>
          <View style={{ flex: 1 }}>
            {property.builderDeveloperName?.trim() && (
              <Text style={styles.eyebrow}>{property.builderDeveloperName.trim()}</Text>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {property.locality.name}, {cityLabel[property.city]}
            </Text>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>
              {property.transactionType === "RENT" ? "Monthly rent" : "Listed sale price"}
            </Text>
            <Text style={styles.price}>
              {formatMoney(Number(property.priceInr), property.transactionType)}
            </Text>
          </View>
        </View>
        <SummaryStrip property={property} />
        {primaryImage ? (
          <>
            <View style={styles.coverImageBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={primaryImage.src} style={styles.coverImage} />
            </View>
            <Text style={styles.coverCaption}>{primaryImage.label}</Text>
          </>
        ) : (
          <SpecificationColumns sections={sections} />
        )}
        <Footer generated={generated} issuedTo={issuedTo} />
      </Page>

      {primaryImage && (
        <Page size="A4" style={styles.page}>
          <Header logo={logo} label="Property specifications" fileNo={property.fileNo} />
          <Text style={styles.detailTitle}>Property specifications</Text>
          <SpecificationColumns sections={sections} />
          <Footer generated={generated} issuedTo={issuedTo} />
        </Page>
      )}

      {hasNotes && (
        <Page size="A4" style={styles.page}>
          <Header logo={logo} label="Property details" fileNo={property.fileNo} />
          <View>
            <Text style={styles.detailTitle}>Property notes</Text>
            {description && <Text style={styles.bodyText}>{description}</Text>}
            {featureNotes && (
              <View>
                <Text style={[styles.detailTitle, { fontSize: 12 }]}>Features and specifications</Text>
                <Text style={styles.bodyText}>{featureNotes}</Text>
              </View>
            )}
            {features.length > 0 && (
              <View>
                <Text style={[styles.detailTitle, { fontSize: 12 }]}>Additional features</Text>
                <View style={styles.featureWrap}>
                  {features.map((feature, index) => (
                    <Text key={`${feature}-${index}`} style={styles.feature}>{feature}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>
          <Footer generated={generated} issuedTo={issuedTo} />
        </Page>
      )}

      {galleryPages.map((galleryImages, pageIndex) => (
        <Page key={`gallery-${pageIndex}`} size="A4" style={styles.page}>
          {/* Text wordmark avoids an @react-pdf image-cache issue on image-heavy pages. */}
          <Header
            logo={undefined}
            label={galleryPages.length > 1 ? `Property images ${pageIndex + 1}` : "Property images"}
            fileNo={property.fileNo}
          />
          <Text style={styles.detailTitle}>Property images</Text>
          <View style={styles.gallery}>
            {galleryImages.map((image, index) => (
              <View key={`${image.label}-${index}`} style={styles.imageCell} wrap={false}>
                <View style={styles.imageBox}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image src={image.src} style={styles.image} />
                </View>
                <Text style={styles.imageLabel}>{image.label}</Text>
              </View>
            ))}
          </View>
          <Footer generated={generated} issuedTo={issuedTo} />
        </Page>
      ))}
    </Document>
  );
}

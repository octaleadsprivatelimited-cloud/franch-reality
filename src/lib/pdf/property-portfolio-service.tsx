import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth-helpers";
import { getObjectBytes } from "@/lib/storage";
import {
  PropertyPortfolioDocument,
  type PortfolioDocument,
  type PortfolioImage,
} from "@/lib/pdf/property-portfolio";
import {
  isPortfolioImageMime,
  normalizePortfolioImage,
} from "@/lib/pdf/portfolio-image";

export type PortfolioPropertyRecord = Prisma.PropertyGetPayload<{
  include: { locality: true; attachments: true };
}>;

export interface RenderedPortfolio {
  pdf: Buffer;
  imageCandidates: number;
  imagesEmbedded: number;
  documentsListed: number;
}

export class PortfolioImagesUnavailableError extends Error {
  constructor() {
    super("The property images could not be loaded. Please verify the attachments and try again.");
    this.name = "PortfolioImagesUnavailableError";
  }
}

function documentLabel(kind: string): string {
  if (kind === "BROCHURE") return "Brochure";
  if (kind === "FLOORPLAN") return "Floor plan";
  return "Supporting file";
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

/** Load the brand asset once per request. The document has a text fallback. */
export async function loadPortfolioLogo(): Promise<string | undefined> {
  try {
    const logo = await readFile(path.join(process.cwd(), "public", "franch-logo.png"));
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Render one property portfolio. Image fetch/normalization uses a small worker pool
 * to avoid overwhelming object storage or the container on photo-heavy listings. */
export async function renderPropertyPortfolioPdf({
  property,
  user,
  logo,
  now = new Date(),
}: {
  property: PortfolioPropertyRecord;
  user: SessionUser;
  logo?: string;
  now?: Date;
}): Promise<RenderedPortfolio> {
  const imageAttachments = property.attachments.filter((attachment) =>
    isPortfolioImageMime(attachment.mimeType),
  );
  const normalized = await mapWithConcurrency(
    imageAttachments,
    4,
    async (attachment) => {
      try {
        const { bytes } = await getObjectBytes(attachment.r2Key);
        return await normalizePortfolioImage(bytes, attachment.mimeType);
      } catch {
        return null;
      }
    },
  );
  const images: PortfolioImage[] = normalized.flatMap((src, index) =>
    src
      ? [{
          src,
          label: index === 0 ? "Primary property image" : `Property image ${index + 1}`,
        }]
      : [],
  );

  if (imageAttachments.length > 0 && images.length === 0) {
    throw new PortfolioImagesUnavailableError();
  }

  const documents: PortfolioDocument[] = property.attachments
    .filter((attachment) => !attachment.mimeType.startsWith("image/"))
    .map((attachment) => ({
      label: documentLabel(attachment.kind),
      filename: attachment.originalFilename,
    }));

  const pdf = await renderToBuffer(
    PropertyPortfolioDocument({
      property,
      images,
      documents,
      logo,
      issuedToName: user.name ?? user.email ?? "Franch Realty User",
      issuedToRole: user.role,
      now,
    }),
  );

  return {
    pdf,
    imageCandidates: imageAttachments.length,
    imagesEmbedded: images.length,
    documentsListed: documents.length,
  };
}

export function portfolioPdfFilename(fileNo: string): string {
  const safeReference = fileNo.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `Property-Portfolio-${safeReference || "property"}.pdf`;
}

import sharp from "sharp";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isPortfolioImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Normalize every image format accepted by property uploads into a bounded
 * JPEG/PNG data URL that @react-pdf can embed reliably.
 */
export async function normalizePortfolioImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const image = sharp(Buffer.from(bytes), { animated: false })
    .rotate()
    .resize({
      width: 1800,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (mimeType.toLowerCase() === "image/png") {
    const normalized = await image.png({ compressionLevel: 9 }).toBuffer();
    return `data:image/png;base64,${normalized.toString("base64")}`;
  }

  const normalized = await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${normalized.toString("base64")}`;
}

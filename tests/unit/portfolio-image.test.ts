import { describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import {
  isPortfolioImageMime,
  normalizePortfolioImage,
} from "../../src/lib/pdf/portfolio-image";

function dataUrlBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

describe("portfolio image normalization", () => {
  test("accepts every image format allowed by property uploads", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      assert.equal(isPortfolioImageMime(mimeType), true);
    }
    assert.equal(isPortfolioImageMime("application/pdf"), false);
  });

  test("converts WebP to an embeddable, bounded JPEG", async () => {
    const webp = await sharp({
      create: {
        width: 2400,
        height: 1600,
        channels: 3,
        background: "#F07E1A",
      },
    }).webp().toBuffer();

    const dataUrl = await normalizePortfolioImage(webp, "image/webp");
    assert.match(dataUrl, /^data:image\/jpeg;base64,/);

    const metadata = await sharp(dataUrlBytes(dataUrl)).metadata();
    assert.ok((metadata.width ?? 0) <= 1800);
    assert.ok((metadata.height ?? 0) <= 1400);
  });

  test("keeps PNG output embeddable as PNG", async () => {
    const png = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0.5 },
      },
    }).png().toBuffer();

    const dataUrl = await normalizePortfolioImage(png, "image/png");
    assert.match(dataUrl, /^data:image\/png;base64,/);
  });
});

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractArtworkRegion } from "./crop";

/**
 * Builds a synthetic page at crop.ts's own analysis width (300px), so the
 * densities below map 1:1 onto its internal calculation with no resize
 * interpolation to account for:
 *   - rows [0, artworkRows): ~75% non-white across the row (a stand-in for
 *     dense artwork content)
 *   - rows [artworkRows, artworkRows + gapRows): all-white gap
 *   - rows [.., .. + captionRows): ~10% non-white (a stand-in for a sparse
 *     caption line — well under the artwork band's density)
 *   - remaining rows: all-white bottom margin
 */
function pageWithArtworkAndCaption(): Promise<Buffer> {
  const width = 300;
  const artworkRows = 60;
  const gapRows = 10;
  const captionRows = 10;
  const footerRows = 20;
  const height = artworkRows + gapRows + captionRows + footerRows;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 255); // start all white

  const darkFill = (row: number, denseWidth: number) => {
    for (let x = 0; x < denseWidth; x++) {
      const idx = (row * width + x) * channels;
      data[idx] = 20;
      data[idx + 1] = 20;
      data[idx + 2] = 20;
    }
  };

  for (let y = 0; y < artworkRows; y++) darkFill(y, Math.round(width * 0.75));
  for (let y = artworkRows + gapRows; y < artworkRows + gapRows + captionRows; y++) {
    darkFill(y, Math.round(width * 0.1));
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

describe("extractArtworkRegion", () => {
  it("crops to the dense artwork band and drops the sparse caption below it", async () => {
    const page = await pageWithArtworkAndCaption();
    const cropped = await extractArtworkRegion(page);
    const meta = await sharp(cropped).metadata();

    // The artwork band is 60 rows; the caption band alone is only 10 (well
    // under the 25%-of-peak-density threshold) so it should be excluded.
    // Allow slack for the crop's own padding/trim, but the result must be
    // much closer to 60 than to the full 100-row page.
    expect(meta.height).toBeGreaterThan(45);
    expect(meta.height).toBeLessThan(75);
  });

  it("falls back to a plain trim on an essentially blank page instead of throwing", async () => {
    const width = 300;
    const height = 100;
    const blank = Buffer.alloc(width * height * 3, 255);
    const page = await sharp(blank, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    await expect(extractArtworkRegion(page)).resolves.toBeInstanceOf(Buffer);
  });
});

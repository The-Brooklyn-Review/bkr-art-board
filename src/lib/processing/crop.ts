// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import sharp from "sharp";

/**
 * A plain sharp .trim() finds the bounding box of ALL non-background
 * content on a page — so a caption block ("Title / Year / Medium") sitting
 * below the artwork still gets pulled into the crop, since it's non-white
 * too. This produces a thumbnail with a sparse text footer under the art.
 *
 * First attempt was gap-width based (find whitespace gaps between content
 * bands) — but real data showed some captions sit close enough to the
 * artwork that the whitespace gap is only 2-3px, too small to reliably
 * detect, while the *density* difference is enormous and rock-solid: a
 * painting fills its rows ~70-80% non-white, while even the densest line
 * of caption text barely reaches ~10-15%. So this thresholds on density,
 * relative to the page's own peak (adapts to bold vs. sparse artwork
 * rather than assuming a fixed absolute level), and keeps the longest
 * contiguous run of rows at or above that threshold — captions (and any
 * other low-density cruft) fall below it and get dropped regardless of
 * how little whitespace separates them from the art.
 *
 * Falls back to a plain trim if the page has no meaningful content at all.
 */
export async function extractArtworkRegion(imageBuffer: Buffer): Promise<Buffer> {
  const ANALYSIS_WIDTH = 300;
  const meta = await sharp(imageBuffer).metadata();
  const origWidth = meta.width ?? ANALYSIS_WIDTH;
  const origHeight = meta.height ?? ANALYSIS_WIDTH;
  const scale = ANALYSIS_WIDTH / origWidth;
  const analysisHeight = Math.max(1, Math.round(origHeight * scale));

  const { data, info } = await sharp(imageBuffer)
    .resize(ANALYSIS_WIDTH, analysisHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  const rowActivity: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let nonWhite = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 235) nonWhite++;
    }
    rowActivity[y] = nonWhite / width;
  }

  const peakDensity = Math.max(...rowActivity);
  if (peakDensity < 0.01) {
    // Essentially blank page — nothing meaningful to crop to.
    return sharp(imageBuffer).toBuffer();
  }

  const DENSITY_THRESHOLD = peakDensity * 0.25;
  const GAP_TOLERANCE = Math.max(1, Math.round(height * 0.01));

  type Run = { start: number; end: number };
  const runs: Run[] = [];
  let current: Run | null = null;
  let gapRun = 0;

  for (let y = 0; y < height; y++) {
    if (rowActivity[y] >= DENSITY_THRESHOLD) {
      if (!current) current = { start: y, end: y };
      current.end = y;
      gapRun = 0;
    } else if (current) {
      gapRun++;
      if (gapRun > GAP_TOLERANCE) {
        runs.push(current);
        current = null;
        gapRun = 0;
      }
    }
  }
  if (current) runs.push(current);

  if (runs.length === 0) {
    return sharp(imageBuffer).trim({ background: "#ffffff", threshold: 10 }).toBuffer();
  }

  // Longest run wins — the artwork should dominate the page height.
  const best = runs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  // Minimal fixed padding, not proportional to run length: at ~300px
  // analysis width each analysis row maps back to several real pixels
  // (origWidth/300), so even a small percentage here can be enough real
  // pixels to pull in the top edge of a caption sitting close to the art.
  // The subsequent .trim() finds the true tight boundary regardless, so
  // padding only needs to guard against clipping the art itself.
  const pad = 1;
  const top = Math.max(0, Math.round((best.start - pad) / scale));
  const bottom = Math.min(origHeight, Math.round((best.end + pad) / scale));

  // Two separate pipelines with an intermediate buffer, not chained — sharp
  // throws "bad extract area" when .trim() is chained directly after
  // .extract() in the same pipeline (confirmed empirically).
  const band = await sharp(imageBuffer)
    .extract({ left: 0, top, width: origWidth, height: Math.max(1, bottom - top) })
    .toBuffer();
  return sharp(band).trim({ background: "#ffffff", threshold: 10 }).toBuffer();
}

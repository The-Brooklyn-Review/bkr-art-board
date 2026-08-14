// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import sharp from "sharp";

export type PageType =
  | "artwork"
  | "cover_statement"
  | "cv_bio"
  | "contact_sheet"
  | "unknown";

/**
 * Heuristic-only page classification (no ML). Downsamples to 60x60 and
 * combines two signals:
 *   - Tonal breadth: a text document on white paper is dominated by
 *     near-white background plus a thin sliver of near-black text, with
 *     almost no midtones. A photo or painting — even a black-and-white
 *     one — has a much wider spread of midtone brightness values.
 *   - Color saturation ("chroma"): caption/statement text is essentially
 *     always monochrome ink (R≈G≈B), regardless of how little of the page
 *     it covers. So ANY meaningful presence of saturated color rules out
 *     "this is a text page" outright — this catches a case tonal breadth
 *     alone misses: a small, vividly colorful image on a mostly-white
 *     page (generous margins) has low midtoneRatio purely because the art
 *     is a small fraction of the page, not because it's textlike. Found
 *     via a real-data spot-check where several small, colorful pages in
 *     one multi-page submission were wrongly hidden this way before
 *     chroma was added.
 *
 * Neither signal alone suffices: chroma alone would misclassify grayscale
 * photography as text (R≈G≈B there too); tonal breadth alone misses small
 * colorful art on a big white margin. Combined, both real failure modes
 * are covered.
 *
 * Known limitation: contact sheets and dense multi-image pages aren't
 * distinguished from single artwork pages. Editors can override per-page
 * in the detail view — this only needs to be right ~90% of the time.
 */
export async function classifyPage(imageBuffer: Buffer): Promise<{
  pageType: PageType;
  visibleInArtLibrary: boolean;
  debug: {
    whiteRatio: number;
    blackRatio: number;
    midtoneRatio: number;
    colorfulRatio: number;
  };
}> {
  const { data, info } = await sharp(imageBuffer)
    .resize(60, 60, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const totalPixels = info.width * info.height;

  let white = 0;
  let black = 0;
  let midtone = 0;
  let colorful = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    if (brightness > 235) white++;
    else if (brightness < 40) black++;
    else midtone++;

    // >30 on a 0-255 scale is well above JPEG compression noise on a true
    // grayscale source, but well below what any real saturated color hits.
    if (chroma > 30) colorful++;
  }

  const whiteRatio = white / totalPixels;
  const blackRatio = black / totalPixels;
  const midtoneRatio = midtone / totalPixels;
  const colorfulRatio = colorful / totalPixels;

  const hasSignificantColor = colorfulRatio > 0.01;
  const isTextLike = whiteRatio > 0.8 && midtoneRatio < 0.12 && !hasSignificantColor;

  const pageType: PageType = isTextLike ? "cover_statement" : "artwork";

  return {
    pageType,
    visibleInArtLibrary: pageType === "artwork",
    debug: { whiteRatio, blackRatio, midtoneRatio, colorfulRatio },
  };
}

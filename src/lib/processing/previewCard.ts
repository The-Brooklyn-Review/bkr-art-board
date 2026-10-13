// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import sharp from "sharp";

/**
 * Link-preview image for share links (og:image): 1200×630 — the shape
 * iMessage, WhatsApp, Slack and social cards display large — as JPEG,
 * which every previewer shows (WebP isn't, everywhere). The artwork is
 * fitted whole on the app's dark ground, never cropped; a submission shows
 * up to three pieces side by side.
 */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;
const PAD = 40;
const GAP = 24;
const GROUND = { r: 14, g: 14, b: 13 };

export async function renderPreviewCard(images: Buffer[]): Promise<Buffer> {
  const pieces = images.slice(0, 3);
  const slotW = Math.floor((PREVIEW_WIDTH - 2 * PAD - GAP * (pieces.length - 1)) / pieces.length);
  const slotH = PREVIEW_HEIGHT - 2 * PAD;
  const fitted = await Promise.all(
    pieces.map((img) =>
      sharp(img)
        .resize({ width: slotW, height: slotH, fit: "inside", withoutEnlargement: false })
        .toBuffer({ resolveWithObject: true }),
    ),
  );
  // Centre the row as a whole, each piece centred vertically in its slot.
  const rowW = fitted.reduce((w, f) => w + f.info.width, 0) + GAP * (fitted.length - 1);
  let left = Math.round((PREVIEW_WIDTH - rowW) / 2);
  const layers = fitted.map((f) => {
    const layer = {
      input: f.data,
      left,
      top: Math.round((PREVIEW_HEIGHT - f.info.height) / 2),
    };
    left += f.info.width + GAP;
    return layer;
  });
  return sharp({
    create: { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, channels: 3, background: GROUND },
  })
    .composite(layers)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

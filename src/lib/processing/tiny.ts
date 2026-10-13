// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import sharp from "sharp";
import { TINY_SIZE } from "@/lib/storage/tiny";

/**
 * Renders the tiny variant from the (already cropped) thumbnail. "outside"
 * makes the SHORT side TINY_SIZE: the list shows it object-cover in a
 * square, so a wide panorama still fills the square sharply.
 */
export async function renderTiny(thumb: Buffer): Promise<Buffer> {
  return sharp(thumb)
    .resize({ width: TINY_SIZE, height: TINY_SIZE, fit: "outside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}

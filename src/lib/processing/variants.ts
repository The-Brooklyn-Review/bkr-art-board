// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import sharp from "sharp";
import { VARIANTS, type Variant } from "@/lib/storage/variants";

/**
 * Renders a variant from the (already cropped) thumbnail.
 * - tiny: "outside" makes the SHORT side 240 — the list shows it
 *   object-cover in a square, so a wide panorama still fills it sharply.
 * - card: 600px wide, full image — gallery cards show the whole artwork at
 *   their column's width.
 */
export async function renderVariant(thumb: Buffer, variant: Variant): Promise<Buffer> {
  const { size } = VARIANTS[variant];
  const resized =
    variant === "tiny"
      ? sharp(thumb).resize({ width: size, height: size, fit: "outside", withoutEnlargement: true })
      : sharp(thumb).resize({ width: size, withoutEnlargement: true });
  return resized.webp({ quality: variant === "tiny" ? 75 : 80 }).toBuffer();
}

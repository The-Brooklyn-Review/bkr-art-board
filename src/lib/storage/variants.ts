/**
 * Smaller copies of each artwork's thumbnail (the regular one is up to
 * 1000px), stored next to it under a derived key — not tracked in the DB:
 *
 * - tiny (240px, square-cropped): the review list's 64px rows and the
 *   reviewer's page strip. TinyThumb falls back to the thumbnail if it's
 *   missing.
 * - card (600px wide): gallery cards, offered alongside the thumbnail in a
 *   srcset so the browser picks — 600 is sharp enough for most desktop
 *   layouts at 2x, the 1000px thumbnail is kept for big cards and phones
 *   showing one per row (see cardSizes in src/lib/art-library/density.ts).
 *
 * Made by scripts/process-submission.ts; backfilled by
 * scripts/backfill-variants.ts.
 */
import { getSignedR2Url } from "@/lib/storage/r2";

import { VARIANTS, type Variant } from "@/lib/storage/variantSizes";

export { VARIANTS, type Variant };

/** ".../page-3-thumb.webp" → ".../page-3-tiny.webp"; null for any other key. */
export function variantKeyFor(thumbKey: string, variant: Variant): string | null {
  return /-thumb\.webp$/.test(thumbKey)
    ? thumbKey.replace(/-thumb\.webp$/, `-${variant}.webp`)
    : null;
}

/** Signed URL of a variant of a thumbnail key, or null. */
export async function signVariant(thumbKey: string, variant: Variant): Promise<string | null> {
  const key = variantKeyFor(thumbKey, variant);
  return key ? getSignedR2Url(key) : null;
}

/** Every variant's key for a thumbnail — for deleting them with it. */
export function allVariantKeys(thumbKey: string): string[] {
  return (Object.keys(VARIANTS) as Variant[])
    .map((v) => variantKeyFor(thumbKey, v))
    .filter((k): k is string => k !== null);
}

export const tinyKeyFor = (thumbKey: string) => variantKeyFor(thumbKey, "tiny");
export const signTiny = (thumbKey: string) => signVariant(thumbKey, "tiny");

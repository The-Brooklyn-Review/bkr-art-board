/**
 * "Tiny" thumbnails for small squares — the review list's 64px rows and the
 * reviewer's page strip; the regular thumbnail is up to 1000px, ~17 MB for
 * the full list. Not tracked in the DB: the tiny image sits next to the
 * thumbnail under a derived key, and TinyThumb falls back to the thumbnail
 * if it's missing. Not used by the gallery: its cards need the full
 * thumbnail, and its lightbox strip reuses those already-cached images. Made by
 * scripts/process-submission.ts; backfilled by scripts/backfill-tiny.ts.
 */
import { getSignedR2Url } from "@/lib/storage/r2";

// 64px rows at up to 3x pixel density.
export const TINY_SIZE = 240;

/** ".../page-3-thumb.webp" → ".../page-3-tiny.webp"; null for any other key. */
export function tinyKeyFor(thumbKey: string): string | null {
  return /-thumb\.webp$/.test(thumbKey) ? thumbKey.replace(/-thumb\.webp$/, "-tiny.webp") : null;
}

/** Signed URL of the tiny variant of a thumbnail key, or null. */
export async function signTiny(thumbKey: string): Promise<string | null> {
  const key = tinyKeyFor(thumbKey);
  return key ? getSignedR2Url(key) : null;
}

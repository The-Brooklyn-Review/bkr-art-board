/**
 * "Tiny" thumbnails for the review list's 64px rows — the regular thumbnail
 * is up to 1000px, ~10 MB for a first visit to the list. Not tracked in the
 * DB: the tiny image sits next to the thumbnail under a derived key, and the
 * list falls back to the thumbnail if it's missing (see RowThumb). Made by
 * scripts/process-submission.ts; backfilled by scripts/backfill-tiny.ts.
 */

// 64px rows at up to 3x pixel density.
export const TINY_SIZE = 240;

/** ".../page-3-thumb.webp" → ".../page-3-tiny.webp"; null for any other key. */
export function tinyKeyFor(thumbKey: string): string | null {
  return /-thumb\.webp$/.test(thumbKey) ? thumbKey.replace(/-thumb\.webp$/, "-tiny.webp") : null;
}

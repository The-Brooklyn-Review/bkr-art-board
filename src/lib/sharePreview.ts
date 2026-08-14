// Plain server module (no "use server") — imported by both the mutating
// actions (src/lib/actions/sharePreview.ts) and the read-only public
// surfaces (src/app/share/[token]/page.tsx, .../image/route.ts), so the
// image route applies the exact same authorization decision as the page
// rather than a second, possibly-drifted copy of it.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // fixed 7 days — no picker

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResolvedShareAsset {
  assetId: string;
  artistName: string | null;
  submissionTitle: string | null;
  // Deliberately the cropped thumbnail (artwork region only, 1000px,
  // q82 webp — see processImageVariants in scripts/process-submission.ts),
  // not the full uncropped "large" image the authenticated lightbox shows.
  // Good enough for an embed and a light zoom; anyone who wants the real
  // full-resolution image clicks through to the logged-in viewer.
  storagePathThumbnail: string;
}

/**
 * Revoked, expired, hidden, and do-not-use assets all resolve to null —
 * indistinguishable from a token that never existed, so a probe can't
 * learn anything from the response (see the share page's notFound()).
 * Hidden/do-not-use are re-checked here, not just at link-creation time:
 * hiding or withdrawing a piece kills every outstanding share link for it
 * immediately, with no separate cleanup step.
 */
export async function resolveShareToken(token: string): Promise<ResolvedShareAsset | null> {
  const link = await prisma.sharedArtworkLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
    include: {
      artAsset: {
        include: { submission: { select: { artistName: true, submissionTitle: true } } },
      },
    },
  });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  if (!link.artAsset.visibleInArtLibrary || link.artAsset.usedState === "do_not_use") return null;

  return {
    assetId: link.artAssetId,
    artistName: link.artAsset.submission.artistName,
    submissionTitle: link.artAsset.submission.submissionTitle,
    storagePathThumbnail: link.artAsset.storagePathThumbnail,
  };
}

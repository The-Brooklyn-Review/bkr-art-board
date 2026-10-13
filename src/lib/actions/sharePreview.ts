"use server";

import { requireAuth } from "@/lib/requireAuth";

import { prisma } from "@/lib/db";
import {
  SHAREABLE_ASSET,
  SHARE_LINK_TTL_MS,
  generateShareToken,
  hashShareToken,
} from "@/lib/sharePreview";

/**
 * One row per asset (@unique on artAssetId in the schema) — calling this
 * again for an asset that already has a link overwrites it with a fresh
 * token and expiry, so the previous link stops resolving immediately.
 * That's the only "revoke" this app has: share again to invalidate the
 * old link. Returns the raw token — this is the only place it ever exists
 * outside the URL handed to the caller; only its hash is stored.
 */
export async function createShareLink(assetId: string): Promise<string> {
  await requireAuth();
  const asset = await prisma.artAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (!asset.visibleInArtLibrary || asset.usedState === "do_not_use") {
    throw new Error("This artwork can't be shared.");
  }

  const token = generateShareToken();
  await prisma.sharedArtworkLink.upsert({
    where: { artAssetId: assetId },
    create: {
      artAssetId: assetId,
      tokenHash: hashShareToken(token),
      expiresAt: new Date(Date.now() + SHARE_LINK_TTL_MS),
    },
    update: {
      tokenHash: hashShareToken(token),
      expiresAt: new Date(Date.now() + SHARE_LINK_TTL_MS),
      revokedAt: null,
    },
  });

  return token;
}

/**
 * The same for a whole submission (/share/s/<token>): one link per
 * submission, sharing again replaces it. Refused when no page would show.
 * `previewAssetId` — the piece on screen — leads: it's the link-preview
 * image and where the page opens (ignored unless it's a shareable page of
 * this submission).
 */
export async function createSubmissionShareLink(
  submissionId: string,
  previewAssetId?: string,
): Promise<string> {
  await requireAuth();
  const shareable = await prisma.artAsset.findMany({
    where: { submissionId, ...SHAREABLE_ASSET },
    select: { id: true },
  });
  if (shareable.length === 0) throw new Error("Nothing in this submission can be shared.");
  const preview = shareable.some((a) => a.id === previewAssetId) ? previewAssetId! : null;

  const token = generateShareToken();
  const data = {
    tokenHash: hashShareToken(token),
    expiresAt: new Date(Date.now() + SHARE_LINK_TTL_MS),
    revokedAt: null,
    previewAssetId: preview,
  };
  await prisma.sharedSubmissionLink.upsert({
    where: { submissionId },
    create: { submissionId, ...data },
    update: data,
  });
  return token;
}

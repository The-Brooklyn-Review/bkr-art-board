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
 */
export async function createSubmissionShareLink(submissionId: string): Promise<string> {
  await requireAuth();
  const shareable = await prisma.artAsset.count({ where: { submissionId, ...SHAREABLE_ASSET } });
  if (shareable === 0) throw new Error("Nothing in this submission can be shared.");

  const token = generateShareToken();
  const data = {
    tokenHash: hashShareToken(token),
    expiresAt: new Date(Date.now() + SHARE_LINK_TTL_MS),
    revokedAt: null,
  };
  await prisma.sharedSubmissionLink.upsert({
    where: { submissionId },
    create: { submissionId, ...data },
    update: data,
  });
  return token;
}

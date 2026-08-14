"use server";

import { prisma } from "@/lib/db";
import { getSignedR2Url } from "@/lib/storage/r2";

/**
 * Signs the large-image URL for a single asset on demand. The Art Library
 * grid only ever needs thumbnailUrl; signing largeUrl for all 200+ assets
 * up front (the old getLibraryAssets behavior) was pure waste for anyone
 * who doesn't open every single asset. The lightbox calls this the moment
 * it actually opens a slide, showing the already-loaded thumbnail in the
 * meantime.
 */
export async function getAssetLargeUrl(assetId: string): Promise<string> {
  const asset = await prisma.artAsset.findUniqueOrThrow({
    where: { id: assetId },
    select: { storagePathLarge: true },
  });
  return getSignedR2Url(asset.storagePathLarge);
}

import { prisma } from "@/lib/db";
import { getLibraryAssets } from "@/lib/art-library/getAssets";
import { ArtLibraryClient } from "@/components/art-library/ArtLibraryClient";

export const dynamic = "force-dynamic";

export default async function ArtLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const [assets, submissionCount, { asset }] = await Promise.all([
    getLibraryAssets(),
    prisma.submittableSubmission.count({ where: { processingStatus: "processed" } }),
    searchParams,
  ]);

  return (
    <ArtLibraryClient
      assets={assets}
      submissionCount={submissionCount}
      initialAssetId={asset ?? null}
    />
  );
}

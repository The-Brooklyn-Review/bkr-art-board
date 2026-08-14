import { prisma } from "@/lib/db";
import { getLibraryAssets } from "@/lib/art-library/getAssets";
import { ArtLibraryClient } from "@/components/art-library/ArtLibraryClient";

// getLibraryAssets() signs 200+ short-lived R2 URLs per request — caching
// this route would serve expired image links. ArtLibraryClient's syncUrl()
// relies on this too: it updates the address bar via the raw History API
// instead of Next's router specifically to avoid re-triggering this fetch.
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

import { getCurrentReviewer } from "@/lib/reviewer/identity";
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
  searchParams: Promise<{ asset?: string; published?: string }>;
}) {
  const { asset, published } = await searchParams;
  const includePublished = published === "1";
  const [assets, reviewer] = await Promise.all([
    getLibraryAssets({ includePublished }),
    getCurrentReviewer(),
  ]);

  return (
    <ArtLibraryClient
      assets={assets}
      submissionCount={new Set(assets.map((a) => a.submissionId)).size}
      initialAssetId={asset ?? null}
      includePublished={includePublished}
      reviewerName={reviewer?.displayName ?? null}
    />
  );
}

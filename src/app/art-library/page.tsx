import { getCurrentReviewer } from "@/lib/reviewer/identity";
import { getLibraryAssets } from "@/lib/art-library/getAssets";
import { ArtLibraryClient } from "@/components/art-library/ArtLibraryClient";
import { lastSyncedAt } from "@/lib/sync/syncSubmittable";
import { isSyncStale } from "@/lib/sync/autoSync";
import { formatDateTime } from "@/lib/format";

// getLibraryAssets() signs 200+ short-lived R2 URLs per request — caching
// this route would serve expired image links. ArtLibraryClient's syncUrl()
// relies on this too: it updates the address bar via the raw History API
// instead of Next's router specifically to avoid re-triggering this fetch.
export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery · BKR Art Board" };
// The background Submittable sync runs as a server action on this page.
export const maxDuration = 120;

export default async function ArtLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; published?: string }>;
}) {
  const { asset, published } = await searchParams;
  const includePublished = published === "1";
  const [assets, reviewer, synced] = await Promise.all([
    getLibraryAssets({ includePublished }),
    getCurrentReviewer(),
    lastSyncedAt(),
  ]);

  return (
    <ArtLibraryClient
      assets={assets}
      submissionCount={new Set(assets.map((a) => a.submissionId)).size}
      initialAssetId={asset ?? null}
      includePublished={includePublished}
      reviewerName={reviewer?.displayName ?? null}
      sync={{ lastSynced: formatDateTime(synced), stale: isSyncStale(synced) }}
    />
  );
}

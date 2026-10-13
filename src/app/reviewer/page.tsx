import { getReviewers } from "@/lib/submissions/queue";
import { getCurrentReviewer } from "@/lib/reviewer/identity";
import { chooseReviewer } from "@/lib/actions/review";
import { ReviewerPicker } from "@/components/review/ReviewerPicker";
import { LoadReviewersButton } from "@/components/review/LoadReviewersButton";
import { SyncStatus } from "@/components/review/SyncStatus";
import { lastSyncedAt } from "@/lib/sync/syncSubmittable";
import { isSyncStale } from "@/lib/sync/autoSync";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
// "Load reviewers from Submittable" and the background sync run as server
// actions here.
export const maxDuration = 120;

export default async function ReviewerPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [{ next = "/submissions", error }, reviewers, current, synced] = await Promise.all([
    searchParams,
    getReviewers(),
    getCurrentReviewer(),
    lastSyncedAt(),
  ]);
  const loaded = reviewers.some((r) => r.submittableUserId);

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-text">
          Who&rsquo;s reviewing?
        </h1>
        <p className="text-sm text-text-muted mt-2 mb-8">
          Your decisions, notes and label changes are posted to Submittable under this name.
        </p>
        {!loaded && <LoadReviewersButton />}
        <ReviewerPicker
          action={chooseReviewer}
          next={next}
          currentId={current?.id ?? null}
          reviewers={reviewers.map((r) => ({
            id: r.id,
            name: r.displayName,
            assigned: r._count.assignments,
          }))}
        />
        {error && <p className="text-sm text-red-300 mt-4">Pick a name or type a new one.</p>}
        {/* Someone newly assigned in Submittable shows up after the next
            sync — which this page also runs in the background when stale,
            so they don't have to wait for the daily one. */}
        {loaded && (
          <p className="mt-8 text-xs text-text-muted leading-relaxed">
            Names come from who&rsquo;s assigned Visual Arts submissions in Submittable.{" "}
            <SyncStatus lastSynced={formatDateTime(synced)} stale={isSyncStale(synced)} />
          </p>
        )}
      </div>
    </main>
  );
}

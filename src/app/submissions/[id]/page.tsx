import { notFound, redirect } from "next/navigation";
import { getSubmission } from "@/lib/submissions/getSubmission";
import { currentReviewerId, getReviewer } from "@/lib/reviewer/identity";
import { parseFilters, filtersToQuery } from "@/lib/submissions/filters";
import { getQueueNav, neighborsOutside } from "@/lib/submissions/queue";
import { REVIEWER_LABELS } from "@/lib/reviewer/labels";
import { cookies } from "next/headers";
import { formatDateTime } from "@/lib/format";
import { lastSyncedAt } from "@/lib/sync/syncSubmittable";
import { isSyncStale } from "@/lib/sync/autoSync";
import { QUEUE_HIDDEN_COOKIE } from "@/lib/ui/prefs";
import { SubmissionReviewClient } from "@/components/submissions/SubmissionReviewClient";

// getSubmission() signs short-lived R2 URLs per request — caching this
// route would serve expired image links.
export const dynamic = "force-dynamic";
export const metadata = { title: "Review · BKR Art Board" };
export const maxDuration = 120;

export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, reviewerId] = await Promise.all([params, searchParams, currentReviewerId()]);
  const toPicker = () => {
    const qs = new URLSearchParams(sp as Record<string, string>).toString();
    redirect(`/reviewer?next=${encodeURIComponent(`/submissions/${id}${qs ? `?${qs}` : ""}`)}`);
  };
  if (!reviewerId) toPicker();
  const filters = parseFilters(sp);
  // All at once — the Reviewer row is checked after, not waited on first.
  const [reviewer, submission, queue, synced, jar] = await Promise.all([
    getReviewer(reviewerId),
    getSubmission(id),
    getQueueNav(filters, reviewerId!),
    lastSyncedAt(),
    cookies(),
  ]);
  if (!reviewer) return toPicker();
  if (!submission) notFound();

  const index = queue.findIndex((q) => q.id === id);
  const { prevId, nextId } =
    index >= 0
      ? { prevId: queue[index - 1]?.id ?? null, nextId: queue[index + 1]?.id ?? null }
      : // Not in the list (just decided under "Not yet decided by me", or
        // opened from the gallery): continue from its place in the order.
        await neighborsOutside(filters, reviewer.id, submission);

  return (
    // Keyed per submission: J/K navigation remounts it, so the page index,
    // chosen decision and draft comment never leak into the next submission.
    <SubmissionReviewClient
      key={submission.id}
      submission={submission}
      sync={{ lastSynced: formatDateTime(synced), stale: isSyncStale(synced) }}
      queueHidden={jar.get(QUEUE_HIDDEN_COOKIE)?.value === "1"}
      queue={queue.map((q) => ({
        id: q.id,
        artistName: q.artistName,
        submissionTitle: q.submissionTitle,
        myDecision: q.decisions.find((d) => d.reviewerId === reviewer.id)?.decision ?? null,
        myDecisionFailed: q.decisions.some(
          (d) =>
            d.reviewerId === reviewer.id &&
            (d.pushStatus === "failed" || d.pushStatus === "unknown"),
        ),
      }))}
      position={{ index, total: queue.length, prevId, nextId }}
      query={filtersToQuery(filters)}
      reviewer={{ id: reviewer.id, name: reviewer.displayName }}
      labelCatalog={REVIEWER_LABELS.map((l) => ({ id: l.submittableLabelId, name: l.name }))}
    />
  );
}

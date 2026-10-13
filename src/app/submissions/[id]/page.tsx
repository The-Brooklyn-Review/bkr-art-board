import { notFound, redirect } from "next/navigation";
import { getSubmission } from "@/lib/submissions/getSubmission";
import { getCurrentReviewer } from "@/lib/reviewer/identity";
import { parseFilters, filtersToQuery } from "@/lib/submissions/filters";
import { getQueue } from "@/lib/submissions/queue";
import { REVIEWER_LABELS } from "@/lib/reviewer/labels";
import { formatDateTime } from "@/lib/format";
import { SubmissionReviewClient } from "@/components/submissions/SubmissionReviewClient";

// getSubmission() signs short-lived R2 URLs per request — caching this
// route would serve expired image links.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const reviewer = await getCurrentReviewer();
  if (!reviewer) {
    const qs = new URLSearchParams(sp as Record<string, string>).toString();
    redirect(`/reviewer?next=${encodeURIComponent(`/submissions/${id}${qs ? `?${qs}` : ""}`)}`);
  }
  const filters = parseFilters(sp);
  const [submission, queue] = await Promise.all([
    getSubmission(id),
    getQueue(filters, reviewer.id, false),
  ]);
  if (!submission) notFound();

  const index = queue.findIndex((q) => q.id === id);
  // Opened from outside the current list (e.g. the gallery's Review link):
  // next/previous fall back to the list's ends rather than disappearing.
  const prevId = index > 0 ? queue[index - 1].id : null;
  const nextId = index >= 0 ? (queue[index + 1]?.id ?? null) : (queue[0]?.id ?? null);

  return (
    // Keyed per submission: J/K navigation remounts it, so the page index,
    // chosen decision and draft comment never leak into the next submission.
    <SubmissionReviewClient
      key={submission.id}
      submission={submission}
      lastSynced={formatDateTime(submission.lastSyncedAt)}
      queue={queue.map((q) => ({
        id: q.id,
        artistName: q.artistName,
        submissionTitle: q.submissionTitle,
        myDecision: q.decisions.find((d) => d.reviewerId === reviewer.id)?.decision ?? null,
        myDecisionFailed: q.decisions.some(
          (d) => d.reviewerId === reviewer.id && d.pushStatus === "failed",
        ),
      }))}
      position={{ index, total: queue.length, prevId, nextId }}
      query={filtersToQuery(filters)}
      reviewer={{ id: reviewer.id, name: reviewer.displayName }}
      labelCatalog={REVIEWER_LABELS.map((l) => ({ id: l.submittableLabelId, name: l.name }))}
    />
  );
}

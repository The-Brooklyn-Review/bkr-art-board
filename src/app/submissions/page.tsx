import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentReviewer } from "@/lib/reviewer/identity";
import { parseFilters, filtersToQuery, type QueueFilters } from "@/lib/submissions/filters";
import { FILTER_LABELS, getQueue, getReviewers, queueWhere } from "@/lib/submissions/queue";
import { STATUS_GROUPS, displayStatus, type StatusGroup } from "@/lib/submittable/statuses";
import { lastSyncedAt } from "@/lib/sync/syncSubmittable";
import { formatDateTime } from "@/lib/format";
import { AppNav } from "@/components/review/AppNav";
import { SyncButton } from "@/components/review/SyncButton";
import { QueueFilterBar } from "@/components/review/QueueFilterBar";
import { DecisionChip } from "@/components/review/DecisionChip";

// Signs a thumbnail URL per row per request — must not be cached.
export const dynamic = "force-dynamic";
// The Sync button runs as a server action on this page.
export const maxDuration = 120;

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reviewer = await getCurrentReviewer();
  if (!reviewer) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/reviewer?next=${encodeURIComponent(`/submissions${qs ? `?${qs}` : ""}`)}`);
  }
  const filters = parseFilters(params);

  const [rows, reviewers, synced, statusCounts] = await Promise.all([
    getQueue(filters, reviewer.id),
    getReviewers(),
    lastSyncedAt(),
    countByStatus(filters, reviewer.id),
  ]);
  const query = filtersToQuery(filters);
  const assignedToMeTotal = await prisma.submissionAssignment.count({
    where: { reviewerId: reviewer.id },
  });

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border px-4 sm:px-6 py-3 sticky top-0 bg-bg/95 backdrop-blur-sm z-10">
        <AppNav current="review" reviewerName={reviewer.displayName}>
          <SyncButton lastSynced={formatDateTime(synced)} />
        </AppNav>
      </header>

      <main className="px-4 sm:px-6 py-6 max-w-[1400px]">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl">
            {heading(filters, reviewer.displayName, reviewers)}
          </h1>
          <p className="text-sm text-text-muted tabular-nums">
            {rows.length} {rows.length === 1 ? "submission" : "submissions"}
          </p>
        </div>

        <QueueFilterBar
          filters={filters}
          statusCounts={statusCounts}
          reviewers={reviewers.map((r) => ({ id: r.id, name: r.displayName }))}
          labels={FILTER_LABELS.map((l) => ({
            submittableLabelId: l.submittableLabelId,
            name: l.name,
          }))}
          currentReviewerId={reviewer.id}
        />

        {reviewers.every((r) => !r.submittableUserId) && (
          <p className="mt-6 border border-border px-4 py-3 text-sm text-text-muted">
            Assignments haven&rsquo;t been pulled from Submittable yet. Press{" "}
            <strong className="text-text">Sync</strong> to load who each submission is assigned to.
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState filters={filters} assignedToMeTotal={assignedToMeTotal} />
        ) : (
          <ol className="mt-6 border-t border-border">
            {rows.map((r, i) => (
              <li key={r.id} className="border-b border-border">
                <Link
                  href={`/submissions/${r.id}${query}`}
                  className="grid grid-cols-[56px_1fr] sm:grid-cols-[72px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_auto] items-center gap-x-4 gap-y-1 py-3 px-1 hover:bg-surface focus-visible:bg-surface outline-none transition-colors"
                >
                  <div className="row-span-3 sm:row-span-1 w-14 h-14 sm:w-[72px] sm:h-[72px] bg-surface border border-border overflow-hidden">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        loading={i < 12 ? "eager" : "lazy"}
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="block w-full h-full" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-lg leading-tight truncate">
                      {r.artistName ?? "Unknown artist"}
                    </p>
                    <p className="text-sm text-text-muted truncate">
                      {r.submissionTitle || "Untitled"} · {r.pageCount}{" "}
                      {r.pageCount === 1 ? "page" : "pages"}
                    </p>
                  </div>
                  <div className="min-w-0 text-xs text-text-muted flex flex-wrap gap-x-2 gap-y-1">
                    {r.labels.length ? (
                      r.labels.map((l) => (
                        <span key={l.submittableLabelId} className="whitespace-nowrap">
                          {l.name}
                        </span>
                      ))
                    ) : (
                      <span className="hidden sm:inline text-text-muted/60">No labels</span>
                    )}
                  </div>
                  <div className="min-w-0 flex flex-wrap gap-1.5 items-center">
                    {r.decisions.length ? (
                      r.decisions.map((d) => (
                        <DecisionChip
                          key={`${d.reviewerId ?? d.reviewerName}`}
                          reviewerName={d.reviewerName}
                          decision={d.decision}
                          pushStatus={d.pushStatus}
                          compact
                        />
                      ))
                    ) : (
                      <span className="text-xs text-text-muted">
                        {r.reviewers.length
                          ? `Assigned to ${r.reviewers.map((x) => x.name).join(" and ")}`
                          : "Unassigned"}
                      </span>
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs text-text-muted whitespace-nowrap">
                    {displayStatus(r.officialStatus)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

function heading(
  f: QueueFilters,
  myName: string,
  reviewers: { id: string; displayName: string }[],
): string {
  const who =
    f.assigned === "me"
      ? "Assigned to you"
      : f.assigned === "all"
        ? "All submissions"
        : f.assigned === "unassigned"
          ? "Unassigned"
          : `Assigned to ${reviewers.find((r) => r.id === f.assigned)?.displayName ?? "reviewer"}`;
  void myName;
  return who;
}

async function countByStatus(
  f: QueueFilters,
  reviewerId: string,
): Promise<Record<StatusGroup, number>> {
  const entries = await Promise.all(
    STATUS_GROUPS.map(async (g) => [
      g.value,
      await prisma.submittableSubmission.count({
        where: queueWhere({ ...f, status: g.value }, reviewerId),
      }),
    ]),
  );
  return Object.fromEntries(entries) as Record<StatusGroup, number>;
}

function EmptyState({
  filters,
  assignedToMeTotal,
}: {
  filters: QueueFilters;
  assignedToMeTotal: number;
}) {
  if (filters.assigned === "me" && assignedToMeTotal === 0) {
    return (
      <div className="mt-10 text-sm text-text-muted space-y-2">
        <p className="text-text">Nothing is assigned to you in Submittable.</p>
        <p>
          <Link
            className="underline hover:text-text"
            href={`/submissions${filtersToQuery(filters, { assigned: "all" })}`}
          >
            Show everyone&rsquo;s submissions
          </Link>{" "}
          or press Sync if assignments changed recently.
        </p>
      </div>
    );
  }
  if (filters.mine === "todo" && filters.status === "undecided") {
    return (
      <div className="mt-10 text-sm text-text-muted space-y-2">
        <p className="text-text">You&rsquo;ve made a decision on everything in this list.</p>
        <p>
          <Link
            className="underline hover:text-text"
            href={`/submissions${filtersToQuery(filters, { mine: "done" })}`}
          >
            Review your decisions
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mt-10 text-sm text-text-muted">
      <p className="text-text">No submissions match these filters.</p>
      <Link className="underline hover:text-text" href="/submissions">
        Reset filters
      </Link>
    </div>
  );
}

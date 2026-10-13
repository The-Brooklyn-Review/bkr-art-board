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
import { AppHeader, PageTitle } from "@/components/review/AppHeader";
import { isSyncStale } from "@/lib/sync/autoSync";
import { QueueFilterBar } from "@/components/review/QueueFilterBar";
import { DecisionChip } from "@/components/review/DecisionChip";
import { TinyThumb } from "@/components/review/TinyThumb";

// Signs a thumbnail URL per row per request — must not be cached.
export const dynamic = "force-dynamic";
export const metadata = { title: "Review · BKR Art Board" };
// The background sync and "Sync now" run as server actions on this page.
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

  const decidedByMe = rows.filter((r) =>
    r.decisions.some((d) => d.reviewerId === reviewer.id),
  ).length;

  return (
    <div className="min-h-screen bg-bg text-text">
      <AppHeader
        nav={
          <AppNav
            current="review"
            reviewerName={reviewer.displayName}
            sync={{ lastSynced: formatDateTime(synced), stale: isSyncStale(synced) }}
          />
        }
      >
        <PageTitle
          title={heading(filters, reviewers)}
          meta={
            <p className="tabular-nums">
              {rows.length} {rows.length === 1 ? "submission" : "submissions"}
              {rows.length > 0 && <> · {decidedByMe} decided by you</>}
            </p>
          }
        />
        <div className="mt-3 sm:mt-4">
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
        </div>
      </AppHeader>

      <main className="px-4 sm:px-6 pb-10">
        {rows.length === 0 ? (
          <EmptyState
            filters={filters}
            assignedToMeTotal={assignedToMeTotal}
            statusCounts={statusCounts}
          />
        ) : (
          <>
            {/* Column heads: what each column is, so metadata scans as a table. */}
            <div
              aria-hidden
              className={`hidden sm:grid ${ROW_COLS(filters.status === "all")} gap-x-5 px-1 pt-4 pb-2 text-xs text-text-muted border-b border-border`}
            >
              <span />
              <span>Submission</span>
              <span>Labels</span>
              <span>Decisions</span>
              <span>Assigned to</span>
              {filters.status === "all" && <span>Status</span>}
            </div>
            <ol>
              {rows.map((r, i) => {
                const mineFirst = [...r.decisions].sort(
                  (a, b) =>
                    Number(b.reviewerId === reviewer.id) - Number(a.reviewerId === reviewer.id),
                );
                return (
                  <li key={r.id} className="border-b border-border">
                    <Link
                      href={`/submissions/${r.id}${query}`}
                      className={`grid grid-cols-[56px_minmax(0,1fr)] ${ROW_COLS(filters.status === "all")} items-center gap-x-4 sm:gap-x-5 gap-y-1.5 py-3 px-1 hover:bg-bg-hover focus-visible:bg-bg-hover outline-none transition-colors`}
                    >
                      <div className="row-span-2 sm:row-span-1 self-start sm:self-center w-14 h-14 sm:w-16 sm:h-16 bg-surface border border-border overflow-hidden">
                        {r.thumbnailUrl ? (
                          <TinyThumb
                            key={r.thumbnailUrl}
                            tinyUrl={r.tinyUrl}
                            thumbnailUrl={r.thumbnailUrl}
                            eager={i < 12}
                          />
                        ) : (
                          <span className="block w-full h-full" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-[family-name:var(--font-display)] text-lg leading-snug truncate">
                          {r.artistName ?? "Unknown artist"}
                        </p>
                        <p className="text-sm truncate">
                          <span className="italic text-text/80">
                            {r.submissionTitle || "Untitled"}
                          </span>
                          <span className="text-text-muted">
                            {" · "}
                            {r.pageCount} {r.pageCount === 1 ? "page" : "pages"}
                          </span>
                        </p>
                      </div>
                      {/* Phones: labels and decisions share one line under the title. */}
                      <div className="col-start-2 sm:col-start-auto min-w-0 flex flex-wrap items-center gap-1.5 sm:contents">
                        <div className="min-w-0 flex flex-wrap gap-1 empty:hidden sm:empty:block">
                          {r.labels.map((l) => (
                            <span
                              key={l.submittableLabelId}
                              className="whitespace-nowrap border border-border px-1.5 py-px text-[11px] text-text-muted"
                            >
                              {l.name}
                            </span>
                          ))}
                        </div>
                        <div className="order-first sm:order-none min-w-0 flex flex-wrap gap-1.5 items-center empty:hidden sm:empty:block">
                          {mineFirst.map((d) => (
                            <DecisionChip
                              key={`${d.reviewerId ?? d.reviewerName}`}
                              reviewerName={d.reviewerName}
                              who={d.reviewerId === reviewer.id ? "You" : firstName(d.reviewerName)}
                              decision={d.decision}
                              pushStatus={d.pushStatus}
                              compact
                            />
                          ))}
                        </div>
                      </div>
                      <span className="hidden sm:block min-w-0 truncate text-sm text-text-muted">
                        {assignedText(r.reviewers, reviewer.id)}
                      </span>
                      {filters.status === "all" && (
                        <span className="hidden sm:block text-xs text-text-muted whitespace-nowrap">
                          {displayStatus(r.officialStatus)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}

function heading(f: QueueFilters, reviewers: { id: string; displayName: string }[]): string {
  const who =
    f.assigned === "me"
      ? "Assigned to you"
      : f.assigned === "all"
        ? "All submissions"
        : f.assigned === "unassigned"
          ? "Unassigned"
          : `Assigned to ${reviewers.find((r) => r.id === f.assigned)?.displayName ?? "reviewer"}`;
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
  statusCounts,
}: {
  filters: QueueFilters;
  assignedToMeTotal: number;
  statusCounts: Record<StatusGroup, number>;
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
          </Link>
          . Assignments refresh from Submittable automatically.
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
  // Matches exist under another status — point there rather than at a reset.
  const elsewhere = STATUS_GROUPS.filter(
    (g) => g.value !== "all" && g.value !== filters.status && statusCounts[g.value] > 0,
  );
  return (
    <div className="mt-10 text-sm text-text-muted space-y-2">
      <p className="text-text">
        No {filters.status === "all" ? "" : `${displayGroup(filters.status)} `}submissions match
        these filters.
      </p>
      {elsewhere.length > 0 && (
        <p>
          {elsewhere.map((g, i) => (
            <span key={g.value}>
              {i > 0 && " · "}
              <Link
                className="underline hover:text-text"
                href={`/submissions${filtersToQuery(filters, { status: g.value })}`}
              >
                {statusCounts[g.value]} {g.label.toLowerCase()}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function displayGroup(g: StatusGroup): string {
  return STATUS_GROUPS.find((x) => x.value === g)?.label.toLowerCase() ?? "";
}

/** Shared by the column heads and the rows so they always line up. */
function ROW_COLS(withStatus: boolean): string {
  return withStatus
    ? "sm:grid-cols-[64px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_6rem]"
    : "sm:grid-cols-[64px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1fr)]";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "You", "Jaden Schoenfeld", "You and Jaden" — you first, never initials. */
function assignedText(reviewers: { id: string; name: string }[], meId: string): string {
  if (reviewers.length === 0) return "Unassigned";
  const me = reviewers.some((r) => r.id === meId);
  const others = reviewers.filter((r) => r.id !== meId);
  if (!me) return others.map((r) => r.name).join(" and ");
  if (others.length === 0) return "You";
  return `You and ${others.map((r) => firstName(r.name)).join(" and ")}`;
}

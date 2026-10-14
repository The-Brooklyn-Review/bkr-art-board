// Reviewer list data: one query for the filtered queue, shared by the list
// page and the detail page's sidebar / next-previous.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { signTiny } from "@/lib/storage/variants";
import { DECIDED_STATUSES, statusGroupOf, type StatusGroup } from "@/lib/submittable/statuses";
import { latestDecisionPerReviewer } from "@/lib/reviewer/decisions";
import { REVIEWER_LABELS } from "@/lib/reviewer/labels";
import {
  CONSIDERATION_LABEL_ID,
  CONSIDERATION_LABEL_IDS,
  CONSIDERATION_NAME,
  canonicalLabelId,
  labelIdsMatching,
} from "@/lib/submittable/consideration";
import type { QueueFilters } from "@/lib/submissions/filters";

/** Labels shown and filterable in the reviewer: the art labels plus Under
 * Consideration (either of its two Submittable labels, see consideration.ts). */
export const FILTER_LABELS = [
  ...REVIEWER_LABELS,
  { submittableLabelId: CONSIDERATION_LABEL_ID, name: CONSIDERATION_NAME },
];
const SHOWN_LABEL_IDS = new Set([
  ...FILTER_LABELS.map((l) => l.submittableLabelId),
  ...CONSIDERATION_LABEL_IDS,
]);

export async function queueWhere(
  f: QueueFilters,
  reviewerId: string | null,
): Promise<Prisma.SubmittableSubmissionWhereInput> {
  const and: Prisma.SubmittableSubmissionWhereInput[] = [];
  switch (f.status) {
    case "undecided":
      and.push({
        OR: [
          { officialStatus: null },
          { officialStatus: { notIn: [...DECIDED_STATUSES, "published"] } },
        ],
      });
      break;
    case "completed":
      and.push({ officialStatus: "completed" });
      break;
    case "accepted":
      and.push({ officialStatus: { in: ["accepted", "published"] } });
      break;
    case "declined":
      and.push({ officialStatus: { in: ["declined", "withdrawn"] } });
      break;
  }
  if (f.assigned === "me") {
    and.push({
      assignments: { some: { reviewerId: reviewerId ?? "00000000-0000-0000-0000-000000000000" } },
    });
  } else if (f.assigned === "unassigned") {
    and.push({ assignments: { none: {} } });
  } else if (f.assigned !== "all") {
    and.push({ assignments: { some: { reviewerId: f.assigned } } });
  }
  for (const id of f.labels) {
    and.push({ labels: { some: { label: { submittableLabelId: { in: labelIdsMatching(id) } } } } });
  }
  const decision = await decisionWhere(f, reviewerId);
  if (decision) and.push(decision);
  // Each word must appear in the artist or the title, so "anna cho" finds
  // "Anna  Cho" (Submittable names often carry double spaces) and word
  // order doesn't matter.
  for (const term of searchTerms(f.q)) {
    and.push({
      OR: [
        { artistName: { contains: term, mode: "insensitive" } },
        { submissionTitle: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

const NO_REVIEWER = "00000000-0000-0000-0000-000000000000";

/**
 * Whose decisions the Decision filter looks at follows the Assigned filter:
 * Me → mine, a reviewer → theirs, Everyone / No one → anyone's (null).
 * Pure — tested.
 */
export function decisionsOf(f: QueueFilters, reviewerId: string | null): string | null {
  if (f.assigned === "me") return reviewerId ?? NO_REVIEWER;
  if (f.assigned === "all" || f.assigned === "unassigned") return null;
  return f.assigned;
}

async function decisionWhere(
  f: QueueFilters,
  reviewerId: string | null,
): Promise<Prisma.SubmittableSubmissionWhereInput | null> {
  if (f.decision === "any") return null;
  const who = decisionsOf(f, reviewerId);
  const byWho = who ? { reviewerId: who } : {};
  if (f.decision === "none") return { decisions: { none: byWho } };
  if (f.decision === "decided") return { decisions: { some: byWho } };
  // A specific decision counts only if it's someone's LATEST one (a changed
  // mind replaces the old decision), which a Prisma relation filter can't
  // express — so find those submissions directly. Grouped per reviewer the
  // same way latestDecisionPerReviewer does it.
  const rows = await prisma.$queryRaw<{ submission_id: string }[]>`
    select distinct submission_id from (
      select distinct on (submission_id, coalesce(reviewer_id::text, 'name:' || lower(trim(reviewer_name))))
        submission_id, reviewer_id, decision
      from review_decisions
      order by submission_id, coalesce(reviewer_id::text, 'name:' || lower(trim(reviewer_name))), created_at desc
    ) latest
    where decision = ${f.decision}
      ${who ? Prisma.sql`and reviewer_id = ${who}::uuid` : Prisma.empty}`;
  return { id: { in: rows.map((r) => r.submission_id) } };
}

/** The words of a search, whitespace collapsed. Pure — tested. */
export function searchTerms(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
}

export interface QueueRow {
  id: string;
  artistName: string | null;
  submissionTitle: string | null;
  officialStatus: string | null;
  labels: { submittableLabelId: string; name: string; color: string | null }[];
  reviewers: { id: string; name: string }[];
  decisions: {
    reviewerId: string | null;
    reviewerName: string;
    decision: string;
    pushStatus: string;
  }[];
  pageCount: number;
  thumbnailUrl: string | null;
  /** Small version of thumbnailUrl for the 64px row; may not exist yet. */
  tinyUrl: string | null;
  processingStatus: string;
}

export async function getQueue(f: QueueFilters, reviewerId: string | null): Promise<QueueRow[]> {
  const rows = await prisma.submittableSubmission.findMany({
    where: await queueWhere(f, reviewerId),
    orderBy: [{ artistName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      artistName: true,
      submissionTitle: true,
      officialStatus: true,
      processingStatus: true,
      thumbnailAsset: { select: { id: true, storagePathThumbnail: true } },
      // Only the fallback cover: the first visible page, else the first page.
      assets: {
        select: { id: true, storagePathThumbnail: true },
        orderBy: [{ visibleInArtLibrary: "desc" }, { fileIndex: "asc" }, { pageNumber: "asc" }],
        take: 1,
      },
      _count: { select: { assets: true } },
      labels: {
        select: { label: { select: { submittableLabelId: true, name: true, color: true } } },
      },
      assignments: { select: { reviewer: { select: { id: true, displayName: true } } } },
      decisions: {
        select: {
          reviewerId: true,
          reviewerName: true,
          decision: true,
          pushStatus: true,
          createdAt: true,
        },
      },
    },
  });

  const nameById = new Map(FILTER_LABELS.map((l) => [l.submittableLabelId, l.name]));
  return Promise.all(
    rows.map(async (r) => {
      const cover = r.thumbnailAsset ?? r.assets[0] ?? null;
      return {
        id: r.id,
        artistName: r.artistName,
        submissionTitle: r.submissionTitle,
        officialStatus: r.officialStatus,
        processingStatus: r.processingStatus,
        labels: r.labels
          .map((l) => l.label)
          .filter((l) => SHOWN_LABEL_IDS.has(l.submittableLabelId))
          .map((l) => {
            const id = canonicalLabelId(l.submittableLabelId);
            return { submittableLabelId: id, name: nameById.get(id) ?? l.name, color: l.color };
          })
          // Consider + Under Consideration would show twice.
          .filter(
            (l, i, all) =>
              all.findIndex((x) => x.submittableLabelId === l.submittableLabelId) === i,
          )
          .sort(
            (a, b) =>
              FILTER_LABELS.findIndex((x) => x.submittableLabelId === a.submittableLabelId) -
              FILTER_LABELS.findIndex((x) => x.submittableLabelId === b.submittableLabelId),
          ),
        reviewers: r.assignments.map((a) => ({ id: a.reviewer.id, name: a.reviewer.displayName })),
        decisions: latestDecisionPerReviewer(r.decisions).map((d) => ({
          reviewerId: d.reviewerId,
          reviewerName: d.reviewerName,
          decision: d.decision,
          pushStatus: d.pushStatus,
        })),
        pageCount: r._count.assets,
        // The regular thumbnail only as an unsigned app link: it's just the
        // fallback for a missing tiny one (a signed URL is ~500 characters,
        // on every row).
        thumbnailUrl: cover ? `/api/assets/${cover.id}/thumb` : null,
        tinyUrl: cover ? await signTiny(cover.storagePathThumbnail) : null,
      };
    }),
  );
}

/**
 * The same list as getQueue, with only what the reviewer page's sidebar and
 * next/previous need — it runs on every J/K step.
 */
export async function getQueueNav(f: QueueFilters, reviewerId: string) {
  const rows = await prisma.submittableSubmission.findMany({
    where: await queueWhere(f, reviewerId),
    orderBy: [{ artistName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      artistName: true,
      submissionTitle: true,
      decisions: {
        where: { reviewerId },
        select: {
          reviewerId: true,
          reviewerName: true,
          decision: true,
          pushStatus: true,
          createdAt: true,
        },
      },
    },
  });
  return rows.map((r) => ({ ...r, decisions: latestDecisionPerReviewer(r.decisions) }));
}

/** Submission counts per status group for the filter, in one query. */
export async function countByStatus(
  f: QueueFilters,
  reviewerId: string,
): Promise<Record<StatusGroup, number>> {
  const groups = await prisma.submittableSubmission.groupBy({
    by: ["officialStatus"],
    where: await queueWhere({ ...f, status: "all" }, reviewerId),
    _count: { _all: true },
  });
  return bucketStatusCounts(groups.map((g) => [g.officialStatus, g._count._all]));
}

/** Pure — tested. Every status falls in exactly one group; "all" is the total. */
export function bucketStatusCounts(
  byStatus: [string | null, number][],
): Record<StatusGroup, number> {
  const counts: Record<StatusGroup, number> = {
    undecided: 0,
    completed: 0,
    accepted: 0,
    declined: 0,
    all: 0,
  };
  for (const [status, n] of byStatus) {
    counts[statusGroupOf(status)] += n;
    counts.all += n;
  }
  return counts;
}

/** Reviewers to offer in the filter and the "Who's reviewing?" picker. */
export async function getReviewers() {
  return prisma.reviewer.findMany({
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      submittableUserId: true,
      _count: { select: { assignments: true } },
    },
  });
}

/**
 * Next/previous for a submission that isn't (or is no longer) in the
 * filtered list — e.g. you just decided it under "Decision: Not decided yet",
 * or opened it from the gallery. Uses the list's own sort key (artist
 * name, then id) so J continues from where you were, not from the top.
 */
export async function neighborsOutside(
  f: QueueFilters,
  reviewerId: string,
  current: { id: string; artistName: string | null },
): Promise<{ prevId: string | null; nextId: string | null }> {
  if (current.artistName === null) return { prevId: null, nextId: null };
  const base = await queueWhere(f, reviewerId);
  const name = current.artistName;
  const [next, prev] = await Promise.all([
    prisma.submittableSubmission.findFirst({
      where: {
        AND: [
          base,
          { OR: [{ artistName: { gt: name } }, { artistName: name, id: { gt: current.id } }] },
        ],
      },
      orderBy: [{ artistName: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    prisma.submittableSubmission.findFirst({
      where: {
        AND: [
          base,
          { OR: [{ artistName: { lt: name } }, { artistName: name, id: { lt: current.id } }] },
        ],
      },
      orderBy: [{ artistName: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
}

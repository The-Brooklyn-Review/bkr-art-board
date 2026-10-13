// Reviewer list data: one query for the filtered queue, shared by the list
// page and the detail page's sidebar / next-previous.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSignedR2Url } from "@/lib/storage/r2";
import { DECIDED_STATUSES } from "@/lib/submittable/statuses";
import { latestDecisionPerReviewer } from "@/lib/reviewer/decisions";
import { REVIEWER_LABELS } from "@/lib/reviewer/labels";
import type { QueueFilters } from "@/lib/submissions/filters";

/** Labels shown and filterable in the reviewer: the 9 art labels plus Consider. */
export const CONSIDER_LABEL_ID = "12f06803-c610-4662-b1a6-ed88be42a8b2";
export const FILTER_LABELS = [
  ...REVIEWER_LABELS,
  { submittableLabelId: CONSIDER_LABEL_ID, name: "Consider" },
];
const SHOWN_LABEL_IDS = new Set(FILTER_LABELS.map((l) => l.submittableLabelId));

export function queueWhere(
  f: QueueFilters,
  reviewerId: string | null,
): Prisma.SubmittableSubmissionWhereInput {
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
    and.push({ labels: { some: { label: { submittableLabelId: id } } } });
  }
  if (f.mine !== "any" && reviewerId) {
    and.push({
      decisions: f.mine === "done" ? { some: { reviewerId } } : { none: { reviewerId } },
    });
  }
  if (f.q) {
    and.push({
      OR: [
        { artistName: { contains: f.q, mode: "insensitive" } },
        { submissionTitle: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
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
  processingStatus: string;
}

export async function getQueue(
  f: QueueFilters,
  reviewerId: string | null,
  withThumbs = true,
): Promise<QueueRow[]> {
  const rows = await prisma.submittableSubmission.findMany({
    where: queueWhere(f, reviewerId),
    orderBy: [{ artistName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      artistName: true,
      submissionTitle: true,
      officialStatus: true,
      processingStatus: true,
      thumbnailAsset: { select: { storagePathThumbnail: true } },
      assets: {
        select: { storagePathThumbnail: true, visibleInArtLibrary: true },
        orderBy: [{ fileIndex: "asc" }, { pageNumber: "asc" }],
      },
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
      const cover =
        r.thumbnailAsset?.storagePathThumbnail ??
        r.assets.find((a) => a.visibleInArtLibrary)?.storagePathThumbnail ??
        r.assets[0]?.storagePathThumbnail ??
        null;
      return {
        id: r.id,
        artistName: r.artistName,
        submissionTitle: r.submissionTitle,
        officialStatus: r.officialStatus,
        processingStatus: r.processingStatus,
        labels: r.labels
          .map((l) => l.label)
          .filter((l) => SHOWN_LABEL_IDS.has(l.submittableLabelId))
          .map((l) => ({
            submittableLabelId: l.submittableLabelId,
            name: nameById.get(l.submittableLabelId) ?? l.name,
            color: l.color,
          }))
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
        pageCount: r.assets.length,
        thumbnailUrl: withThumbs && cover ? await getSignedR2Url(cover) : null,
      };
    }),
  );
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

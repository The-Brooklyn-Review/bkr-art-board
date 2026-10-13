import { prisma } from "@/lib/db";
import { getSignedR2Url } from "@/lib/storage/r2";

export interface ReviewAsset {
  id: string;
  largeUrl: string;
  thumbnailUrl: string;
  assetType: string;
  pageNumber: number | null;
  fileIndex: number | null;
  pageType: string;
  visibleInArtLibrary: boolean;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  submissionFileId: string | null;
}

export interface ReviewFile {
  id: string;
  originalFilename: string | null;
  originalUrl: string;
  pageCount: number;
  processingStatus: string;
  processingError: string | null;
}

export interface ReviewDecisionView {
  id: string;
  reviewerId: string | null;
  reviewerName: string;
  decision: string;
  comment: string | null;
  noteText: string;
  pushStatus: string;
  pushError: string | null;
  createdAt: Date;
}

export interface SubmissionDetail {
  id: string;
  submittableId: string;
  artistName: string | null;
  artistEmail: string | null;
  artistPhone: string | null;
  artistWebsite: string | null;
  submissionTitle: string | null;
  coverLetter: string | null;
  officialStatus: string | null;
  processingStatus: string;
  submittableUrl: string | null;
  thumbnailAssetId: string | null;
  lastSyncedAt: Date | null;
  /** Submittable label IDs currently on the submission. */
  labelIds: string[];
  reviewers: { id: string; name: string }[];
  decisions: ReviewDecisionView[];
  assets: ReviewAsset[];
  files: ReviewFile[];
  /** Prototype-era review state, shown read-only. */
  legacy: {
    recommendation: string;
    notes: { id: string; note: string; createdAt: Date }[];
  };
}

/** Full packet for the Review UI — unlike the Art Library, this INCLUDES
 * hidden pages, since reviewing (and un-hiding) the full submission is
 * exactly this page's job. */
export async function getSubmission(id: string): Promise<SubmissionDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const submission = await prisma.submittableSubmission.findUnique({
    where: { id },
    include: {
      labels: { include: { label: true } },
      assets: {
        include: { submissionFile: true },
        orderBy: [{ fileIndex: "asc" }, { pageNumber: "asc" }],
      },
      files: { include: { _count: { select: { assets: true } } }, orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" } },
      assignments: { include: { reviewer: true } },
      decisions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!submission) return null;

  const webBase = process.env.SUBMITTABLE_WEB_BASE_URL;

  const [assets, files] = await Promise.all([
    Promise.all(
      submission.assets.map(async (asset) => ({
        id: asset.id,
        largeUrl: await getSignedR2Url(asset.storagePathLarge),
        thumbnailUrl: await getSignedR2Url(asset.storagePathThumbnail),
        assetType: asset.assetType,
        pageNumber: asset.pageNumber,
        fileIndex: asset.fileIndex,
        pageType: asset.pageType,
        visibleInArtLibrary: asset.visibleInArtLibrary,
        width: asset.width,
        height: asset.height,
        originalFilename: asset.submissionFile?.originalFilename ?? null,
        submissionFileId: asset.submissionFileId,
      })),
    ),
    Promise.all(
      submission.files.map(async (f) => ({
        id: f.id,
        originalFilename: f.originalFilename,
        originalUrl: await getSignedR2Url(f.storagePathOriginal),
        pageCount: f._count.assets,
        processingStatus: f.processingStatus,
        processingError: f.processingError,
      })),
    ),
  ]);

  return {
    id: submission.id,
    submittableId: submission.submittableId,
    artistName: submission.artistName,
    artistEmail: submission.artistEmail,
    artistPhone: submission.artistPhone,
    artistWebsite: submission.artistWebsite,
    submissionTitle: submission.submissionTitle,
    coverLetter: submission.coverLetter,
    officialStatus: submission.officialStatus,
    processingStatus: submission.processingStatus,
    submittableUrl: webBase ? `${webBase}/submissions/${submission.submittableId}` : null,
    thumbnailAssetId: submission.thumbnailAssetId,
    lastSyncedAt: submission.lastSyncedAt,
    labelIds: submission.labels.map((l) => l.label.submittableLabelId),
    reviewers: submission.assignments.map((a) => ({
      id: a.reviewer.id,
      name: a.reviewer.displayName,
    })),
    decisions: submission.decisions.map((d) => ({
      id: d.id,
      reviewerId: d.reviewerId,
      reviewerName: d.reviewerName,
      decision: d.decision,
      comment: d.comment,
      noteText: d.noteText,
      pushStatus: d.pushStatus,
      pushError: d.pushError,
      createdAt: d.createdAt,
    })),
    assets,
    files,
    legacy: {
      recommendation: submission.localReviewRecommendation,
      notes: submission.notes.map((n) => ({ id: n.id, note: n.note, createdAt: n.createdAt })),
    },
  };
}

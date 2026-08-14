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
  localReviewRecommendation: string;
  needsSubmittableUpdate: boolean;
  submittableUpdateDone: boolean;
  syncStatus: string;
  processingStatus: string;
  submittableUrl: string | null;
  labels: { name: string; color: string | null }[];
  assets: ReviewAsset[];
  notes: { id: string; note: string; createdAt: Date }[];
}

/** Full packet for the Review UI — unlike the Art Library, this INCLUDES
 * hidden pages, since reviewing (and un-hiding) the full submission is
 * exactly this page's job. */
export async function getSubmission(id: string): Promise<SubmissionDetail | null> {
  const submission = await prisma.submittableSubmission.findUnique({
    where: { id },
    include: {
      labels: { include: { label: true } },
      assets: {
        include: { submissionFile: true },
        orderBy: [{ fileIndex: "asc" }, { pageNumber: "asc" }],
      },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!submission) return null;

  const webBase = process.env.SUBMITTABLE_WEB_BASE_URL;

  const assets = await Promise.all(
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
    })),
  );

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
    localReviewRecommendation: submission.localReviewRecommendation,
    needsSubmittableUpdate: submission.needsSubmittableUpdate,
    submittableUpdateDone: submission.submittableUpdateDone,
    syncStatus: submission.syncStatus,
    processingStatus: submission.processingStatus,
    submittableUrl: webBase ? `${webBase}/submissions/${submission.submittableId}` : null,
    labels: submission.labels.map((l) => ({ name: l.label.name, color: l.label.color })),
    assets,
    notes: submission.notes,
  };
}

export interface SubmissionQueueItem {
  id: string;
  artistName: string | null;
  submissionTitle: string | null;
  localReviewRecommendation: string;
}

export async function getSubmissionsQueue(): Promise<SubmissionQueueItem[]> {
  return prisma.submittableSubmission.findMany({
    where: { processingStatus: "processed" },
    select: { id: true, artistName: true, submissionTitle: true, localReviewRecommendation: true },
    orderBy: { artistName: "asc" },
  });
}

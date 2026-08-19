"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Every mutation here is local-only — never touches Submittable. This app
 * stays read/import-focused against the official system; all review state
 * (recommendations, visibility, notes, thumbnails) lives only in this app's
 * own DB (see prisma/schema.prisma's "Local review state" tier). Most
 * mutations also write a ReviewAction audit row — setNeedsSubmittableUpdate
 * is the one exception, left unaudited as a frequently-toggled flag.
 */

export type LocalReviewRecommendation =
  "accept" | "consider_or_delayed_accept" | "tiered_reject" | "reject" | "unreviewed";

export type PageType = "artwork" | "cover_statement" | "cv_bio" | "contact_sheet" | "unknown";

export async function setAssetVisibility(assetId: string, visible: boolean) {
  const asset = await prisma.artAsset.findUniqueOrThrow({ where: { id: assetId } });

  await prisma.$transaction([
    prisma.artAsset.update({ where: { id: assetId }, data: { visibleInArtLibrary: visible } }),
    prisma.reviewAction.create({
      data: {
        submissionId: asset.submissionId,
        artAssetId: assetId,
        actionType: "visibility_changed",
        previousValue: { visibleInArtLibrary: asset.visibleInArtLibrary },
        newValue: { visibleInArtLibrary: visible },
      },
    }),
  ]);

  revalidatePath("/art-library");
  revalidatePath(`/submissions/${asset.submissionId}`);
}

export async function setSubmissionThumbnail(submissionId: string, assetId: string) {
  const submission = await prisma.submittableSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });

  // Server Actions are a network entry point — a stale or malformed client
  // request could otherwise assign a DIFFERENT submission's asset as this
  // one's thumbnail with no error at all.
  await prisma.artAsset.findFirstOrThrow({ where: { id: assetId, submissionId } });

  await prisma.$transaction([
    prisma.submittableSubmission.update({
      where: { id: submissionId },
      data: { thumbnailAssetId: assetId },
    }),
    prisma.reviewAction.create({
      data: {
        submissionId,
        artAssetId: assetId,
        actionType: "thumbnail_changed",
        previousValue: { thumbnailAssetId: submission.thumbnailAssetId },
        newValue: { thumbnailAssetId: assetId },
      },
    }),
  ]);

  revalidatePath("/art-library");
  revalidatePath(`/submissions/${submissionId}`);
}

export async function setPageType(assetId: string, pageType: PageType) {
  const asset = await prisma.artAsset.findUniqueOrThrow({ where: { id: assetId } });

  await prisma.$transaction([
    prisma.artAsset.update({ where: { id: assetId }, data: { pageType } }),
    prisma.reviewAction.create({
      data: {
        submissionId: asset.submissionId,
        artAssetId: assetId,
        actionType: "page_type_changed",
        previousValue: { pageType: asset.pageType },
        newValue: { pageType },
      },
    }),
  ]);

  revalidatePath("/art-library");
  revalidatePath(`/submissions/${asset.submissionId}`);
}

export async function setLocalRecommendation(
  submissionId: string,
  recommendation: LocalReviewRecommendation,
) {
  const submission = await prisma.submittableSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });

  await prisma.$transaction([
    prisma.submittableSubmission.update({
      where: { id: submissionId },
      data: { localReviewRecommendation: recommendation },
    }),
    prisma.reviewAction.create({
      data: {
        submissionId,
        actionType: "recommendation_changed",
        previousValue: { localReviewRecommendation: submission.localReviewRecommendation },
        newValue: { localReviewRecommendation: recommendation },
      },
    }),
  ]);

  revalidatePath(`/submissions/${submissionId}`);
}

export async function addReviewNote(submissionId: string, note: string) {
  if (!note.trim()) return;

  await prisma.$transaction([
    prisma.reviewNote.create({ data: { submissionId, note: note.trim() } }),
    prisma.reviewAction.create({
      data: { submissionId, actionType: "note_added", newValue: { note: note.trim() } },
    }),
  ]);

  revalidatePath(`/submissions/${submissionId}`);
}

export async function setNeedsSubmittableUpdate(submissionId: string, needsUpdate: boolean) {
  await prisma.submittableSubmission.update({
    where: { id: submissionId },
    data: { needsSubmittableUpdate: needsUpdate },
  });
  revalidatePath(`/submissions/${submissionId}`);
}

export async function markSubmittableUpdateDone(submissionId: string) {
  await prisma.$transaction([
    prisma.submittableSubmission.update({
      where: { id: submissionId },
      data: {
        submittableUpdateDone: true,
        needsSubmittableUpdate: false,
        submittableUpdateDoneAt: new Date(),
      },
    }),
    prisma.reviewAction.create({
      data: { submissionId, actionType: "submittable_update_marked_done" },
    }),
  ]);
  revalidatePath(`/submissions/${submissionId}`);
}

export async function markAssetPublished(assetId: string) {
  try {
    const asset = await prisma.artAsset.findUniqueOrThrow({ where: { id: assetId } });

    await prisma.$transaction([
      prisma.artAsset.update({
        where: { id: assetId },
        data: { usedState: "published", visibleInArtLibrary: false },
      }),
      prisma.reviewAction.create({
        data: {
          submissionId: asset.submissionId,
          artAssetId: assetId,
          actionType: "asset_published",
          previousValue: { usedState: asset.usedState, visibleInArtLibrary: asset.visibleInArtLibrary },
          newValue: { usedState: "published", visibleInArtLibrary: false },
        },
      }),
    ]);

    revalidatePath(`/submissions/${asset.submissionId}`);
  } catch (error) {
    console.error("[markAssetPublished] Error:", {
      assetId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

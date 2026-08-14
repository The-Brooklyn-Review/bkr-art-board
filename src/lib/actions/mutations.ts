"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Every mutation here is local-only — never touches Submittable. Per plan
 * §22, v1 stays read/import-focused against the official system; all
 * review state (recommendations, visibility, notes, thumbnails) lives only
 * in this app's DB. Each mutation writes a ReviewAction audit row too,
 * matching the plan's schema design (§12.7).
 */

export type LocalReviewRecommendation =
  | "accept"
  | "consider_or_delayed_accept"
  | "tiered_reject"
  | "reject"
  | "unreviewed";

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

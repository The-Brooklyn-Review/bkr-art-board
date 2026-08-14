/**
 * The full importer. For each submission: fetch entries, download every
 * uploaded file, render PDFs to pages, classify + crop + thumbnail each
 * page, upload everything to R2, and write it all to the DB.
 *
 * Two-stage pipeline — run dry-run.ts first. This script reads the
 * submission list and labels from fixtures/submissions-matching.json and
 * fixtures/labels.json (written by dry-run.ts), not from a live API list
 * call — only per-file downloads below hit the live Submittable API
 * directly. For a new submission cycle, re-run dry-run.ts (with updated
 * ART_LIBRARY_* env vars) to regenerate those fixtures before running this.
 *
 * A failure at any stage for one submission or one file is caught, logged,
 * and recorded in the DB (sync_status/processing_status = 'error' with the
 * real error message) — it never aborts the batch. See the final summary
 * printed at the end for a full list of what failed and why.
 *
 * Idempotent per file: re-running replaces that file's assets rather than
 * duplicating them. Rendering/classifying/cropping happens entirely
 * in-memory first (see prepareAssets below); the old assets aren't touched
 * until that's fully succeeded, so a failure partway through a file leaves
 * its previous assets exactly as they were, not partially replaced.
 *
 * Run:
 *   npx tsx scripts/process-submission.ts <submissionId> [submissionId...]
 *   npx tsx scripts/process-submission.ts --all
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import { uploadToR2 } from "@/lib/storage/r2";
import { renderPdfPages, extractPdfPagesText } from "@/lib/processing/pdf";
import { classifyPage } from "@/lib/processing/classify";
import { extractArtworkRegion } from "@/lib/processing/crop";
import { submittableFetch } from "@/lib/submittable/client";
import type { EntriesResponse } from "@/lib/submittable/types";

const FIXTURES_DIR = resolve(process.cwd(), "fixtures");

type SubmissionListItem = {
  submissionId: string;
  projectId: string;
  submissionStatus: string;
  labels: string[];
  submitterFirstName: string;
  submitterLastName: string;
  submitterEmail: string;
  submissionTitle: string;
  projectTitle: string;
};

type LabelRecord = {
  labelId: string;
  name: string;
  backgroundColor: string | null;
};

const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|tiff?)$/i;

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8"));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function ensureLabels(labelIds: string[]) {
  const allLabels = loadFixture<LabelRecord[]>("labels.json");
  const byId = new Map(allLabels.map((l) => [l.labelId, l]));

  for (const id of labelIds) {
    const label = byId.get(id);
    if (!label) {
      console.warn(`   ⚠ label ${id} not found in fixtures/labels.json, skipping`);
      continue;
    }
    await prisma.submittableLabel.upsert({
      where: { submittableLabelId: label.labelId },
      update: { name: label.name, color: label.backgroundColor, rawJson: label },
      create: {
        submittableLabelId: label.labelId,
        name: label.name,
        color: label.backgroundColor,
        rawJson: label,
      },
    });
  }
}

async function downloadFile(entryId: string, fileId: string): Promise<Buffer> {
  const { url } = await submittableFetch<{ url: string }>(`/v4/entries/${entryId}/files/${fileId}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`File download failed: HTTP ${res.status} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function processImageVariants(sourceBuffer: Buffer, isArtwork: boolean) {
  const full = await sharp(sourceBuffer)
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  // extractArtworkRegion separates the dense artwork band from any sparse
  // caption text below it (title/year/medium), then trims — a plain trim()
  // alone would keep the caption since it's non-white too. See
  // src/lib/processing/crop.ts.
  const thumbSource = isArtwork ? await extractArtworkRegion(sourceBuffer) : sourceBuffer;
  const thumb = await sharp(thumbSource)
    .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const thumbMeta = await sharp(thumb).metadata();

  return {
    full,
    thumb,
    width: thumbMeta.width ?? null,
    height: thumbMeta.height ?? null,
    aspectRatio: thumbMeta.width && thumbMeta.height ? thumbMeta.width / thumbMeta.height : null,
  };
}

/** A fully rendered/classified/cropped asset, ready to upload + persist —
 * nothing external (R2, DB) has been touched yet to produce this. */
export type PreparedAsset = {
  assetType: "pdf_page" | "uploaded_image";
  pageNumber: number | null;
  largeKey: string;
  largeBuffer: Buffer;
  thumbKey: string;
  thumbBuffer: Buffer;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  extractedText: string | null;
  pageType: string;
  visibleInArtLibrary: boolean;
  debug: {
    whiteRatio: number;
    blackRatio: number;
    midtoneRatio: number;
    colorfulRatio: number;
  } | null;
};

/**
 * Renders/classifies/crops every page or image for one file, entirely
 * in-memory. Throws on the first failure (a bad page, a sharp error) with
 * nothing written anywhere — the caller can retry freely since this step
 * has no side effects to unwind.
 */
async function prepareAssets(
  submissionId: string,
  file: { fileId: string; fileName: string },
  buffer: Buffer,
): Promise<PreparedAsset[]> {
  if (PDF_EXT.test(file.fileName)) {
    console.log(`    rendering PDF pages…`);
    const [pages, pageTexts] = await Promise.all([
      renderPdfPages(buffer),
      extractPdfPagesText(buffer).catch((err) => {
        console.warn(`    ⚠ text extraction failed: ${errorMessage(err)}`);
        return [] as string[];
      }),
    ]);
    console.log(`    ✓ ${pages.length} page(s) rendered`);

    const prepared: PreparedAsset[] = [];
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const pageBuffer = pages[pageNum];
      const { pageType, visibleInArtLibrary, debug } = await classifyPage(pageBuffer);
      const variants = await processImageVariants(pageBuffer, pageType === "artwork");
      console.log(
        `    page ${pageNum + 1}: ${pageType} (visible=${visibleInArtLibrary}) whiteRatio=${debug.whiteRatio.toFixed(2)}`,
      );
      prepared.push({
        assetType: "pdf_page",
        pageNumber: pageNum + 1,
        largeKey: `submittable/${submissionId}/rendered/${file.fileId}/page-${pageNum + 1}-full.webp`,
        largeBuffer: variants.full,
        thumbKey: `submittable/${submissionId}/rendered/${file.fileId}/page-${pageNum + 1}-thumb.webp`,
        thumbBuffer: variants.thumb,
        width: variants.width,
        height: variants.height,
        aspectRatio: variants.aspectRatio,
        extractedText: pageTexts[pageNum] || null,
        pageType,
        visibleInArtLibrary,
        debug,
      });
    }
    return prepared;
  }

  if (IMAGE_EXT.test(file.fileName)) {
    console.log(`    processing as uploaded image…`);
    const variants = await processImageVariants(buffer, true);
    return [
      {
        assetType: "uploaded_image",
        pageNumber: null,
        largeKey: `submittable/${submissionId}/rendered/${file.fileId}/image-full.webp`,
        largeBuffer: variants.full,
        thumbKey: `submittable/${submissionId}/rendered/${file.fileId}/image-thumb.webp`,
        thumbBuffer: variants.thumb,
        width: variants.width,
        height: variants.height,
        aspectRatio: variants.aspectRatio,
        extractedText: null,
        pageType: "artwork",
        visibleInArtLibrary: true,
        debug: null,
      },
    ];
  }

  throw new Error(`Unsupported file type: ${file.fileName}`);
}

/**
 * Uploads every prepared asset to R2, then swaps this file's old ArtAsset
 * rows for new ones inside a single Prisma transaction — deleting the old
 * rows, creating the new ones, and (best-effort) re-pointing a curator-
 * selected thumbnail to its replacement. Marks the file "processed" on
 * success, or "error" (with the real message) on failure anywhere in this
 * sequence — upload, transaction, or the final status update itself.
 *
 * NOT atomic across R2 and Postgres — that would need a two-phase commit or
 * an outbox pattern, real complexity this internal, admin-triggered,
 * freely-retryable script doesn't warrant. R2 uploads happen first, to
 * these files' own stable per-page keys. If they succeed but the
 * transaction then fails, the OLD rows survive (so nothing is lost or
 * inaccessible), but they now describe metadata — dimensions,
 * classification, visibility, extracted text — for images that have
 * already been overwritten with the NEW render. The images themselves are
 * always correct; only the description of them can trail behind until the
 * file is reprocessed successfully. Re-running is always safe either way:
 * uploads are idempotent overwrites, and the transaction only ever touches
 * this one file's rows.
 */
export async function replaceFileAssets(
  submissionDbId: string,
  submissionFile: { id: string },
  prepared: PreparedAsset[],
  fileIndex: number,
): Promise<void> {
  try {
    for (const asset of prepared) {
      await uploadToR2(asset.largeKey, asset.largeBuffer, "image/webp");
      await uploadToR2(asset.thumbKey, asset.thumbBuffer, "image/webp");
    }

    // A curator-picked thumbnail pointing at one of this file's OLD assets
    // needs to survive the swap below. fk_thumbnail_asset is
    // ON DELETE SET NULL (verified against the live DB — see
    // prisma/schema.prisma), so deleting that old asset just clears the
    // reference rather than failing; without this, every reprocess would
    // silently drop a curator's thumbnail choice. Matched by page position,
    // not asset ID, since the old asset is gone and the new one has a
    // freshly generated ID.
    const submission = await prisma.submittableSubmission.findUniqueOrThrow({
      where: { id: submissionDbId },
      select: { thumbnailAssetId: true },
    });
    const oldThumbnailAsset = submission.thumbnailAssetId
      ? await prisma.artAsset.findFirst({
          where: { id: submission.thumbnailAssetId, submissionFileId: submissionFile.id },
          select: { pageNumber: true },
        })
      : null;

    let thumbnailCleared = false;

    // The interactive (callback) form, not the array form used elsewhere in
    // this codebase — re-pointing the thumbnail needs each new asset's
    // generated id, which only exists once its `create` has actually run.
    await prisma.$transaction(async (tx) => {
      await tx.artAsset.deleteMany({ where: { submissionFileId: submissionFile.id } });

      const created = await Promise.all(
        prepared.map((asset) =>
          tx.artAsset.create({
            data: {
              submissionId: submissionDbId,
              submissionFileId: submissionFile.id,
              assetType: asset.assetType,
              pageNumber: asset.pageNumber,
              fileIndex,
              storagePathLarge: asset.largeKey,
              storagePathThumbnail: asset.thumbKey,
              width: asset.width,
              height: asset.height,
              aspectRatio: asset.aspectRatio,
              extractedText: asset.extractedText,
              pageType: asset.pageType,
              visibleInArtLibrary: asset.visibleInArtLibrary,
              rawProcessingJson: asset.debug ?? undefined,
            },
          }),
        ),
      );

      if (oldThumbnailAsset) {
        const replacement = created.find((a) => a.pageNumber === oldThumbnailAsset.pageNumber);
        if (replacement) {
          await tx.submittableSubmission.update({
            where: { id: submissionDbId },
            data: { thumbnailAssetId: replacement.id },
          });
        } else {
          thumbnailCleared = true;
        }
      }
    });

    if (thumbnailCleared) {
      console.warn(
        `    ⚠ thumbnail selection cleared — no replacement asset at the same page position`,
      );
    }

    await prisma.submissionFile.update({
      where: { id: submissionFile.id },
      data: { processingStatus: "processed" },
    });
  } catch (err) {
    await prisma.submissionFile.update({
      where: { id: submissionFile.id },
      data: { processingStatus: "error", processingError: errorMessage(err) },
    });
    throw err;
  }
}

/** Processes one file's pages/image. Throws on failure — caller decides how to record it. */
async function processFile(
  submissionDbId: string,
  submissionId: string,
  entryId: string,
  file: { fileId: string; fileName: string; fileSizeBytes: number },
  fileIndex: number,
): Promise<number> {
  console.log(`    downloading…`);
  const buffer = await downloadFile(entryId, file.fileId);
  console.log(`    ✓ ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

  const originalKey = `submittable/${submissionId}/originals/${file.fileId}-${file.fileName}`;
  await uploadToR2(originalKey, buffer, "application/octet-stream");
  console.log(`    ✓ uploaded original to R2`);

  const submissionFile = await prisma.submissionFile.upsert({
    where: {
      submissionId_entryId_fileId: { submissionId: submissionDbId, entryId, fileId: file.fileId },
    },
    update: {
      originalFilename: file.fileName,
      fileSizeBytes: BigInt(file.fileSizeBytes ?? buffer.length),
      storagePathOriginal: originalKey,
      downloadedAt: new Date(),
      processingStatus: "processing",
      processingError: null,
      rawFileJson: file,
    },
    create: {
      submissionId: submissionDbId,
      entryId,
      fileId: file.fileId,
      originalFilename: file.fileName,
      fileSizeBytes: BigInt(file.fileSizeBytes ?? buffer.length),
      storagePathOriginal: originalKey,
      downloadedAt: new Date(),
      processingStatus: "processing",
      rawFileJson: file,
    },
  });

  // Render/classify/crop everything FIRST, fully in-memory. This is where
  // failures are most likely (a bad page, a sharp error) — if any of it
  // throws, nothing below has run yet, so this file's existing assets are
  // completely untouched and the run is freely retryable. Previously the
  // old assets were deleted up front, before any of this risky work even
  // started — a failure on page 3 of 5 would leave the file with fewer
  // assets than before the retry, not the same or better.
  let prepared: PreparedAsset[];
  try {
    prepared = await prepareAssets(submissionId, file, buffer);
  } catch (err) {
    await prisma.submissionFile.update({
      where: { id: submissionFile.id },
      data: { processingStatus: "error", processingError: errorMessage(err) },
    });
    throw err;
  }

  await replaceFileAssets(submissionDbId, submissionFile, prepared, fileIndex);
  return prepared.length;
}

type SubmissionResult = {
  submissionId: string;
  artistName: string;
  status: "success" | "partial" | "failed";
  assetCount: number;
  fileErrors: string[];
  fatalError?: string;
};

async function processSubmission(submissionId: string): Promise<SubmissionResult> {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`Processing submission ${submissionId}`);
  console.log("─".repeat(70));

  const allMatching = loadFixture<SubmissionListItem[]>("submissions-matching.json");
  const summary = allMatching.find((s) => s.submissionId === submissionId);
  if (!summary) {
    const msg = `Not found in fixtures/submissions-matching.json — re-run dry-run.ts first`;
    console.error(`  ✗ ${msg}`);
    return {
      submissionId,
      artistName: "?",
      status: "failed",
      assetCount: 0,
      fileErrors: [],
      fatalError: msg,
    };
  }

  const artistName = `${summary.submitterFirstName} ${summary.submitterLastName}`;
  console.log(`  Artist: ${artistName}`);
  console.log(`  Title:  ${summary.submissionTitle}`);

  // Upsert a minimal row up front so this submission is trackable/retryable
  // even if everything after this point fails.
  let submission = await prisma.submittableSubmission.upsert({
    where: { submittableId: submissionId },
    update: { syncStatus: "pending" },
    create: {
      submittableId: submissionId,
      officialStatus: summary.submissionStatus,
      artistName,
      artistEmail: summary.submitterEmail,
      submissionTitle: summary.submissionTitle,
      projectName: summary.projectTitle,
      projectId: summary.projectId,
      rawSubmissionJson: summary,
      syncStatus: "pending",
      processingStatus: "pending",
    },
  });

  let entries: EntriesResponse;
  try {
    console.log("\n[1] Fetching entries…");
    entries = await submittableFetch<EntriesResponse>(`/v4/entries/submissions/${submissionId}`);
    const initialEntryCheck = entries.formEntries.find((fe) => fe.formType === "initial");
    if (!initialEntryCheck) throw new Error("No initial-form entry found");
    console.log(
      `  ✓ entryId=${initialEntryCheck.entry.entryId}, ${initialEntryCheck.entry.fieldData.length} fields`,
    );

    console.log("\n[2] Ensuring labels exist…");
    await ensureLabels(summary.labels);

    // Cover letter / artist statement: no submission we've seen carries a
    // dedicated fieldType for this — it's just a `long_answer` field.
    // Concatenate all of them in case a form has more than one.
    const coverLetter =
      initialEntryCheck.entry.fieldData
        .filter((f) => f.fieldType === "long_answer" && f.value)
        .map((f) => f.value)
        .join("\n\n") || null;

    submission = await prisma.submittableSubmission.update({
      where: { id: submission.id },
      data: {
        officialStatus: summary.submissionStatus,
        artistName,
        artistEmail: summary.submitterEmail,
        submissionTitle: summary.submissionTitle,
        coverLetter,
        projectName: summary.projectTitle,
        projectId: summary.projectId,
        rawSubmissionJson: summary,
        // Prisma's JSON input type requires a plain index-signature-shaped
        // object; EntriesResponse is a proper `interface`, which TypeScript
        // doesn't structurally treat as one. Round-tripping through
        // JSON.stringify (which is what this data does on the way into a
        // Json column regardless) produces a plain object that satisfies it.
        rawEntriesJson: JSON.parse(JSON.stringify(entries)),
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        processingStatus: "processing",
        processingError: null,
      },
    });

    for (const labelId of summary.labels) {
      const label = await prisma.submittableLabel.findUnique({
        where: { submittableLabelId: labelId },
      });
      if (!label) continue;
      await prisma.submissionLabel.upsert({
        where: { submissionId_labelId: { submissionId: submission.id, labelId: label.id } },
        update: {},
        create: { submissionId: submission.id, labelId: label.id, source: "submittable" },
      });
    }
    console.log(`  ✓ submission row id=${submission.id}`);
  } catch (err) {
    const msg = errorMessage(err);
    console.error(`  ✗ FATAL for this submission: ${msg}`);
    await prisma.submittableSubmission.update({
      where: { id: submission.id },
      data: { syncStatus: "error", processingStatus: "error", processingError: msg },
    });
    return {
      submissionId,
      artistName,
      status: "failed",
      assetCount: 0,
      fileErrors: [],
      fatalError: msg,
    };
  }

  const initialEntry = entries.formEntries.find((fe) => fe.formType === "initial")!.entry;
  const fileFields = initialEntry.fieldData.filter((f) => f.fieldType === "file_upload");
  const allFiles = fileFields.flatMap((f) => f.files ?? []);
  console.log(`\n[3] Found ${allFiles.length} uploaded file(s)`);

  let assetCount = 0;
  const fileErrors: string[] = [];

  for (let fileIndex = 0; fileIndex < allFiles.length; fileIndex++) {
    const file = allFiles[fileIndex];
    console.log(`\n  File ${fileIndex + 1}/${allFiles.length}: ${file.fileName}`);
    try {
      assetCount += await processFile(
        submission.id,
        submissionId,
        initialEntry.entryId,
        file,
        fileIndex,
      );
    } catch (err) {
      const msg = errorMessage(err);
      console.error(`    ✗ FILE FAILED: ${msg}`);
      fileErrors.push(`${file.fileName}: ${msg}`);
    }
  }

  const status: SubmissionResult["status"] =
    fileErrors.length === 0 ? "success" : assetCount > 0 ? "partial" : "failed";

  await prisma.submittableSubmission.update({
    where: { id: submission.id },
    data: {
      processingStatus: status === "failed" ? "error" : "processed",
      processingError: fileErrors.length > 0 ? fileErrors.join("; ") : null,
    },
  });

  console.log(
    `\n  ${status === "success" ? "✓" : "⚠"} DONE (${status}): ${assetCount} asset(s), ${fileErrors.length} file error(s)`,
  );
  return { submissionId, artistName, status, assetCount, fileErrors };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: npx tsx scripts/process-submission.ts <submissionId> [submissionId...] | --all",
    );
    process.exit(1);
  }

  const submissionIds =
    args[0] === "--all"
      ? loadFixture<SubmissionListItem[]>("submissions-matching.json").map((s) => s.submissionId)
      : args;

  console.log(`Processing ${submissionIds.length} submission(s)…`);

  const results: SubmissionResult[] = [];
  for (let i = 0; i < submissionIds.length; i++) {
    console.log(`\n[${i + 1}/${submissionIds.length}]`);
    results.push(await processSubmission(submissionIds[i]));
  }

  const succeeded = results.filter((r) => r.status === "success");
  const partial = results.filter((r) => r.status === "partial");
  const failed = results.filter((r) => r.status === "failed");
  const totalAssets = results.reduce((sum, r) => sum + r.assetCount, 0);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`IMPORT SUMMARY`);
  console.log("═".repeat(70));
  console.log(`Total submissions:  ${results.length}`);
  console.log(`  Fully succeeded:  ${succeeded.length}`);
  console.log(`  Partial (some file errors): ${partial.length}`);
  console.log(`  Failed entirely:  ${failed.length}`);
  console.log(`Total art assets created: ${totalAssets}`);

  if (partial.length > 0) {
    console.log(`\nPartial failures:`);
    for (const r of partial) {
      console.log(`  - ${r.artistName} (${r.submissionId}): ${r.fileErrors.join("; ")}`);
    }
  }
  if (failed.length > 0) {
    console.log(`\nFull failures:`);
    for (const r of failed) {
      console.log(
        `  - ${r.artistName} (${r.submissionId}): ${r.fatalError ?? r.fileErrors.join("; ")}`,
      );
    }
  }
  console.log("═".repeat(70));
}

// Only run when executed directly (`npx tsx scripts/process-submission.ts`),
// not when imported — e.g. by process-submission.test.ts, which exercises
// replaceFileAssets in isolation with prisma/uploadToR2 mocked and can't
// have this kick off a real run against the live API/DB as a side effect
// of the import alone.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("\n✗ SCRIPT-LEVEL FAILURE (bug, not a per-submission issue):", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

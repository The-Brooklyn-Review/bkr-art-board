/**
 * Full importer (Phase 3). For each submission: fetch entries, download
 * every uploaded file, render PDFs to pages, classify + crop + thumbnail
 * each page, upload everything to R2, and write it all to the DB.
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
 * duplicating them (see the deleteMany before asset creation below).
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

import { prisma } from "../src/lib/db/index.ts";
import { uploadToR2 } from "../src/lib/storage/r2.ts";
import { renderPdfPages, extractPdfPagesText } from "../src/lib/processing/pdf.ts";
import { classifyPage } from "../src/lib/processing/classify.ts";
import { extractArtworkRegion } from "../src/lib/processing/crop.ts";
import { submittableFetch } from "../src/lib/submittable/client.ts";
import type { EntriesResponse } from "../src/lib/submittable/types.ts";

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

  // Idempotency: a re-run (retry, or re-processing with an improved
  // pipeline) must replace this file's assets, not pile up duplicates.
  await prisma.artAsset.deleteMany({ where: { submissionFileId: submissionFile.id } });

  let assetCount = 0;

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

    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const pageBuffer = pages[pageNum];
      const { pageType, visibleInArtLibrary, debug } = await classifyPage(pageBuffer);
      const variants = await processImageVariants(pageBuffer, pageType === "artwork");

      const largeKey = `submittable/${submissionId}/rendered/${file.fileId}/page-${pageNum + 1}-full.webp`;
      const thumbKey = `submittable/${submissionId}/rendered/${file.fileId}/page-${pageNum + 1}-thumb.webp`;
      await uploadToR2(largeKey, variants.full, "image/webp");
      await uploadToR2(thumbKey, variants.thumb, "image/webp");

      await prisma.artAsset.create({
        data: {
          submissionId: submissionDbId,
          submissionFileId: submissionFile.id,
          assetType: "pdf_page",
          pageNumber: pageNum + 1,
          fileIndex,
          storagePathLarge: largeKey,
          storagePathThumbnail: thumbKey,
          width: variants.width,
          height: variants.height,
          aspectRatio: variants.aspectRatio,
          extractedText: pageTexts[pageNum] || null,
          pageType,
          visibleInArtLibrary,
          rawProcessingJson: debug,
        },
      });
      assetCount++;
      console.log(
        `    page ${pageNum + 1}: ${pageType} (visible=${visibleInArtLibrary}) whiteRatio=${debug.whiteRatio.toFixed(2)}`,
      );
    }
  } else if (IMAGE_EXT.test(file.fileName)) {
    console.log(`    processing as uploaded image…`);
    const variants = await processImageVariants(buffer, true);
    const largeKey = `submittable/${submissionId}/rendered/${file.fileId}/image-full.webp`;
    const thumbKey = `submittable/${submissionId}/rendered/${file.fileId}/image-thumb.webp`;
    await uploadToR2(largeKey, variants.full, "image/webp");
    await uploadToR2(thumbKey, variants.thumb, "image/webp");

    await prisma.artAsset.create({
      data: {
        submissionId: submissionDbId,
        submissionFileId: submissionFile.id,
        assetType: "uploaded_image",
        fileIndex,
        storagePathLarge: largeKey,
        storagePathThumbnail: thumbKey,
        width: variants.width,
        height: variants.height,
        aspectRatio: variants.aspectRatio,
        pageType: "artwork",
        visibleInArtLibrary: true,
      },
    });
    assetCount++;
    console.log(`    ✓ 1 image asset created`);
  } else {
    await prisma.submissionFile.update({
      where: { id: submissionFile.id },
      data: { processingStatus: "error", processingError: "Unsupported file type" },
    });
    throw new Error(`Unsupported file type: ${file.fileName}`);
  }

  await prisma.submissionFile.update({
    where: { id: submissionFile.id },
    data: { processingStatus: "processed" },
  });
  return assetCount;
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
        rawEntriesJson: entries,
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

main()
  .catch((err) => {
    console.error("\n✗ SCRIPT-LEVEL FAILURE (bug, not a per-submission issue):", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

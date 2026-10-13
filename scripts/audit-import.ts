/**
 * Read-only completeness audit of imported submissions. Answers "did the
 * importer find and process every piece of artwork?" from the stored
 * Submittable entries (rawEntriesJson) and the DB:
 *   - files attached anywhere other than an initial-form file_upload field
 *     (the only place process-submission.ts looks)
 *   - additional form entries (e.g. follow-up forms) carrying files
 *   - links in text fields (portfolio/Dropbox/Drive) — artwork the importer
 *     can't download
 *   - submissions or files not marked processed, and processed files with
 *     zero rendered pages
 *
 * Run: npx tsx scripts/audit-import.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import type { EntriesResponse } from "@/lib/submittable/types";

const LINK = /(https?:\/\/|www\.)\S+/gi;

async function main() {
  const submissions = await prisma.submittableSubmission.findMany({
    include: { files: { include: { _count: { select: { assets: true } } } } },
    orderBy: { artistName: "asc" },
  });

  const issues: string[] = [];
  const links: string[] = [];
  let fileTotal = 0;
  let assetTotal = 0;

  for (const s of submissions) {
    const who = `${s.artistName} — "${s.submissionTitle}" [${s.officialStatus}]`;
    if (s.processingStatus !== "processed") {
      issues.push(
        `${who}: submission processingStatus=${s.processingStatus} ${s.processingError ?? ""}`,
      );
    }
    const entries = s.rawEntriesJson as unknown as EntriesResponse | null;
    if (!entries?.formEntries) {
      issues.push(`${who}: no stored entries`);
      continue;
    }

    let expectedFiles = 0;
    for (const fe of entries.formEntries) {
      for (const f of fe.entry.fieldData) {
        const n = f.files?.length ?? 0;
        if (fe.formType === "initial" && f.fieldType === "file_upload") expectedFiles += n;
        else if (n > 0) {
          issues.push(`${who}: ${n} file(s) in ${fe.formType}/${f.fieldType} — NOT imported`);
        }
        for (const m of (f.value ?? "").match(LINK) ?? []) links.push(`${who}: ${m}`);
      }
      if (fe.formType !== "initial") {
        issues.push(`${who}: has a "${fe.formType}" form entry (status ${fe.entry.status})`);
      }
    }

    if (s.files.length !== expectedFiles) {
      issues.push(`${who}: ${expectedFiles} file(s) uploaded, ${s.files.length} in DB`);
    }
    for (const f of s.files) {
      fileTotal += 1;
      assetTotal += f._count.assets;
      if (f.processingStatus !== "processed") {
        issues.push(
          `${who}: ${f.originalFilename} processingStatus=${f.processingStatus} ${f.processingError ?? ""}`,
        );
      } else if (f._count.assets === 0) {
        issues.push(`${who}: ${f.originalFilename} processed but has 0 pages`);
      }
    }
  }

  console.log(`Submissions: ${submissions.length}`);
  const byStatus: Record<string, number> = {};
  for (const s of submissions)
    byStatus[s.officialStatus ?? "(none)"] = (byStatus[s.officialStatus ?? "(none)"] ?? 0) + 1;
  console.log(`  by status: ${JSON.stringify(byStatus)}`);
  console.log(`Files: ${fileTotal}   Pages/images: ${assetTotal}`);
  console.log(`\nIssues (${issues.length}):`);
  issues.forEach((i) => console.log(`  ✗ ${i}`));
  console.log(
    `\nLinks in text fields (${links.length}) — check none are portfolio links the importer skipped:`,
  );
  links.forEach((l) => console.log(`  · ${l}`));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

/**
 * Manual QA helper: prints signed URLs for (1) every hidden asset, so a
 * human can eyeball whether classifyPage() correctly identified it as text
 * rather than art, and (2) one sample per known label, for a quick label
 * diversity check.
 *
 * Run: npx tsx scripts/spot-check.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "../src/lib/db/index.ts";
import { getSignedR2Url } from "../src/lib/storage/r2.ts";

async function main() {
  console.log("=== Hidden (cover_statement) assets — verify these are really text, not art ===");
  const hidden = await prisma.artAsset.findMany({
    where: { visibleInArtLibrary: false },
    include: { submission: true },
  });
  for (const a of hidden) {
    const url = await getSignedR2Url(a.storagePathLarge);
    console.log(
      `${a.submission.artistName} — "${a.submission.submissionTitle}" page ${a.pageNumber}`,
    );
    console.log(`  ${url}`);
  }

  console.log("\n=== Label diversity sample — one submission per known label ===");
  // Real Submittable label names are lowercase ("painting/drawing", not
  // "Painting/Drawing" as the original spec assumed) — confirmed by
  // querying the DB directly rather than trusting the spec's casing.
  const knownLabels = [
    "landscape",
    "photography",
    "figurative",
    "painting/drawing",
    "collage",
    "abstract",
    "multimedia",
  ];
  for (const labelName of knownLabels) {
    const submission = await prisma.submittableSubmission.findFirst({
      where: { labels: { some: { label: { name: labelName } } } },
      include: { assets: { where: { visibleInArtLibrary: true }, take: 1 } },
    });
    if (!submission || submission.assets.length === 0) {
      console.log(`${labelName}: (none found)`);
      continue;
    }
    const url = await getSignedR2Url(submission.assets[0].storagePathThumbnail);
    console.log(`${labelName}: ${submission.artistName} — "${submission.submissionTitle}"`);
    console.log(`  ${url}`);
  }

  await prisma.$disconnect();
}
main();

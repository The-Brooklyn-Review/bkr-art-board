/**
 * Manual QA helper: dumps every submission with its labels, files, and
 * assets (type, page, visibility, dimensions, storage path) for eyeballing
 * that an import batch landed correctly.
 *
 * Run: npx tsx scripts/verify-phase2.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const submissions = await prisma.submittableSubmission.findMany({
    include: { assets: true, files: true, labels: { include: { label: true } } },
  });
  for (const s of submissions) {
    console.log(`\n${s.artistName} — "${s.submissionTitle}"`);
    console.log(`  labels: ${s.labels.map((l) => l.label.name).join(", ")}`);
    console.log(`  files: ${s.files.length}, assets: ${s.assets.length}`);
    for (const a of s.assets) {
      console.log(
        `    - ${a.assetType} page=${a.pageNumber} type=${a.pageType} visible=${a.visibleInArtLibrary} ${a.width}x${a.height} -> ${a.storagePathThumbnail}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

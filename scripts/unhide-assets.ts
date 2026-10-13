/**
 * Manual QA fix: marks pages the classifier wrongly hid as visible artwork.
 * Companion to spot-check.ts — pass the storage paths (or the signed URLs
 * spot-check printed; query strings are stripped) of pages that are really
 * art. Each change writes a ReviewAction row, the same as flipping
 * "Visible in Art Library" + "Page type: Artwork" in the Review UI.
 *
 * Run:
 *   npx tsx scripts/unhide-assets.ts <storagePathLarge|signedUrl> [...]
 *   npx tsx scripts/unhide-assets.ts --dry-run <…>   (report only)
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";

/** "https://…/bucket/submittable/…/page-3-full.webp?X-Amz…" → "submittable/…/page-3-full.webp" */
export function toStoragePath(arg: string): string {
  const noQuery = arg.split("?")[0];
  const i = noQuery.indexOf("submittable/");
  return i >= 0 ? noQuery.slice(i) : noQuery;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const paths = args.filter((a) => a !== "--dry-run").map(toStoragePath);
  if (paths.length === 0) {
    console.error("Usage: npx tsx scripts/unhide-assets.ts [--dry-run] <storagePath|url> [...]");
    process.exit(1);
  }

  let changed = 0;
  for (const path of paths) {
    const asset = await prisma.artAsset.findFirst({
      where: { storagePathLarge: path },
      include: { submission: { select: { artistName: true, submissionTitle: true } } },
    });
    if (!asset) {
      console.log(`✗ not found: ${path}`);
      continue;
    }
    const label = `${asset.submission.artistName} — "${asset.submission.submissionTitle}" page ${asset.pageNumber ?? "?"}`;
    if (asset.visibleInArtLibrary && asset.pageType === "artwork") {
      console.log(`· already visible artwork: ${label}`);
      continue;
    }
    if (dryRun) {
      console.log(
        `would unhide: ${label} (was ${asset.pageType}, visible=${asset.visibleInArtLibrary})`,
      );
      continue;
    }
    await prisma.$transaction([
      prisma.artAsset.update({
        where: { id: asset.id },
        data: { visibleInArtLibrary: true, pageType: "artwork" },
      }),
      prisma.reviewAction.create({
        data: {
          submissionId: asset.submissionId,
          artAssetId: asset.id,
          actionType: "visibility_changed",
          previousValue: {
            visibleInArtLibrary: asset.visibleInArtLibrary,
            pageType: asset.pageType,
          },
          newValue: { visibleInArtLibrary: true, pageType: "artwork", via: "unhide-assets.ts" },
        },
      }),
    ]);
    changed += 1;
    console.log(`✓ unhid: ${label}`);
  }
  console.log(`\n${dryRun ? "Dry run — nothing changed." : `${changed} page(s) unhidden.`}`);
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

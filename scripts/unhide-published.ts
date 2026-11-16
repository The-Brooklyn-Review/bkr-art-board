/**
 * One-off repair: "Mark as Published" used to also hide the asset
 * (visibleInArtLibrary: false), so published work vanished even under
 * "Include published artists". It no longer does (see markAssetPublished);
 * this makes the pieces it hid visible again. They stay published, so they
 * only show with published artists included.
 *
 * Only touches assets that are published + hidden AND whose latest
 * asset_published audit row says they were visible just before — i.e. the
 * old button hid them, not a deliberate Hide. Each change writes a
 * visibility_changed ReviewAction, like the Hide button does.
 *
 * Run:
 *   npx tsx scripts/unhide-published.ts --dry-run   (report only)
 *   npx tsx scripts/unhide-published.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const assets = await prisma.artAsset.findMany({
    where: { usedState: "published", visibleInArtLibrary: false },
    select: {
      id: true,
      submissionId: true,
      pageNumber: true,
      submission: { select: { artistName: true } },
    },
  });

  const toFix: typeof assets = [];
  for (const a of assets) {
    const last = await prisma.reviewAction.findFirst({
      where: { artAssetId: a.id, actionType: "asset_published" },
      orderBy: { createdAt: "desc" },
      select: { previousValue: true },
    });
    const prev = last?.previousValue as { visibleInArtLibrary?: boolean } | null;
    if (prev?.visibleInArtLibrary === true) toFix.push(a);
    else console.log(`skip ${a.id} (${a.submission.artistName}): not hidden by Publish`);
  }

  for (const a of toFix) {
    console.log(
      `${dryRun ? "would unhide" : "unhide"} ${a.id} — ${a.submission.artistName}, page ${a.pageNumber ?? "-"}`,
    );
  }
  if (dryRun || toFix.length === 0) {
    console.log(`${toFix.length} asset(s)${dryRun ? " (dry run, nothing changed)" : ""}`);
    return;
  }

  await prisma.$transaction(
    toFix.flatMap((a) => [
      prisma.artAsset.update({ where: { id: a.id }, data: { visibleInArtLibrary: true } }),
      prisma.reviewAction.create({
        data: {
          submissionId: a.submissionId,
          artAssetId: a.id,
          actionType: "visibility_changed",
          previousValue: { visibleInArtLibrary: false },
          newValue: { visibleInArtLibrary: true },
        },
      }),
    ]),
  );
  console.log(`unhid ${toFix.length} asset(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

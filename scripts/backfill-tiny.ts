/**
 * One-off: makes the review list's tiny thumbnail (src/lib/storage/tiny.ts)
 * for every artwork imported before the importer made them. Downloads each
 * regular thumbnail from R2, resizes it, uploads it next to it. Writes R2
 * only — no DB changes. Safe to re-run: re-uploads overwrite the same keys.
 *
 * Run:
 *   npx tsx scripts/backfill-tiny.ts            # every asset
 *   npx tsx scripts/backfill-tiny.ts --dry-run  # count only, write nothing
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import { fetchR2Object, uploadToR2 } from "@/lib/storage/r2";
import { tinyKeyFor } from "@/lib/storage/tiny";
import { renderTiny } from "@/lib/processing/tiny";

const CONCURRENCY = 8;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const assets = await prisma.artAsset.findMany({ select: { storagePathThumbnail: true } });
  const keys = assets.map((a) => a.storagePathThumbnail);
  const skipped = keys.filter((k) => !tinyKeyFor(k));
  const todo = keys.filter((k) => tinyKeyFor(k));
  console.log(
    `${keys.length} asset(s): ${todo.length} to process, ${skipped.length} unrecognised key(s).`,
  );
  for (const k of skipped) console.log(`  · skipped (not a -thumb.webp key): ${k}`);
  if (dryRun) {
    console.log("DRY RUN — nothing written.");
    return;
  }

  let done = 0;
  let saved = 0;
  const failures: string[] = [];
  const queue = [...todo];
  async function worker() {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        const { body } = await fetchR2Object(key);
        const tiny = await renderTiny(body);
        await uploadToR2(tinyKeyFor(key)!, tiny, "image/webp");
        saved += body.length - tiny.length;
      } catch (err) {
        failures.push(`${key}: ${err instanceof Error ? err.message : err}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(
    `Done: ${todo.length - failures.length} tiny thumbnail(s) written ` +
      `(${(saved / 1024 / 1024).toFixed(1)} MB smaller than the thumbnails in total).`,
  );
  if (failures.length > 0) {
    console.error(`✗ ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("✗ BACKFILL FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

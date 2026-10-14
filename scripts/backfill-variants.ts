/**
 * Makes the smaller thumbnail variants (src/lib/storage/variants.ts — tiny,
 * card) for artwork imported before the importer made them. Downloads each
 * regular thumbnail from R2, resizes it, uploads the copies next to it.
 * Writes R2 only — no DB changes. Safe to re-run: re-uploads overwrite the
 * same keys.
 *
 * Run:
 *   npx tsx scripts/backfill-variants.ts                # every variant
 *   npx tsx scripts/backfill-variants.ts --only card    # one variant
 *   npx tsx scripts/backfill-variants.ts --dry-run      # count only, write nothing
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import { fetchR2Object, uploadToR2 } from "@/lib/storage/r2";
import { VARIANTS, variantKeyFor, type Variant } from "@/lib/storage/variants";
import { renderVariant } from "@/lib/processing/variants";

const CONCURRENCY = 8;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
  const all = Object.keys(VARIANTS) as Variant[];
  const variants = process.argv.includes("--only") ? all.filter((v) => v === onlyArg) : all;
  if (variants.length === 0) throw new Error(`--only takes one of: ${all.join(", ")}`);

  const assets = await prisma.artAsset.findMany({ select: { storagePathThumbnail: true } });
  const keys = assets.map((a) => a.storagePathThumbnail);
  const skipped = keys.filter((k) => !variantKeyFor(k, "tiny"));
  const todo = keys.filter((k) => variantKeyFor(k, "tiny"));
  console.log(
    `${keys.length} asset(s): ${todo.length} to process (${variants.join(", ")}), ` +
      `${skipped.length} unrecognised key(s).`,
  );
  for (const k of skipped) console.log(`  · skipped (not a -thumb.webp key): ${k}`);
  if (dryRun) {
    console.log("DRY RUN — nothing written.");
    return;
  }

  let done = 0;
  const bytes: Record<string, number> = {};
  let thumbBytes = 0;
  const failures: string[] = [];
  const queue = [...todo];
  async function worker() {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        const { body } = await fetchR2Object(key);
        thumbBytes += body.length;
        for (const v of variants) {
          const out = await renderVariant(body, v);
          await uploadToR2(variantKeyFor(key, v)!, out, "image/webp");
          bytes[v] = (bytes[v] ?? 0) + out.length;
        }
      } catch (err) {
        failures.push(`${key}: ${err instanceof Error ? err.message : err}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(
    `Done: ${todo.length - failures.length} artwork(s). Thumbnails ${mb(thumbBytes)} → ` +
      variants.map((v) => `${v} ${mb(bytes[v] ?? 0)}`).join(", "),
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

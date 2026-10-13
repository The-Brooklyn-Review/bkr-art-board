/**
 * Read-only: downloads every rendered image (large + thumbnail) — and with
 * --originals, every original uploaded PDF — from R2 into ./localtest-mirror/
 * under the same keys, so a local copy of the app can be run against real
 * data. Skips files already downloaded. Writes nothing to R2 or the DB.
 *
 * Run: npx tsx scripts/mirror-r2.ts [--originals]
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import { fetchR2Object } from "@/lib/storage/r2";

const OUT = resolve(process.cwd(), "localtest-mirror");

async function main() {
  const withOriginals = process.argv.includes("--originals");
  const [assets, files] = await Promise.all([
    prisma.artAsset.findMany({ select: { storagePathLarge: true, storagePathThumbnail: true } }),
    withOriginals
      ? prisma.submissionFile.findMany({ select: { storagePathOriginal: true } })
      : Promise.resolve([]),
  ]);
  const keys = [
    ...assets.flatMap((a) => [a.storagePathLarge, a.storagePathThumbnail]),
    ...files.map((f) => f.storagePathOriginal),
  ].filter((k) => !existsSync(resolve(OUT, k)));
  console.log(`Downloading ${keys.length} object(s) to ${OUT} …`);

  let done = 0;
  let bytes = 0;
  const failures: string[] = [];
  const queue = [...keys];
  async function worker() {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        const { body } = await fetchR2Object(key);
        const path = resolve(OUT, key);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
        bytes += body.length;
      } catch (err) {
        failures.push(`${key}: ${err instanceof Error ? err.message : err}`);
      }
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${keys.length} (${(bytes / 1e6).toFixed(0)} MB)`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`Done: ${done - failures.length} downloaded, ${(bytes / 1e6).toFixed(0)} MB, ${failures.length} failed.`);
  failures.slice(0, 20).forEach((f) => console.log(`  ✗ ${f}`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

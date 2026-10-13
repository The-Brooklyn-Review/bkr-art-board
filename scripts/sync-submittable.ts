/**
 * Syncs the app with Submittable: status, labels, project, and reviewer
 * assignments for every submission the app holds; deletes withdrawn
 * submissions (images included); lists submissions that need importing.
 * Metadata only — run process-submission.ts to import new files.
 * See docs/SPEC-review-and-sync.md §5.
 *
 * Mutating (DB + R2 deletes for withdrawn submissions). Run daily by
 * .github/workflows/sync-submittable.yml, and from the app's Sync button.
 *
 * Run:
 *   npx tsx scripts/sync-submittable.ts            # sync
 *   npx tsx scripts/sync-submittable.ts --dry-run  # report only, write nothing
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";
import { formatSyncSummary, syncSubmittable } from "@/lib/sync/syncSubmittable";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const summary = await syncSubmittable({ dryRun, log: (l) => console.log(l) });
  console.log(formatSyncSummary(summary));
  if (summary.deleteErrors.length > 0) process.exitCode = 1;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("✗ SYNC FAILED:", err instanceof Error ? err.message : err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

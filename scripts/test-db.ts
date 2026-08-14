/**
 * One-off connectivity proof for the live Supabase Postgres connection.
 * Writes a throwaway row, reads it back, deletes it. Ground truth that
 * Prisma Client actually works end-to-end, not just that generate succeeded.
 *
 * Run: npx tsx scripts/test-db.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  console.log("[1] Writing a throwaway label row…");
  const label = await prisma.submittableLabel.create({
    data: {
      submittableLabelId: "test-connectivity-check",
      name: "__connectivity_test__",
    },
  });
  console.log(`✓ Created row id=${label.id}`);

  console.log("\n[2] Reading it back…");
  const found = await prisma.submittableLabel.findUniqueOrThrow({
    where: { id: label.id },
  });
  console.log(`✓ Read back: ${found.name}`);

  console.log("\n[3] Cleaning up…");
  await prisma.submittableLabel.delete({ where: { id: label.id } });
  console.log("✓ Deleted.");

  console.log("\n✓✓✓ Live Postgres connection fully verified end-to-end.");
}

main()
  .catch((err) => {
    console.error("\n✗ DB TEST FAILED:\n", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "./src/lib/db/index.ts";

async function check() {
  const [submissions, assets] = await Promise.all([
    prisma.submittableSubmission.count(),
    prisma.artAsset.count(),
  ]);
  console.log("Submissions:", submissions);
  console.log("Assets:", assets);
}

check().catch(console.error);

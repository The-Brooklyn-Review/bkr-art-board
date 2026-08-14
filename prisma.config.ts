// The Prisma CLI only auto-loads `.env` by default, not `.env.local` (the
// Next.js convention this project uses for secrets). This is the officially
// supported way to point the CLI at it — confirmed against the installed
// Prisma 6.19.3's own config types (see @prisma/config) rather than assumed.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolve } from "node:path";

config({ path: resolve(__dirname, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
});

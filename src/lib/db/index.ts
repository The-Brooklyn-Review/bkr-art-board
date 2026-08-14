import { PrismaClient } from "@prisma/client";

// No `server-only` guard here: this module is shared between the Next.js
// app (Server Components / Route Handlers only — never import from a
// "use client" file) and the standalone import scripts run via tsx. The
// `server-only` package unconditionally throws outside Next.js's own
// bundler (it gates on a "react-server" export condition tsx doesn't set),
// which breaks the scripts entirely. Discipline over tooling here.
//
// Standard Next.js singleton pattern — avoids exhausting DB connections
// on every hot-reload in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

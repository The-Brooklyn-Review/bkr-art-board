// "Who's reviewing?" — honour-system identity on top of the single shared
// APP_PASSWORD (docs/SPEC-review-and-sync.md §8). The cookie holds a
// Reviewer row id; every decision and label change is attributed to it.
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const REVIEWER_COOKIE_NAME = "bkr_reviewer";

export async function getCurrentReviewer() {
  const id = (await cookies()).get(REVIEWER_COOKIE_NAME)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return prisma.reviewer.findUnique({ where: { id } });
}

export type CurrentReviewer = NonNullable<Awaited<ReturnType<typeof getCurrentReviewer>>>;

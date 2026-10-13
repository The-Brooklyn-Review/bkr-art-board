// "Who's reviewing?" — honour-system identity on top of the single shared
// APP_PASSWORD (docs/SPEC-review-and-sync.md §8). The cookie holds a
// Reviewer row id; every decision and label change is attributed to it.
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const REVIEWER_COOKIE_NAME = "bkr_reviewer";

/** The cookie's Reviewer id, unchecked — lets a page start its queries
 * without waiting for the Reviewer row (which it still loads and checks). */
export async function currentReviewerId(): Promise<string | null> {
  const id = (await cookies()).get(REVIEWER_COOKIE_NAME)?.value;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function getReviewer(id: string | null) {
  return id ? prisma.reviewer.findUnique({ where: { id } }) : null;
}

export async function getCurrentReviewer() {
  return getReviewer(await currentReviewerId());
}

export type CurrentReviewer = NonNullable<Awaited<ReturnType<typeof getCurrentReviewer>>>;

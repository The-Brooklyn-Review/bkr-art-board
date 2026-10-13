import { createHash, timingSafeEqual } from "node:crypto";

// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
export const AUTH_COOKIE_NAME = "bkr_auth";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashBuffer(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** The value the auth cookie must hold to be considered valid. */
export function expectedAuthCookieValue(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("Missing APP_PASSWORD");
  return hash(password);
}

export function isCorrectPassword(candidate: string): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("Missing APP_PASSWORD");
  // Compares fixed-length digests via timingSafeEqual rather than the raw
  // strings — a plain === short-circuits on the first mismatched
  // character, and timingSafeEqual itself throws on mismatched buffer
  // lengths, which a raw password comparison would hit directly. Hashing
  // first sidesteps both. Guessing itself is limited by a Vercel Firewall
  // rate-limit rule on POST /login (see login/actions.ts).
  return timingSafeEqual(hashBuffer(candidate), hashBuffer(password));
}

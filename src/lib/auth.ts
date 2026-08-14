import { createHash } from "node:crypto";

// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
export const AUTH_COOKIE_NAME = "tbr_auth";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
  return candidate === password;
}

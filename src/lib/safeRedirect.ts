/**
 * Only ever redirect to a same-origin relative path. `next` params are
 * attacker-controllable, and browsers are lenient: "//host", "/\host" and
 * "/<tab>/host" all become off-site URLs once the URL parser strips the
 * whitespace. So: reject control characters and backslashes outright, then
 * confirm the path resolves to the same origin.
 */
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://same.invalid");
    if (u.origin !== "http://same.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

import { describe, expect, it, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue } from "@/lib/auth";

beforeAll(() => {
  process.env.APP_PASSWORD = "test-password";
});

function nextParam(response: ReturnType<typeof proxy>): string | null {
  const location = response.headers.get("location");
  if (!location) return null;
  return new URL(location).searchParams.get("next");
}

// Regression coverage for a real bug: the login redirect used to build
// `next` from pathname alone, silently dropping query strings — so a
// deep link like /art-library?asset=<id> (the exact target a share page
// sends someone to) landed back on the plain grid after login, with the
// artwork lost.
describe("proxy", () => {
  it("carries the query string through into the post-login redirect target", () => {
    const request = new NextRequest("http://localhost:3000/art-library?asset=abc-123");
    expect(nextParam(proxy(request))).toBe("/art-library?asset=abc-123");
  });

  it("redirects with a bare path when there's no query string to carry", () => {
    const request = new NextRequest("http://localhost:3000/art-library");
    expect(nextParam(proxy(request))).toBe("/art-library");
  });

  it("does not redirect a request that already carries a valid auth cookie", () => {
    const request = new NextRequest("http://localhost:3000/art-library?asset=abc-123", {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${expectedAuthCookieValue()}` },
    });
    expect(proxy(request).headers.get("location")).toBeNull();
  });

  it("lets /share/<token> through with no cookie at all", () => {
    const request = new NextRequest("http://localhost:3000/share/sometoken");
    expect(proxy(request).headers.get("location")).toBeNull();
  });
});

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function is
// `proxy`, not `middleware`) — confirmed against this project's bundled
// docs before writing this, since AGENTS.md warns this version diverges
// from training data.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue } from "@/lib/auth";

// Icon/OG-image routes must stay reachable without the auth cookie — link
// preview bots (WhatsApp, iMessage, Slack, etc.) never have it, and a
// redirect to /login instead of an image is what a broken embed looks like.
// They're pure branding graphics, not submission data, so exempting them
// doesn't weaken the gate on anything that actually matters.
const PUBLIC_PATHS = ["/login", "/icon", "/apple-icon", "/opengraph-image"];

// /share/<token> and /share/<token>/image are the one deliberate hole in
// the auth gate that exposes real submission data (one artist name, one
// title, one image) — see src/lib/sharePreview.ts. Every request under
// this prefix re-checks the token's own hash/expiry/revocation/visibility
// itself, so exempting the prefix here is safe: an invalid or guessed
// token gets a 404 from the route, not a peek at anything.
const PUBLIC_PREFIXES = ["/share/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie !== expectedAuthCookieValue()) {
    const loginUrl = new URL("/login", request.url);
    // pathname alone drops query strings — e.g. /art-library?asset=<id>
    // (the exact deep link a share page sends someone to) would silently
    // land back on the plain grid after login, with the target artwork
    // lost. request.nextUrl.search carries the leading "?" already, or is
    // "" when there's nothing to carry.
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

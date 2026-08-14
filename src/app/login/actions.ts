"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue, isCorrectPassword } from "@/lib/auth";

const DEFAULT_NEXT = "/art-library";

// Only ever redirect to a same-origin relative path. `next` is attacker-
// controllable (a crafted /login?next=https://evil.example link), and
// Next's redirect() will happily send the browser anywhere, absolute URLs
// included — without this check, a successful login could end by
// redirecting the user off-site (open redirect). "//host" and "/\host" are
// both rejected too — browsers treat a Location starting with either as
// protocol-relative, i.e. still off-site despite starting with a slash.
function safeNextPath(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return DEFAULT_NEXT;
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? DEFAULT_NEXT));

  // Single shared password, no per-account lockout — this is the cheap
  // mitigation: every attempt (success or failure) costs a fixed second,
  // capping brute-force guessing at ~60/min regardless of how it's
  // automated. Applied unconditionally so response timing itself doesn't
  // leak whether a guess was close.
  await new Promise((r) => setTimeout(r, 1000));

  if (!isCorrectPassword(password)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, expectedAuthCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — internal tool, not worth re-prompting often
  });

  redirect(next);
}

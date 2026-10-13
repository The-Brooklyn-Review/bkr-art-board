"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue, isCorrectPassword } from "@/lib/auth";
import { safeNextPath as safeNextPathShared } from "@/lib/safeRedirect";

const DEFAULT_NEXT = "/art-library";

function safeNextPath(next: string): string {
  return safeNextPathShared(next, DEFAULT_NEXT);
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? DEFAULT_NEXT));

  // Single shared password, no per-account lockout. The real limit on
  // guessing is a Vercel Firewall rate-limit rule on POST /login (see
  // docs/OPERATIONS.md) — a delay here can't cap it on its own, since
  // attempts can run in parallel. This small flat delay just slows a
  // single scripted loop, without making every real sign-in wait. Applied
  // to every attempt: delaying only failures would let a script give up on
  // any slow response and learn the answer anyway.
  await new Promise((r) => setTimeout(r, 250));

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

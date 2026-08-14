"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue, isCorrectPassword } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/art-library");

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

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue } from "@/lib/auth";

/**
 * Server actions are their own network entry point; Next's docs warn
 * against relying on the proxy alone to guard them. Every action that
 * reads or writes review data (or Submittable) checks the app-password
 * cookie itself.
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value === expectedAuthCookieValue();
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Not signed in.");
}

"use client";

import { useLinkStatus } from "next/link";

/**
 * Put inside a `relative` <Link>: a soft pulse over the row once a click is
 * still loading, so a slow server render doesn't look like a dead click.
 * Delayed so fast navigations don't flicker.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-accent/10 transition-opacity ${
        pending ? "opacity-100 delay-150 animate-pulse" : "opacity-0"
      }`}
    />
  );
}

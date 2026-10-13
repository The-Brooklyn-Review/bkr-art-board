"use client";

import { useEffect, useRef } from "react";

/**
 * Jumps to the top of the page when `key` changes — for a list whose search
 * or filters changed: the old scroll position means nothing in the new
 * results, and the search box sits in a sticky header, so you can change it
 * from far down the page. Instant, not smooth (smooth feels laggy while
 * typing); not on first render, so a restored or deep-linked position is
 * kept; a no-op when already at the top. Works with a menu sheet open:
 * its overflow:hidden lock only stops the user scrolling, not this.
 */
export function useScrollToTopOnChange(key: string) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [key]);
}

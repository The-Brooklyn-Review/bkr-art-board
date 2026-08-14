"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for how long a modal/sheet/dialog transition takes.
 * Read by both this hook's unmount timer and each modal's inline
 * `transitionDuration` style, so the two can't drift out of sync the way a
 * Tailwind `duration-200` class and a hand-typed `setTimeout(…, 200)` could.
 */
export const MODAL_TRANSITION_MS = 200;

// The shared inline style every portaled modal/sheet applies alongside its
// `visible`-gated opacity/transform classes — keeps the CSS transition
// duration locked to the same value this hook's own unmount timer uses.
export const MODAL_TRANSITION_STYLE = { transitionDuration: `${MODAL_TRANSITION_MS}ms` };

// Ref-counted so two overlays open at once (e.g. a confirm dialog opened
// from within a sheet) don't fight over restoring scroll — the page only
// unlocks once the last one closes.
let scrollLockCount = 0;
let previousBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount++;
}

function unlockBodyScroll() {
  scrollLockCount--;
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow ?? "";
  }
}

/**
 * Mount/unmount + enter/exit transition timing for a portaled overlay, plus
 * the two behaviors every polished modal has: Escape closes it, and the
 * page behind it can't scroll while it's open.
 *
 * The problem this solves: React unmounts the moment `open` flips to
 * false — too fast for any CSS transition to play on the way out, so the
 * modal just vanishes. This keeps the component mounted (`rendered`)
 * through the exit transition, exposing `visible` as the flag to toggle
 * "open" vs. "closed" CSS state against; the component unmounts for real
 * only after `durationMs` has elapsed.
 *
 * Entering has the opposite problem: mounting straight into the "open"
 * state can still land in the same paint as the "closed" starting state on
 * some browsers, so there's nothing for the browser to transition FROM —
 * the element just appears already-open. The two nested
 * requestAnimationFrame calls guarantee a full frame boundary passes
 * between committing the closed state and flipping to open, which is what
 * actually makes the transition run instead of snapping.
 *
 * Respects prefers-reduced-motion by skipping the choreography entirely —
 * open/closed apply instantly.
 */
export function useModalTransition(
  open: boolean,
  onClose: () => void,
  durationMs: number = MODAL_TRANSITION_MS,
) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the reduced-motion media query, an external source; see hook doc comment for the full choreography this replaces
      setRendered(open);
      setVisible(open);
      return;
    }

    if (open) {
      setRendered(true);
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        setVisible(true);
      };
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(commit);
      });
      // Fallback in case rAF is throttled or suspended entirely — browsers
      // do this for backgrounded/inactive tabs. Without it, a modal opened
      // right as this happens would be stuck permanently invisible (open
      // in state, but never gets the "visible" class), which is worse than
      // the snap-open behavior this hook exists to fix. In the normal case
      // (tab visible, rAF firing), raf2 wins well before this ever fires.
      const fallback = setTimeout(commit, 50);
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        clearTimeout(fallback);
      };
    }

    setVisible(false);
    const timeout = setTimeout(() => setRendered(false), durationMs);
    return () => clearTimeout(timeout);
  }, [open, durationMs]);

  useEffect(() => {
    if (!rendered) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [rendered]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return { rendered, visible };
}

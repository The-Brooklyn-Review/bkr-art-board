"use client";

import { useRef, useState } from "react";

/**
 * Copies a link that the server has to make first (a share link). Safari
 * only lets a page write to the clipboard straight from the click, not
 * after waiting on the server — so the clipboard is handed a promise of
 * the text at once, and it resolves when the link is ready. Falls back to
 * writeText where ClipboardItem isn't available.
 *
 * Resolves to null once copied, or to the link itself when it was made but
 * the browser refused the clipboard (some do, embedded views especially)
 * — the caller then shows it to copy by hand. Rejects if the link couldn't
 * be made at all.
 */
async function copyLink(makePath: () => Promise<string>): Promise<string | null> {
  const url = makePath().then((path) => `${window.location.origin}${path}`);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })) }),
      ]);
    } else {
      await navigator.clipboard.writeText(await url);
    }
    return null;
  } catch {
    return url; // rejects here if the link itself failed
  }
}

type Phase = "copying" | "copied" | "failed";

/** Several copy buttons in one place, each with its own label/feedback. */
export function useCopyLink() {
  const [state, setState] = useState<{ key: string; phase: Phase } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = (key: string, makePath: () => Promise<string>) => {
    clearTimeout(timer.current);
    setState({ key, phase: "copying" });
    copyLink(makePath).then(
      (uncopied) => {
        if (uncopied) {
          setState(null);
          window.prompt("Copy this link:", uncopied);
        } else {
          setState({ key, phase: "copied" });
        }
      },
      () => setState({ key, phase: "failed" }),
    );
    timer.current = setTimeout(() => setState(null), 4000);
  };

  return {
    copy,
    copying: (key: string) => state?.key === key && state.phase === "copying",
    /** The button's text: its idle label, or how the copy went. */
    label: (key: string, idle: string) =>
      state?.key !== key
        ? idle
        : { copying: "Copying…", copied: "✓ Link copied", failed: "Couldn't share" }[state.phase],
  };
}

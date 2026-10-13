"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The one header shell both top-level pages use, so switching between
 * Review and Gallery doesn't move anything: nav, then title, then filters,
 * then a single divider. Sticky everywhere; on phones it slides away on
 * scroll-down and returns on scroll-up so filters stay reachable without
 * permanently eating the screen.
 */
export function AppHeader({ nav, children }: { nav: React.ReactNode; children?: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setHidden(y > lastY.current && y > 250);
      lastY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`border-b border-border px-4 py-3 sm:px-6 sm:py-5 sticky top-0 bg-bg/95 backdrop-blur-sm z-20 transition-transform duration-200 sm:translate-y-0 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {nav}
      {children && <div className="mt-3 sm:mt-4">{children}</div>}
    </header>
  );
}

/** Title + quiet count on one baseline, an optional control opposite. */
export function PageTitle({
  title,
  meta,
  aside,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    // min-h matches the gallery's size toggle, so the filter row sits at the
    // same height on both pages whether or not there's an aside.
    <div className="flex items-center justify-between gap-3 sm:min-h-[38px]">
      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap min-w-0">
        <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl text-text">
          {title}
        </h1>
        {meta && (
          <div className="text-xs text-text-muted uppercase tracking-wide flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            {meta}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}

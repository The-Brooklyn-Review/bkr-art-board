"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Masonry from "react-masonry-css";
import Fuse from "fuse.js";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { getAssetLargeUrl } from "@/lib/actions/getAssetUrl";
import { KNOWN_LABELS, displayLabel } from "@/lib/art-library/labels";
import { ArtCard } from "./ArtCard";
import { LightboxFooter } from "./LightboxFooter";
import { ZoomableLightbox } from "./ZoomableLightbox";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "./lightboxLayout";

// Matches the "30-60 visible cards feel manageable" density guidance —
// also caps how many masonry items mount at once, which is the actual
// mobile layout/DOM cost (loading="lazy" already defers network fetches,
// but it doesn't defer DOM node creation or masonry's layout pass).
const GRID_BATCH_SIZE = 60;

const DENSITY_BREAKPOINTS: Record<
  "compact" | "default" | "large",
  Record<string | number, number>
> = {
  compact: { default: 7, 1600: 6, 1280: 5, 960: 4, 640: 2 },
  default: { default: 6, 1600: 5, 1280: 4, 960: 3, 640: 2 },
  large: { default: 4, 1600: 3, 1280: 3, 960: 2, 640: 1 },
};

function DensityToggle({
  density,
  setDensity,
  prominent = false,
  className = "",
}: {
  density: "compact" | "default" | "large";
  setDensity: (d: "compact" | "default" | "large") => void;
  prominent?: boolean;
  className?: string;
}) {
  const sizing = prominent ? "text-sm px-3 py-2" : "text-xs px-2.5 py-1.5";
  return (
    <div
      className={`flex border ${prominent ? "border-accent/60" : "border-border"} shrink-0 ${className}`}
    >
      {(["compact", "default", "large"] as const).map((d) => (
        <button
          key={d}
          onClick={() => setDensity(d)}
          className={`${sizing} font-medium transition-colors ${
            density === d ? "bg-accent text-bg" : "text-text-muted hover:text-text"
          }`}
          title={d}
        >
          {d === "compact" ? "S" : d === "default" ? "M" : "L"}
        </button>
      ))}
    </div>
  );
}

export function ArtLibraryClient({
  assets: initialAssets,
  submissionCount,
  initialAssetId,
}: {
  assets: LibraryAsset[];
  submissionCount: number;
  initialAssetId: string | null;
}) {
  // Local, mutable copy of the server-fetched list. Publishing or hiding an
  // asset updates this in place (see removeAsset below) instead of
  // revalidating the route — that route is expensive to re-render (200+
  // signed R2 URLs) and doing so from inside the lightbox's own mutation
  // would fight with the client-side transition to the next asset.
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [density, setDensity] = useState<"compact" | "default" | "large">("default");
  // Tracked by asset ID rather than index into `filtered` — an index would
  // go stale the instant `removeAsset` (or a search/filter change) shifts
  // the array out from under it. Initial value comes from the
  // server-rendered ?asset= param (see page.tsx) so a shared link opens
  // straight to the right artwork.
  const [lightboxAssetId, setLightboxAssetId] = useState<string | null>(initialAssetId);
  const [largeUrls, setLargeUrls] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState(GRID_BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Two columns reads as cramped on a phone-width screen — default to one
  // artwork at a time there. Checked once on mount (not on every resize),
  // so picking "Medium" by hand doesn't get silently reset. Can't read
  // window.innerWidth in the initial useState (SSR has no window), hence
  // the effect instead of an initializer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-time mount read, see comment above
    if (window.innerWidth < 640) setDensity("large");
  }, []);

  // Hide the header on scroll-down, reveal it on scroll-up — same pattern
  // as most mobile content apps. Without this, the header either eats
  // permanent screen space (sticky) or filters/search become unreachable
  // without scrolling all the way back to the top (non-sticky).
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setHeaderHidden(y > lastScrollY.current && y > 250);
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fuse = useMemo(() => {
    return new Fuse(assets, {
      keys: [
        { name: "artistName", weight: 0.4 },
        { name: "submissionTitle", weight: 0.3 },
        { name: "labels.name", weight: 0.2 },
        { name: "autoGeneratedTags.combined", weight: 0.25 },
        { name: "autoGeneratedTags.visionConcrete", weight: 0.15 },
        { name: "autoGeneratedTags.visionInterpretive", weight: 0.15 },
        { name: "autoGeneratedTags.subjects", weight: 0.1 },
        { name: "autoGeneratedTags.textThemes", weight: 0.1 },
        { name: "autoGeneratedTags.dominantColors", weight: 0.1 },
        { name: "extractedText", weight: 0.05 },
        { name: "coverLetter", weight: 0.05 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    });
  }, [assets]);

  const filtered = useMemo(() => {
    let results = assets;

    // Apply search filter first (if provided)
    if (search.trim()) {
      const searchResults = fuse.search(search.trim());
      results = searchResults.map((result) => result.item);
    }

    // Then apply other filters
    return results.filter((a) => {
      // Check starred filter if enabled
      if (showStarredOnly) {
        const isStarred =
          typeof window !== "undefined" && localStorage.getItem(`starred-${a.id}`) === "true";
        if (!isStarred) return false;
      }

      if (activeLabels.size > 0) {
        const assetLabelNames = new Set(a.labels.map((l) => l.name));
        const matchesAnyActive = [...activeLabels].some((l) => assetLabelNames.has(l));
        if (!matchesAnyActive) return false;
      }
      return true;
    });
  }, [assets, search, activeLabels, showStarredOnly, fuse]);

  // A fresh filter/search should show the first batch again, not whatever
  // scroll position happened to reveal under the old result set.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting pagination on filter change, not worth the in-render-adjustment rewrite at this list size
    setVisibleCount(GRID_BATCH_SIZE);
  }, [search, activeLabels, showStarredOnly]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(v + GRID_BATCH_SIZE, filtered.length));
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length]);

  const visibleAssets = filtered.slice(0, visibleCount);

  // Slides still cover the FULL filtered set (not just the revealed grid
  // batch) — lightbox next/prev navigation shouldn't be limited by how far
  // the user has scrolled. src falls back to the thumbnail already loaded
  // in the grid until the large image is fetched (see effect below), so
  // opening a slide never shows a blank frame.
  const slides = useMemo(
    () =>
      filtered.map((a) => ({
        src: largeUrls[a.id] ?? a.thumbnailUrl,
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        asset: a,
      })),
    [filtered, largeUrls],
  );

  // Derived fresh from `filtered` every render, rather than stored as its
  // own state, so it can never point at a stale position after `filtered`
  // changes shape (removeAsset, a search edit, a label toggle).
  const lightboxIndex = useMemo(() => {
    if (lightboxAssetId === null) return null;
    const idx = filtered.findIndex((a) => a.id === lightboxAssetId);
    return idx === -1 ? null : idx;
  }, [filtered, lightboxAssetId]);

  // Tracks asset IDs a prefetch has already been kicked off for (loading or
  // done) — separate from `largeUrls` (done only), so a hover prefetch
  // already in flight doesn't get duplicated by the open-slide effect below,
  // and re-hovering the same card doesn't refire it.
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Fetches the signed large-image URL, then preloads the actual image
  // bytes via a detached <img> before ever touching `largeUrls` state.
  // `slides` (below) swaps its src the moment `largeUrls` has an entry —
  // committing only after `onload` means that swap is always into an
  // already-decoded image the browser can paint immediately, not into a
  // fresh network fetch the visible lightbox <img> has to wait through.
  // Called from three places: on grid-card hover (best case — often
  // finishes before the user even clicks), for the slide the lightbox just
  // opened to, and for its immediate neighbors (smooths next/prev too).
  function prefetchLargeUrl(assetId: string) {
    if (largeUrls[assetId] || prefetchedRef.current.has(assetId)) return;
    prefetchedRef.current.add(assetId);
    getAssetLargeUrl(assetId).then((url) => {
      const img = new Image();
      img.onload = () => setLargeUrls((prev) => ({ ...prev, [assetId]: url }));
      img.src = url;
    });
  }

  useEffect(() => {
    if (lightboxIndex === null) return;
    [lightboxIndex - 1, lightboxIndex, lightboxIndex + 1].forEach((i) => {
      const asset = filtered[i];
      if (asset) prefetchLargeUrl(asset.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, filtered]);

  const toggleLabel = (name: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const currentAsset = lightboxIndex !== null ? filtered[lightboxIndex] : null;
  const siblings = useMemo(() => {
    if (!currentAsset) return [];
    return filtered.filter((a) => a.submissionId === currentAsset.submissionId);
  }, [filtered, currentAsset]);

  // Deliberately bypasses Next's router (no router.push/replace) — this
  // route is force-dynamic, so a real navigation would re-run the whole
  // server fetch and re-sign 200+ thumbnail URLs on every single click
  // through the lightbox. Raw History API just updates the address bar;
  // state stays exactly as it already was (a plain useState). "push" adds
  // one entry (opening a fresh asset from the grid); "replace" doesn't
  // (browsing siblings, or closing shouldn't spam browser history).
  function syncUrl(assetId: string | null, mode: "push" | "replace") {
    const url = new URL(window.location.href);
    if (assetId) url.searchParams.set("asset", assetId);
    else url.searchParams.delete("asset");
    const args: [Record<string, never>, string, string] = [{}, "", url.pathname + url.search];
    if (mode === "push") window.history.pushState(...args);
    else window.history.replaceState(...args);
  }

  function openAsset(assetId: string) {
    setLightboxAssetId(assetId);
    syncUrl(assetId, "push");
  }

  function navigateToAsset(assetId: string) {
    setLightboxAssetId(assetId);
    syncUrl(assetId, "replace");
  }

  function closeLightbox() {
    setLightboxAssetId(null);
    syncUrl(null, "replace");
  }

  // Publishing or hiding an asset from the lightbox: drop it from the local
  // list (so the grid reflects it immediately, no revalidatePath needed —
  // see mutations.ts) and either advance to the next asset the caller
  // picked or close the lightbox if there isn't one.
  function removeAsset(assetId: string, nextAssetId: string | null) {
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    if (nextAssetId) navigateToAsset(nextAssetId);
    else closeLightbox();
  }

  // Browser back/forward — the only case that can change the URL out from
  // under this component, since our own updates above never touch it.
  useEffect(() => {
    function onPopState() {
      const assetId = new URLSearchParams(window.location.search).get("asset");
      setLightboxAssetId(assetId);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/*
        Sticky at every breakpoint, but on mobile it also slides off-screen
        on scroll-down and back on scroll-up (headerHidden) — filters/search
        stay reachable without permanently eating screen space. sm:translate-y-0
        below always wins at sm+, so desktop never hides.
      */}
      <header
        className={`border-b border-border px-4 py-3 sm:px-6 sm:py-5 sticky top-0 bg-bg/95 backdrop-blur-sm z-10 transition-transform duration-200 sm:translate-y-0 ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Title + count sit on one baseline-aligned line, wrapping to
              their own stacked lines only if they don't fit (narrow
              phones) — flex-wrap handles that without a breakpoint split. */}
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl text-text">
              Visual Arts Library
            </h1>
            <p className="text-xs text-text-muted uppercase tracking-wide">
              {submissionCount} submissions · {assets.length} artworks
            </p>
          </div>
          {/* Always opposite the title, at every breakpoint — matches
              where this control already sat on mobile. */}
          <DensityToggle density={density} setDensity={setDensity} prominent />
        </div>

        <div className="mt-3 space-y-2 sm:space-y-0 sm:mt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {/* Label pills: horizontal scroll strip on mobile (was wrapping
              into 3+ rows and eating the whole screen), wraps normally
              from sm up. */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
            <button
              onClick={() => setShowStarredOnly(!showStarredOnly)}
              className={`shrink-0 text-xs px-3 py-1.5 border transition-colors ${
                showStarredOnly
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-text-muted hover:border-accent hover:text-text"
              }`}
              title="Show only your starred artworks"
            >
              ⭐ Your stars
            </button>
            {KNOWN_LABELS.map((label) => (
              <button
                key={label}
                onClick={() => toggleLabel(label)}
                className={`shrink-0 text-xs px-3 py-1.5 border transition-colors ${
                  activeLabels.has(label)
                    ? "bg-accent text-bg border-accent"
                    : "border-border text-text-muted hover:border-accent hover:text-text"
                }`}
              >
                {displayLabel(label)}
              </button>
            ))}
          </div>

          {/* flex-1 + min-w-64: takes only the room left after the pills
              when it fits on their row, but once that's under 256px it
              wraps to its own line and, alone there, flex-1 stretches it
              to that line's full width — no separate breakpoint rule
              needed for the "dropped to its own row" case. */}
          <div className="relative w-full sm:flex-1 sm:min-w-64">
            <input
              type="text"
              placeholder="Artist, title, color, mood, tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-border text-sm text-text px-3 py-1.5 pr-8 outline-none focus:border-accent transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-1"
                title="Clear search"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {filtered.length !== assets.length && (
          <p className="text-xs text-text-muted mt-2">
            Showing {filtered.length} of {assets.length} artworks
          </p>
        )}
      </header>

      <main className="px-6 py-6">
        {filtered.length === 0 ? (
          <p className="text-text-muted text-sm py-12 text-center">
            No artworks match the current filters.
          </p>
        ) : (
          <>
            <Masonry
              breakpointCols={DENSITY_BREAKPOINTS[density]}
              className="flex -ml-4 w-auto"
              columnClassName="pl-4 bg-clip-padding"
            >
              {visibleAssets.map((asset) => (
                <ArtCard
                  key={asset.id}
                  asset={asset}
                  onOpen={() => openAsset(asset.id)}
                  onHoverIntent={() => prefetchLargeUrl(asset.id)}
                />
              ))}
            </Masonry>
            {/* Reveals the next batch when scrolled near — rootMargin gives
                it a head start so more cards are ready before the user
                actually hits the bottom. */}
            {visibleCount < filtered.length && <div ref={sentinelRef} className="h-1" />}
          </>
        )}
      </main>

      <ZoomableLightbox
        open={lightboxIndex !== null}
        close={closeLightbox}
        index={lightboxIndex ?? 0}
        slides={slides}
        on={{
          view: ({ index }) => {
            const target = filtered[index];
            if (target) navigateToAsset(target.id);
          },
        }}
        render={{
          slideFooter: ({ slide }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const asset = (slide as any).asset as LibraryAsset | undefined;
            if (!asset) return null;
            return (
              <LightboxFooter
                key={asset.id}
                asset={asset}
                siblings={siblings}
                onJumpToSibling={navigateToAsset}
                onAssetRemoved={removeAsset}
              />
            );
          },
        }}
        styles={{
          // Reserve space so the custom slideFooter overlay never covers the
          // artwork — the image's max-height shrinks to fit above this band
          // instead of being obscured by whatever renders on top of it. A
          // fixed worst-case reservation rather than measuring the footer's
          // real height dynamically: that was tried (see git history) and
          // caused worse bugs — the library preloads and renders slideFooter
          // for the off-screen prev/next slides too, all sharing this one
          // style value, so a live measurement can win a race against
          // whichever slide last reported its height and end up applied to
          // whatever's actually on screen. A fixed value can't race.
          slide: { paddingBottom: LIGHTBOX_FOOTER_MAX_HEIGHT },
        }}
      />
    </div>
  );
}

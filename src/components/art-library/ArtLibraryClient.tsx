"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Masonry from "react-masonry-css";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { workTabTitle } from "@/lib/format";
import { useScrollToTopOnChange } from "@/lib/ui/useScrollToTopOnChange";
import { createGallerySearch, hydrateGallery, type GalleryData } from "@/lib/art-library/gallery";
import { KNOWN_LABELS, displayLabel } from "@/lib/art-library/labels";
import { ArtCard } from "./ArtCard";
import { LightboxFooter } from "./LightboxFooter";
import { ZoomableLightbox } from "./ZoomableLightbox";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "./lightboxLayout";
import Link from "next/link";
import { AppNav } from "@/components/review/AppNav";
import { AppHeader, PageTitle } from "@/components/review/AppHeader";
import {
  Menu,
  MenuCheckbox,
  MenuDivider,
  MenuHeading,
  MenuLink,
  MenuRadio,
} from "@/components/review/Menu";

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
  data,
  submissionCount,
  initialAssetId,
  includePublished,
  reviewerName,
  sync,
}: {
  data: GalleryData;
  submissionCount: number;
  initialAssetId: string | null;
  /** Also showing work from already-accepted submissions (?published=1). */
  includePublished: boolean;
  reviewerName: string | null;
  sync: { lastSynced: string; stale: boolean };
}) {
  // Same object identity per server response, which the reset below keys on.
  const initialAssets = useMemo(() => hydrateGallery(data), [data]);
  // Local, mutable copy of the server-fetched list. Publishing or hiding an
  // asset updates this in place (see removeAsset below) instead of
  // revalidating the route — that route is expensive to re-render (200+
  // signed R2 URLs) and doing so from inside the lightbox's own mutation
  // would fight with the client-side transition to the next asset.
  const [assets, setAssets] = useState(initialAssets);
  // A new server list (e.g. "Include published artists" toggled) replaces
  // the local copy. Without this the grid and the artwork count kept the
  // first list while only the submission count (a prop) changed.
  const [shownList, setShownList] = useState(initialAssets);
  if (initialAssets !== shownList) {
    setShownList(initialAssets);
    setAssets(initialAssets);
  }
  const [search, setSearch] = useState("");
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  // Reading period ("Winter ’25", "Fall ’26"): the coarsest cut — which
  // cycle's work you're choosing from — so it sits above the label chips.
  const [period, setPeriod] = useState<string>("all");
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

  const runSearch = useMemo(() => createGallerySearch(assets), [assets]);

  // Periods present, oldest first, with how many submissions each has.
  const periods = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; label: string; sortKey: number; subs: Set<string> }
    >();
    for (const a of assets) {
      if (!a.period) continue;
      const p = byId.get(a.period.id) ?? { ...a.period, subs: new Set<string>() };
      p.subs.add(a.submissionId);
      byId.set(a.period.id, p);
    }
    return [...byId.values()].sort((x, y) => x.sortKey - y.sortKey);
  }, [assets]);
  // A period that no longer exists (e.g. after toggling published off)
  // falls back to all.
  const activePeriod = periods.some((p) => p.id === period) ? period : "all";

  const filtered = useMemo(() => {
    // Search first (null: no search), then the other filters.
    const hits = runSearch(search);
    const results = hits ?? assets;

    // Then apply other filters
    const kept = results.filter((a) => {
      if (activePeriod !== "all" && a.period?.id !== activePeriod) return false;
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
    // Oldest reading period first (it's the one to publish from first);
    // a search keeps its relevance order instead.
    if (hits) return kept;
    return [...kept].sort((x, y) => (x.period?.sortKey ?? 0) - (y.period?.sortKey ?? 0));
  }, [assets, search, activeLabels, showStarredOnly, runSearch, activePeriod]);

  // What's shown changed (search, filters, published toggle): back to the
  // top, showing the first batch again. Not for opening/closing an artwork
  // or hiding/publishing one — those keep your place.
  useScrollToTopOnChange(
    JSON.stringify([search, [...activeLabels], showStarredOnly, activePeriod, includePublished]),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting pagination on filter change, not worth the in-render-adjustment rewrite at this list size
    setVisibleCount(GRID_BATCH_SIZE);
  }, [search, activeLabels, showStarredOnly, activePeriod]);

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

  // Preloads the large image (via api/assets/[id]/large, which redirects to
  // a signed URL) in a detached <img> before ever touching `largeUrls` state.
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
    const url = `/api/assets/${assetId}/large`;
    const img = new Image();
    img.onload = () => setLargeUrls((prev) => ({ ...prev, [assetId]: url }));
    // Stays on the thumbnail; forgetting it lets the next open retry.
    img.onerror = () => prefetchedRef.current.delete(assetId);
    img.src = url;
  }

  useEffect(() => {
    if (lightboxIndex === null) return;
    // The slide on screen first.
    [lightboxIndex, lightboxIndex + 1, lightboxIndex - 1].forEach((i) => {
      const asset = filtered[i];
      if (asset) prefetchLargeUrl(asset.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, filtered]);

  const mobileFilterCount = Number(showStarredOnly) + Number(includePublished) + activeLabels.size;

  const toggleLabel = (name: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const currentAsset = lightboxIndex !== null ? filtered[lightboxIndex] : null;

  // The tab names the artwork while it's open (the lightbox doesn't load a
  // new page, so the page's own metadata title can't), and goes back to
  // "Gallery" when it closes.
  useEffect(() => {
    if (!currentAsset) return;
    const before = document.title;
    document.title = workTabTitle(currentAsset.artistName, currentAsset.submissionTitle);
    return () => {
      document.title = before;
    };
  }, [currentAsset]);
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
      <AppHeader nav={<AppNav current="gallery" reviewerName={reviewerName} sync={sync} />}>
        <PageTitle
          // The tab names the place (Gallery); the heading says what's in it,
          // the way Review's heading says "Assigned to you".
          title={includePublished ? "Under consideration & published" : "Under consideration"}
          meta={
            <>
              <p>
                {submissionCount} submissions · {assets.length} artworks
              </p>
              {/* Scope, not a filter: it widens what's loaded (a different
                  server query), so it sits with the counts it changes
                  rather than among the chips that narrow them. */}
              <Link
                href={includePublished ? "/art-library" : "/art-library?published=1"}
                role="switch"
                aria-checked={includePublished}
                // items-baseline + a self-centred switch: the link's baseline
                // comes from its text, so it lines up with the counts beside it.
                className="group hidden sm:inline-flex items-baseline gap-2 normal-case tracking-normal text-text-muted hover:text-text"
                title="Also show work from submissions already accepted in Submittable"
              >
                <span
                  aria-hidden
                  className={`relative self-center w-6 h-3.5 rounded-full border transition-colors ${
                    includePublished ? "bg-accent border-accent" : "border-text-muted/60"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-2 h-2 rounded-full transition-all ${
                      includePublished ? "left-3 bg-bg" : "left-0.5 bg-text-muted"
                    }`}
                  />
                </span>
                Include published artists
              </Link>
            </>
          }
          aside={
            <DensityToggle
              density={density}
              setDensity={setDensity}
              prominent
              className="hidden sm:flex"
            />
          }
        />

        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2">
          {/* Label pills on desktop. Phones get search + one Filters sheet
              instead: a sideways-scrolling strip hid most of the labels
              without any sign there were more. */}
          {periods.length > 1 && (
            <>
              <div
                className="hidden sm:flex border border-border"
                role="group"
                aria-label="Reading period"
              >
                {[{ id: "all", label: "All", subs: null as Set<string> | null }, ...periods].map(
                  (p) => {
                    const on = activePeriod === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPeriod(p.id)}
                        aria-pressed={on}
                        className={`text-xs px-3 py-1.5 border-r border-border last:border-r-0 whitespace-nowrap transition-colors ${
                          on
                            ? "bg-surface text-text shadow-[inset_0_-2px_0_var(--color-accent)]"
                            : "text-text-muted hover:text-text hover:bg-bg-hover"
                        }`}
                      >
                        {p.label}
                        {p.subs && (
                          <span className="ml-1.5 tabular-nums text-text-muted">{p.subs.size}</span>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
              <span aria-hidden className="hidden sm:block w-px h-5 bg-border mx-1" />
            </>
          )}
          <div className="hidden sm:flex flex-wrap gap-2">
            <button
              onClick={() => setShowStarredOnly(!showStarredOnly)}
              aria-pressed={showStarredOnly}
              className={`shrink-0 text-xs px-3 py-1.5 border transition-colors ${
                showStarredOnly
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-text-muted hover:border-accent hover:text-text"
              }`}
              title="Show only your starred artworks"
            >
              ⭐ Your stars
            </button>
            <span aria-hidden className="shrink-0 w-px self-stretch bg-border mx-1" />
            {KNOWN_LABELS.map((label) => (
              <button
                key={label}
                onClick={() => toggleLabel(label)}
                aria-pressed={activeLabels.has(label)}
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
          <div className="relative flex-1 min-w-0 sm:min-w-64">
            <input
              type="text"
              placeholder="Artist, title, color, mood, tag…"
              aria-label="Search the gallery"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-border text-sm text-text px-3 py-2 sm:py-1.5 pr-8 outline-none focus:border-accent transition-colors"
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

          <div className="sm:hidden">
            <Menu
              align="right"
              sheetTitle="Filters"
              active={mobileFilterCount > 0}
              buttonClassName={`flex items-center gap-2 text-sm px-3 py-2 border ${
                mobileFilterCount > 0 ? "border-accent text-text" : "border-border text-text"
              }`}
              label={
                <span>
                  Filters
                  {mobileFilterCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 bg-accent text-bg text-[10px] tabular-nums">
                      {mobileFilterCount}
                    </span>
                  )}
                </span>
              }
            >
              {periods.length > 1 && (
                <>
                  <MenuHeading>Reading period</MenuHeading>
                  <MenuRadio checked={activePeriod === "all"} onSelect={() => setPeriod("all")}>
                    All periods
                  </MenuRadio>
                  {periods.map((p) => (
                    <MenuRadio
                      key={p.id}
                      checked={activePeriod === p.id}
                      onSelect={() => setPeriod(p.id)}
                    >
                      <span className="flex justify-between gap-3">
                        {p.label}
                        <span className="text-text-muted tabular-nums">{p.subs.size}</span>
                      </span>
                    </MenuRadio>
                  ))}
                  <MenuDivider />
                </>
              )}
              <MenuHeading>Show</MenuHeading>
              <MenuCheckbox
                checked={showStarredOnly}
                onToggle={() => setShowStarredOnly(!showStarredOnly)}
              >
                Only your stars
              </MenuCheckbox>
              <MenuLink
                href={includePublished ? "/art-library" : "/art-library?published=1"}
                selected={includePublished}
                multi
                keepOpen
              >
                Include published artists
              </MenuLink>
              <MenuDivider />
              <MenuHeading>Labels</MenuHeading>
              {KNOWN_LABELS.map((label) => (
                <MenuCheckbox
                  key={label}
                  checked={activeLabels.has(label)}
                  onToggle={() => toggleLabel(label)}
                >
                  {displayLabel(label)}
                </MenuCheckbox>
              ))}
              <MenuDivider />
              <MenuHeading>Artwork size</MenuHeading>
              {(
                [
                  ["large", "One per row"],
                  ["default", "Two per row"],
                ] as const
              ).map(([d, text]) => (
                <MenuRadio key={d} checked={density === d} onSelect={() => setDensity(d)}>
                  {text}
                </MenuRadio>
              ))}
            </Menu>
          </div>
        </div>

        {/* Always mounted so screen readers announce the count as it changes. */}
        <p role="status" className="text-xs text-text-muted empty:hidden mt-2">
          {filtered.length !== assets.length &&
            `Showing ${filtered.length} of ${assets.length} artworks`}
        </p>
      </AppHeader>

      <main className="px-4 sm:px-6 py-6">
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

"use client";

import { useState, useTransition, useEffect } from "react";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { setAssetVisibility, markAssetPublished } from "@/lib/actions/mutations";
import { createShareLink } from "@/lib/actions/sharePreview";
import { KNOWN_LABELS, displayLabel } from "@/lib/art-library/labels";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "./lightboxLayout";
import { ActionLinks } from "./ActionLinks";
import { ConfirmModal } from "./ConfirmModal";
import { CoverLetterModal } from "./CoverLetterModal";
import { MoreActionsSheet } from "./MoreActionsSheet";

export function LightboxFooter({
  asset,
  siblings,
  onJumpToSibling,
  onAssetRemoved,
}: {
  asset: LibraryAsset;
  siblings: LibraryAsset[];
  onJumpToSibling: (assetId: string) => void;
  /**
   * Called after Hide or Publish successfully changes this asset's
   * visibility. `nextAssetId` is which asset (if any) the lightbox should
   * advance to — the caller owns removing `assetId` from its asset list and
   * navigating, so the grid and lightbox stay in sync without a server
   * round-trip. Hide always closes (nextAssetId: null); Publish advances to
   * a sibling page when one exists.
   */
  onAssetRemoved: (assetId: string, nextAssetId: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isStarred, setIsStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const knownLabels = asset.labels.filter((l) => KNOWN_LABELS.includes(l.name));

  // Re-reads from localStorage whenever the lightbox navigates to a
  // different asset (sibling nav, next/prev) — isStarred is per-asset, so
  // it can't be derived once at mount.
  useEffect(() => {
    const starred = localStorage.getItem(`starred-${asset.id}`) === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (localStorage), not derivable from props/state
    setIsStarred(starred);
    // "✓ Link copied" is transient feedback for the asset that was just
    // shared — carrying it across a sibling-nav jump would misattribute it
    // to whatever asset the lightbox now shows.
    setShareCopied(false);
  }, [asset.id]);

  const handleToggleStar = () => {
    const newStarred = !isStarred;
    setIsStarred(newStarred);
    if (newStarred) {
      localStorage.setItem(`starred-${asset.id}`, "true");
    } else {
      localStorage.removeItem(`starred-${asset.id}`);
    }
  };

  const handleHideConfirmed = () => {
    setShowHideConfirm(false);
    startTransition(async () => {
      await setAssetVisibility(asset.id, false);
      onAssetRemoved(asset.id, null);
    });
  };

  const handleShare = () => {
    setSharePending(true);
    startTransition(async () => {
      try {
        const token = await createShareLink(asset.id);
        const url = `${window.location.origin}/share/${token}`;
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } finally {
        setSharePending(false);
      }
    });
  };

  const handlePublishConfirmed = () => {
    setShowPublishConfirm(false);
    setPublishPending(true);
    setPublishError(false);
    startTransition(async () => {
      try {
        await markAssetPublished(asset.id);
      } catch {
        setPublishPending(false);
        setPublishError(true);
        return;
      }

      // Smart transition: prefer the next page in this submission, fall
      // back to the previous one, otherwise there's nothing left to review
      // here — return to the gallery. `siblings` follows the same order as
      // the grid (submission → file → page), so "next in array order" is a
      // real next page, not just any other sibling. `pos` should always be
      // found (this asset is necessarily its own sibling) — the -1 guard is
      // just so a lookup miss falls back to closing instead of silently
      // picking siblings[0] via the -1+1 arithmetic.
      const pos = siblings.findIndex((sib) => sib.id === asset.id);
      const next = pos === -1 ? undefined : (siblings[pos + 1] ?? siblings[pos - 1]);
      setPublishPending(false);
      onAssetRemoved(asset.id, next?.id ?? null);
    });
  };

  return (
    <>
      <ConfirmModal
        open={showHideConfirm}
        title="Hide this artwork?"
        message="This will remove the artwork from the library view."
        confirmText="Hide"
        onConfirm={handleHideConfirmed}
        onCancel={() => setShowHideConfirm(false)}
        isDestructive
      />
      <ConfirmModal
        open={showPublishConfirm}
        title="Mark as published?"
        message="This will publish the artwork and remove it from the gallery. This action cannot be undone."
        confirmText="Publish"
        onConfirm={handlePublishConfirmed}
        onCancel={() => setShowPublishConfirm(false)}
      />
      {publishError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10002] bg-red-950/90 border border-red-500 text-red-200 text-sm px-4 py-2 rounded shadow-lg">
          Couldn&apos;t publish that artwork — please try again.
        </div>
      )}
      <CoverLetterModal
        open={showCoverLetter}
        onClose={() => setShowCoverLetter(false)}
        title="Cover Letter / Statement"
        content={asset.coverLetter || ""}
      />
      <MoreActionsSheet
        open={showActions}
        onClose={() => setShowActions(false)}
        asset={asset}
        isPending={isPending}
        onHide={() => {
          setShowActions(false);
          setShowHideConfirm(true);
        }}
        onPublish={() => {
          setShowActions(false);
          setShowPublishConfirm(true);
        }}
        publishPending={publishPending}
      />
      <div
        style={{ maxHeight: LIGHTBOX_FOOTER_MAX_HEIGHT }}
        className="absolute bottom-0 left-0 right-0 overflow-y-auto bg-bg/90 backdrop-blur-sm border-t border-border px-4 py-3 sm:px-6 sm:py-4"
      >
        <div className="max-w-5xl mx-auto">
          {/* Top Row: Metadata (left) + Siblings (right) */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-3">
            {/* Left: Artist/Title/Metadata (star moved to footer) */}
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-display)] text-lg text-text">
                {asset.artistName}
              </p>
              <p className="text-sm text-text-muted">{asset.submissionTitle}</p>
              {knownLabels.length > 0 && (
                <p className="text-xs text-accent uppercase tracking-wide mt-1">
                  {knownLabels.map((l) => displayLabel(l.name)).join(" · ")}
                </p>
              )}
              {asset.originalFilename && (
                <p className="text-xs text-text-muted mt-1">
                  {asset.originalFilename}
                  {asset.pageNumber ? ` · page ${asset.pageNumber}` : ""}
                </p>
              )}
            </div>

            {/* Right: Siblings thumbnails */}
            {siblings.length > 1 && (
              <div className="flex gap-2 w-full sm:w-auto sm:shrink-0 sm:max-w-xs overflow-x-auto scrollbar-hide">
                {siblings.map((sib) => (
                  <button
                    key={sib.id}
                    onClick={() => onJumpToSibling(sib.id)}
                    className={`shrink-0 w-12 h-12 border overflow-hidden ${
                      sib.id === asset.id
                        ? "border-accent"
                        : "border-border opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sib.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cover Letter Link */}
          {asset.coverLetter && (
            <div className="mb-4">
              <button
                onClick={() => setShowCoverLetter(true)}
                className="text-xs text-text-muted underline hover:text-text"
              >
                Cover Letter / Statement
              </button>
            </div>
          )}

          {/* Desktop Action Row */}
          <div className="hidden sm:block border-t border-border pt-3">
            <ActionLinks
              asset={asset}
              isPending={isPending}
              isStarred={isStarred}
              onToggleStar={handleToggleStar}
              onHide={() => setShowHideConfirm(true)}
              onShare={handleShare}
              sharePending={sharePending}
              shareCopied={shareCopied}
              onPublish={() => setShowPublishConfirm(true)}
              publishPending={publishPending}
            />
          </div>

          {/* Mobile: primary row (star, share, submittable, more) + sheet
              for the rest. Share stays in the primary row rather than
              behind "More actions" — it's the headline action here, not a
              secondary one. Horizontally scrollable as a safety net on the
              narrowest phones rather than wrapping awkwardly. */}
          <div className="sm:hidden border-t border-border pt-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={handleToggleStar}
                className="text-2xl leading-none hover:scale-110 transition-transform shrink-0 cursor-pointer"
                title={isStarred ? "Remove from starred" : "Add to starred"}
                aria-label={isStarred ? "Remove from starred" : "Add to starred"}
              >
                {isStarred ? "⭐" : "☆"}
              </button>

              <button
                onClick={handleShare}
                disabled={sharePending}
                className="text-sm font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {shareCopied ? "✓ Link copied" : sharePending ? "Copying…" : "Share link"}
              </button>

              {asset.submittableUrl && (
                <a
                  href={asset.submittableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold px-3 py-2 rounded border border-border text-text hover:bg-bg-hover transition-colors whitespace-nowrap shrink-0"
                >
                  Submittable
                </a>
              )}

              <button
                onClick={() => setShowActions(true)}
                className="ml-auto flex items-center gap-0.5 text-xs text-text-muted hover:text-text transition-colors py-2 shrink-0 cursor-pointer"
              >
                More actions
                <span aria-hidden>›</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

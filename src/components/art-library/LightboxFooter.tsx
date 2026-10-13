"use client";

import { useState, useTransition, useEffect } from "react";
import { ChevronIcon } from "@/components/review/icons";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { setAssetVisibility, markAssetPublished } from "@/lib/actions/mutations";
import { createShareLink, createSubmissionShareLink } from "@/lib/actions/sharePreview";
import { useCopyLink } from "@/lib/ui/useCopyLink";
import { BADGE_LABELS, KNOWN_LABELS, badgesOf, displayLabel } from "@/lib/art-library/labels";
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
  // A failed hide/share/publish. Caught rather than thrown: an error inside
  // a transition would replace the whole gallery with the error page.
  const [actionError, setActionError] = useState<string | null>(null);
  // Keyed by asset, so "✓ Link copied" never shows against a different
  // artwork after a sibling jump.
  const share = useCopyLink();
  const artworkKey = `artwork:${asset.id}`;
  const submissionKey = `submission:${asset.submissionId}`;
  const shareArtwork = () =>
    share.copy(artworkKey, async () => `/share/${await createShareLink(asset.id)}`);
  const shareSubmission = () =>
    share.copy(
      submissionKey,
      // The artwork on screen leads the link (its preview image).
      async () => `/share/s/${await createSubmissionShareLink(asset.submissionId, asset.id)}`,
    );
  const badges = badgesOf(asset.labels);
  const knownLabels = asset.labels.filter(
    (l) => KNOWN_LABELS.includes(l.name) && !(l.name in BADGE_LABELS),
  );

  // Re-reads from localStorage whenever the lightbox navigates to a
  // different asset (sibling nav, next/prev) — isStarred is per-asset, so
  // it can't be derived once at mount.
  useEffect(() => {
    const starred = localStorage.getItem(`starred-${asset.id}`) === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (localStorage), not derivable from props/state
    setIsStarred(starred);
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
    setActionError(null);
    startTransition(async () => {
      try {
        await setAssetVisibility(asset.id, false);
      } catch {
        setActionError("Couldn't hide that artwork — please try again.");
        return;
      }
      onAssetRemoved(asset.id, null);
    });
  };

  const handlePublishConfirmed = () => {
    setShowPublishConfirm(false);
    setPublishPending(true);
    setActionError(null);
    startTransition(async () => {
      try {
        await markAssetPublished(asset.id);
      } catch {
        setPublishPending(false);
        setActionError("Couldn't publish that artwork — please try again.");
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
      {actionError && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[10002] bg-red-950/90 border border-red-500 text-red-200 text-sm px-4 py-2 rounded shadow-lg"
        >
          {actionError}
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
        // The sheet stays open so "✓ Link copied" shows where you tapped.
        onShareSubmission={shareSubmission}
        shareSubmissionLabel={share.label(submissionKey, "Share whole submission")}
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
              <p className="flex items-baseline gap-3 font-[family-name:var(--font-display)] text-lg text-text">
                {asset.artistName}
                {asset.period && (
                  <span className="font-[family-name:var(--font-ui)] text-[10px] uppercase tracking-wide text-text-muted border border-border px-1.5 py-px">
                    {asset.period.label}
                  </span>
                )}
                {badges.map((b) => (
                  <span
                    key={b}
                    className="font-[family-name:var(--font-ui)] text-[10px] uppercase tracking-wide text-accent border border-accent/70 px-1.5 py-px"
                  >
                    {b}
                  </span>
                ))}
              </p>
              {/* One line, full title on hover: a wrapped title pushed the
                  action row out of the reserved band (globals.css). */}
              <p className="text-sm text-text-muted truncate" title={asset.submissionTitle ?? ""}>
                {asset.submissionTitle}
              </p>
              {knownLabels.length > 0 && (
                <p className="text-xs text-accent uppercase tracking-wide mt-1">
                  {knownLabels.map((l) => displayLabel(l.name)).join(" · ")}
                </p>
              )}
              {(asset.originalFilename || asset.coverLetter) && (
                <p className="flex items-baseline gap-x-2 text-xs text-text-muted mt-1 min-w-0">
                  {asset.originalFilename && (
                    <span className="truncate">
                      {asset.originalFilename}
                      {asset.pageNumber ? ` · page ${asset.pageNumber}` : ""}
                    </span>
                  )}
                  {/* On the filename line rather than its own: it cost a
                      whole row of the footer's fixed height. */}
                  {asset.coverLetter && (
                    <>
                      {asset.originalFilename && <span aria-hidden>·</span>}
                      <button
                        onClick={() => setShowCoverLetter(true)}
                        className="shrink-0 underline hover:text-text"
                      >
                        Cover Letter / Statement
                      </button>
                    </>
                  )}
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

          {/* Desktop Action Row */}
          <div className="hidden sm:block border-t border-border pt-3">
            <ActionLinks
              asset={asset}
              isPending={isPending}
              isStarred={isStarred}
              onToggleStar={handleToggleStar}
              onHide={() => setShowHideConfirm(true)}
              onShare={shareArtwork}
              shareLabel={share.label(artworkKey, "Share artwork")}
              shareBusy={share.copying(artworkKey)}
              onShareSubmission={shareSubmission}
              shareSubmissionLabel={share.label(submissionKey, "Share submission")}
              shareSubmissionBusy={share.copying(submissionKey)}
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
                onClick={shareArtwork}
                disabled={share.copying(artworkKey)}
                className="text-sm font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {share.label(artworkKey, "Share link")}
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
                <ChevronIcon dir="right" className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

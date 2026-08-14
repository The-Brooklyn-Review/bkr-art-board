"use client";

import { useState, useTransition, useEffect } from "react";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { setAssetVisibility, markAssetPublished } from "@/lib/actions/mutations";
import { KNOWN_LABELS, displayLabel } from "@/lib/art-library/labels";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "./lightboxLayout";
import { ActionLinks } from "./ActionLinks";
import { ConfirmModal } from "./ConfirmModal";
import { CoverLetterModal } from "./CoverLetterModal";
import { MoreActionsSheet } from "./MoreActionsSheet";
import { CollapsibleText } from "./CollapsibleText";

export function LightboxFooter({
  asset,
  siblings,
  onJumpToSibling,
  onHidden,
}: {
  asset: LibraryAsset;
  siblings: { asset: LibraryAsset; index: number }[];
  onJumpToSibling: (index: number) => void;
  onHidden: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isStarred, setIsStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [published, setPublished] = useState(false);
  const knownLabels = asset.labels.filter((l) => KNOWN_LABELS.includes(l.name));

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
    startTransition(async () => {
      await setAssetVisibility(asset.id, false);
      onHidden();
    });
  };

  const handlePublishConfirmed = () => {
    setShowPublishConfirm(false);
    setPublishPending(true);
    startTransition(async () => {
      await markAssetPublished(asset.id);
      setPublished(true);
      setPublishPending(false);
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
        message="This will mark the artwork as published. This action cannot be undone."
        confirmText="Publish"
        onConfirm={handlePublishConfirmed}
        onCancel={() => setShowPublishConfirm(false)}
      />
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
        published={published}
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
                {siblings.map(({ asset: sib, index }) => (
                  <button
                    key={sib.id}
                    onClick={() => onJumpToSibling(index)}
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

          {/* Page Text Expansion */}
          {asset.extractedText && (
            <div className="mb-4">
              <CollapsibleText label="Page text" text={asset.extractedText} />
            </div>
          )}

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
              onPublish={() => setShowPublishConfirm(true)}
              publishPending={publishPending}
              published={published}
            />
          </div>

          {/* Mobile: primary row (star, submittable) + sheet for the rest */}
          <div className="sm:hidden border-t border-border pt-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleStar}
                className="text-2xl leading-none hover:scale-110 transition-transform"
                title={isStarred ? "Remove from starred" : "Add to starred"}
                aria-label={isStarred ? "Remove from starred" : "Add to starred"}
              >
                {isStarred ? "⭐" : "☆"}
              </button>

              {asset.submittableUrl && (
                <a
                  href={asset.submittableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90"
                >
                  Open in Submittable
                </a>
              )}

              <button
                onClick={() => setShowActions(true)}
                className="ml-auto flex items-center gap-0.5 text-xs text-text-muted hover:text-text py-2"
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

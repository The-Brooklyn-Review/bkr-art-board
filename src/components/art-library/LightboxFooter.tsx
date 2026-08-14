"use client";

import { useState, useTransition } from "react";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { setAssetVisibility, setSubmissionThumbnail } from "@/lib/actions/mutations";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "./lightboxLayout";

const KNOWN_LABELS = [
  "landscape",
  "photography",
  "figurative",
  "painting/drawing",
  "collage",
  "abstract",
  "multimedia",
];

function displayLabel(name: string): string {
  return name
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

function ActionLinks({
  asset,
  isPending,
  thumbnailSet,
  onSetThumbnail,
  onHide,
  stacked = false,
}: {
  asset: LibraryAsset;
  isPending: boolean;
  thumbnailSet: boolean;
  onSetThumbnail: () => void;
  onHide: () => void;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "flex flex-col gap-2.5 items-start" : "flex gap-4 items-center flex-wrap"}>
      {asset.submittableUrl && (
        <a
          href={asset.submittableUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent underline hover:opacity-80"
        >
          Open in Submittable
        </a>
      )}
      {asset.originalUrl && (
        <a
          href={asset.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent underline hover:opacity-80"
        >
          Open original file
        </a>
      )}
      <a href={asset.reviewUrl} className="text-xs text-accent underline hover:opacity-80">
        View full submission
      </a>
      <button
        onClick={onSetThumbnail}
        disabled={isPending || thumbnailSet}
        className="text-xs text-text-muted underline hover:text-text disabled:opacity-50"
      >
        {thumbnailSet ? "✓ Set as thumbnail" : "Set as submission thumbnail"}
      </button>
      <button
        onClick={onHide}
        disabled={isPending}
        className="text-xs text-text-muted underline hover:text-text disabled:opacity-50"
      >
        {isPending ? "Hiding…" : "Hide this page"}
      </button>
    </div>
  );
}

function CollapsibleText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-text-muted underline hover:text-text"
      >
        {open ? `Hide ${label.toLowerCase()}` : label}
      </button>
      {open && (
        <p className="text-xs text-text-muted mt-1 max-w-md whitespace-pre-wrap max-h-24 overflow-y-auto">
          {text}
        </p>
      )}
    </div>
  );
}

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
  const [thumbnailSet, setThumbnailSet] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const knownLabels = asset.labels.filter((l) => KNOWN_LABELS.includes(l.name));

  const handleHide = () => {
    startTransition(async () => {
      await setAssetVisibility(asset.id, false);
      onHidden();
    });
  };

  const handleSetThumbnail = () => {
    startTransition(async () => {
      await setSubmissionThumbnail(asset.submissionId, asset.id);
      setThumbnailSet(true);
    });
  };

  return (
    <div
      style={{ maxHeight: LIGHTBOX_FOOTER_MAX_HEIGHT }}
      className="absolute bottom-0 left-0 right-0 overflow-y-auto bg-bg/90 backdrop-blur-sm border-t border-border px-4 py-3 sm:px-6 sm:py-4"
    >
      {/*
        Side-by-side (text left, siblings right) squeezed the text column
        on mobile — that's what was wrapping the artist name/title into a
        ragged mess. flex-col-reverse stacks them instead, siblings on top,
        full width, no DOM reordering needed: sm:flex-row restores the
        original side-by-side layout unchanged at wider widths.
      */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 max-w-5xl mx-auto">
        <div className="min-w-0">
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

          {asset.extractedText && (
            <CollapsibleText label="Page text" text={asset.extractedText} />
          )}

          {/* Cover-letter toggle and the mobile "More actions" toggle
              share one row (left/right) instead of stacking as separate
              lines — two small disclosure controls, no reason to spend
              two rows on them. Generous py so both stay easy to tap.
              "More actions" only exists on mobile; on desktop this row is
              just the cover-letter toggle, same as before. */}
          <div className="mt-2 flex items-center justify-between gap-4">
            {asset.coverLetter ? (
              <button
                onClick={() => setCoverLetterOpen((v) => !v)}
                className="text-xs text-text-muted underline hover:text-text py-1.5"
              >
                {coverLetterOpen ? "Hide cover letter / statement" : "Cover letter / statement"}
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => setShowActions((v) => !v)}
              className="sm:hidden text-xs text-text-muted underline hover:text-text py-1.5"
            >
              {showActions ? "Hide actions" : "More actions"}
            </button>
          </div>
          {asset.coverLetter && coverLetterOpen && (
            <p className="text-xs text-text-muted mt-1 max-w-md whitespace-pre-wrap max-h-24 overflow-y-auto">
              {asset.coverLetter}
            </p>
          )}

          {/* Desktop: always visible, unchanged. Mobile: five links
              wrapping into a ragged multi-line block was the crowding
              problem — collapsed behind "More actions" above instead,
              stacked vertically (more thumb-friendly) when opened. */}
          <div className="hidden sm:block mt-2">
            <ActionLinks
              asset={asset}
              isPending={isPending}
              thumbnailSet={thumbnailSet}
              onSetThumbnail={handleSetThumbnail}
              onHide={handleHide}
            />
          </div>
          {showActions && (
            <div className="sm:hidden mt-2.5">
              <ActionLinks
                asset={asset}
                isPending={isPending}
                thumbnailSet={thumbnailSet}
                onSetThumbnail={handleSetThumbnail}
                onHide={handleHide}
                stacked
              />
            </div>
          )}
        </div>

        {siblings.length > 1 && (
          <div className="flex gap-2 w-full sm:w-auto sm:shrink-0 sm:max-w-xs overflow-x-auto scrollbar-hide">
            {siblings.map(({ asset: sib, index }) => (
              <button
                key={sib.id}
                onClick={() => onJumpToSibling(index)}
                className={`shrink-0 w-12 h-12 border overflow-hidden ${
                  sib.id === asset.id ? "border-accent" : "border-border opacity-60 hover:opacity-100"
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
    </div>
  );
}

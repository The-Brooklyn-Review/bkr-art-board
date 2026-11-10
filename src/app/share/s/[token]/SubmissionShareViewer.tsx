"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomableLightbox } from "@/components/art-library/ZoomableLightbox";
import { ShareActions } from "../../ShareActions";

// The piece on screen lives in the URL hash, 1-based (#3), so a link
// copied from the address bar opens on that piece rather than the first.
function pieceFromHash(count: number): number | null {
  const n = Number.parseInt(window.location.hash.slice(1), 10);
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : null;
}

// Room for the footer: name, title, the strip of pieces and the button.
const FOOTER_RESERVE = "min(34vh, 232px)";

// A shared submission: the same viewer as the Gallery and the
// single-artwork share page, paging through the pieces. Shows only what a
// public share may — the pieces, the artist's name and the title. No
// statement, contact details, labels or review notes.
export function SubmissionShareViewer({
  pieces,
  artistName,
  submissionTitle,
  openUrl,
  submittableUrl,
  startIndex,
}: {
  pieces: { src: string; width: number | null; height: number | null }[];
  artistName: string | null;
  submissionTitle: string | null;
  openUrl: string;
  submittableUrl: string | null;
  /** The piece that was on screen when it was shared. */
  startIndex: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const several = pieces.length > 1;
  const alt = submissionTitle || "Shared artwork";

  // The hash is only on the client, so it's read after mount. Until it has
  // been, the lightbox's first "view" (of startIndex) mustn't overwrite it.
  const hashRead = useRef(false);
  useEffect(() => {
    if (!several) return;
    const fromHash = () => {
      const i = pieceFromHash(pieces.length);
      if (i !== null) setIndex(i);
    };
    fromHash();
    hashRead.current = true;
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [several, pieces.length]);

  const view = (i: number) => {
    setIndex(i);
    // replaceState, not a new history entry per piece, so Back still
    // leaves the page.
    if (several && hashRead.current && pieceFromHash(pieces.length) !== i) {
      window.history.replaceState(null, "", `#${i + 1}`);
    }
  };

  return (
    <ZoomableLightbox
      open
      close={() => {}}
      index={index}
      on={{ view: ({ index: i }) => view(i) }}
      slides={pieces.map((p, i) => ({
        src: p.src,
        alt: `${alt} — ${i + 1} of ${pieces.length}`,
        width: p.width ?? undefined,
        height: p.height ?? undefined,
      }))}
      carousel={{ finite: true }}
      controller={{ disableSwipeNavigation: !several }}
      render={{
        buttonClose: () => null,
        ...(several ? {} : { buttonPrev: () => null, buttonNext: () => null }),
        slideFooter: () => (
          <div
            style={{ maxHeight: FOOTER_RESERVE }}
            className="absolute bottom-0 left-0 right-0 overflow-y-auto bg-bg/90 backdrop-blur-sm border-t border-border px-4 py-3 sm:px-6 sm:py-4"
          >
            <div className="max-w-5xl mx-auto">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-display)] text-lg text-text">
                    {artistName || "Unknown artist"}
                  </p>
                  <p className="text-sm text-text-muted truncate" title={submissionTitle ?? ""}>
                    {submissionTitle || "Untitled"}
                  </p>
                </div>
                {several && (
                  <p className="shrink-0 text-xs text-text-muted tabular-nums">
                    {index + 1} of {pieces.length}
                  </p>
                )}
              </div>

              {several && (
                <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
                  {pieces.map((p, i) => (
                    <button
                      key={p.src}
                      type="button"
                      onClick={() => view(i)}
                      aria-label={`Piece ${i + 1}`}
                      aria-current={i === index ? "true" : undefined}
                      className={`shrink-0 w-12 h-12 border overflow-hidden ${
                        i === index ? "border-accent" : "border-border opacity-60 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <ShareActions submittableUrl={submittableUrl} openUrl={openUrl} className="mt-3" />
            </div>
          </div>
        ),
      }}
      styles={{ slide: { paddingBottom: FOOTER_RESERVE } }}
    />
  );
}

"use client";

import { useState } from "react";
import { ZoomableLightbox } from "@/components/art-library/ZoomableLightbox";

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
  startIndex,
}: {
  pieces: { src: string; width: number | null; height: number | null }[];
  artistName: string | null;
  submissionTitle: string | null;
  openUrl: string;
  /** The piece that was on screen when it was shared. */
  startIndex: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const several = pieces.length > 1;
  const alt = submissionTitle || "Shared artwork";

  return (
    <ZoomableLightbox
      open
      close={() => {}}
      index={index}
      on={{ view: ({ index: i }) => setIndex(i) }}
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
                      onClick={() => setIndex(i)}
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

              <a
                href={openUrl}
                className="inline-block mt-3 font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90"
              >
                Open in BKR Art Board
              </a>
            </div>
          </div>
        ),
      }}
      styles={{ slide: { paddingBottom: FOOTER_RESERVE } }}
    />
  );
}

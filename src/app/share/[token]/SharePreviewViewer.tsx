"use client";

import { ZoomableLightbox } from "@/components/art-library/ZoomableLightbox";
import { LIGHTBOX_FOOTER_MAX_HEIGHT } from "@/components/art-library/lightboxLayout";

// Same viewer as the authenticated Art Library (ZoomableLightbox — same
// zoom/pan config, same dark overlay) so this doesn't feel like a
// second-class experience. Footer mirrors LightboxFooter's chrome
// (same classes, same reserved-height convention) but only shows what a
// public share is allowed to: artist, title, and a way to the real thing —
// no star/hide/publish, no siblings, no cover letter.
export function SharePreviewViewer({
  imageUrl,
  alt,
  artistName,
  submissionTitle,
  assetId,
}: {
  imageUrl: string;
  alt: string;
  artistName: string | null;
  submissionTitle: string | null;
  assetId: string;
}) {
  return (
    <ZoomableLightbox
      open
      close={() => {}}
      index={0}
      slides={[{ src: imageUrl, alt }]}
      render={{
        buttonClose: () => null,
        buttonPrev: () => null,
        buttonNext: () => null,
        slideFooter: () => (
          <div
            style={{ maxHeight: LIGHTBOX_FOOTER_MAX_HEIGHT }}
            className="absolute bottom-0 left-0 right-0 overflow-y-auto bg-bg/90 backdrop-blur-sm border-t border-border px-4 py-3 sm:px-6 sm:py-4"
          >
            <div className="max-w-5xl mx-auto">
              <div className="mb-3">
                <p className="font-[family-name:var(--font-display)] text-lg text-text">
                  {artistName || "Unknown artist"}
                </p>
                <p className="text-sm text-text-muted">{submissionTitle || "Untitled"}</p>
              </div>

              <div className="border-t border-border pt-3 flex items-center justify-between gap-3 flex-wrap">
                <a
                  href={`/art-library?asset=${assetId}`}
                  className="font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90"
                >
                  Open in TBR Art Board
                </a>
                <p className="text-xs text-text-muted uppercase tracking-wide">
                  Shared from The Brooklyn Review
                </p>
              </div>
            </div>
          </div>
        ),
      }}
      styles={{ slide: { paddingBottom: LIGHTBOX_FOOTER_MAX_HEIGHT } }}
    />
  );
}

"use client";

import type { ComponentProps } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

// The named `LightboxProps` export is the library's fully-resolved internal
// prop type (post-defaults) — using it here made every optional prop
// required. ComponentProps<typeof Lightbox> is the actual public,
// all-optional-except-open/close prop type the default export accepts.
type Props = ComponentProps<typeof Lightbox>;

// Shared by the authenticated Art Library lightbox (ArtLibraryClient.tsx)
// and the public share page — same zoom behavior and background styling in
// both places, on purpose, so they feel like the same viewer rather than
// two independent builds that happen to look similar today and drift
// later. `plugins`/`zoom` are intentionally not overridable per-caller;
// `styles` merges shallowly so a caller can add its own slot without
// losing the shared container background.
export function ZoomableLightbox({ styles, ...props }: Omit<Props, "plugins" | "zoom">) {
  return (
    <Lightbox
      plugins={[Zoom]}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      styles={{ container: { backgroundColor: "rgba(14, 14, 13, 0.97)" }, ...styles }}
      {...props}
    />
  );
}

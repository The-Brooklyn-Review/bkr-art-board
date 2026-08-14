// Shared between ArtLibraryClient's slide padding and LightboxFooter's own
// max-height — the footer is an overlay (positioned by the library), so the
// image is only guaranteed to stay clear of it if both sides agree on the
// same reserved band. A fixed value rather than the footer's real measured
// height: the library renders slideFooter for the preloaded prev/next
// slides too, all sharing one style value, so a live measurement can race
// against an off-screen neighbor and end up applied to whatever's actually
// on screen (see git history — tried it, made things worse). Native
// out-of-the-box centering (the library's own .yarl__slide_wrapper carries
// yarl__flex_center by default) keeps a smaller-than-reserved image looking
// intentional rather than misplaced.
//
// Resolves to a CSS custom property (--lightbox-footer-reserve, defined in
// globals.css) rather than a plain string, so it can be responsive —
// LightboxFooter's mobile layout stacks the siblings row above the
// metadata block instead of sharing one row with it like desktop does, so
// it genuinely needs more room. Still fully static/CSS-resolved, no JS
// measurement — see globals.css for the actual mobile/desktop values and
// why. SharePreviewViewer's footer content is fixed and known (always just
// artist, title, one button — never siblings/labels/a cover-letter link),
// so it uses its own smaller, non-responsive SHARE_FOOTER_MAX_HEIGHT
// instead of this one.
export const LIGHTBOX_FOOTER_MAX_HEIGHT = "var(--lightbox-footer-reserve)";

// SharePreviewViewer's footer content is fixed and known — always exactly
// artist name, title, and one button, never siblings/labels/a cover-letter
// link — so it can reserve much less than LIGHTBOX_FOOTER_MAX_HEIGHT without
// risking the overlap that value is sized to prevent for the fuller footer.
export const SHARE_FOOTER_MAX_HEIGHT = "min(20vh, 180px)";

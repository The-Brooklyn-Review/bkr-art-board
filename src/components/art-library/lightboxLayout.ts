// Shared between ArtLibraryClient's slide padding and LightboxFooter's own
// max-height — the footer is an overlay (positioned by the library), so the
// image is only guaranteed to stay clear of it if both sides agree on the
// same reserved band.
export const LIGHTBOX_FOOTER_MAX_HEIGHT = "min(38vh, 320px)";

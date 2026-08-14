// Shared across ArtCard, ArtLibraryClient, and LightboxFooter — the fixed
// set of category labels the UI knows how to render/filter by, in display
// order. Anything on an asset outside this list is ignored by these views.
export const KNOWN_LABELS = [
  "landscape",
  "photography",
  "figurative",
  "painting/drawing",
  "collage",
  "abstract",
  "multimedia",
];

export function displayLabel(name: string): string {
  return name
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

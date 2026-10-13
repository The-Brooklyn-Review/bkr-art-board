// Shared across ArtCard, ArtLibraryClient, and LightboxFooter — the fixed
// set of category labels the UI knows how to render/filter by, in display
// order. Anything on an asset outside this list is ignored by these views.
// Lowercase: getAssets.ts lowercases label names, since Submittable's own
// casing is inconsistent ("landscape", "A Grade", "B GRADE").
export const KNOWN_LABELS = [
  "landscape",
  "photography",
  "figurative",
  "painting/drawing",
  "collage",
  "abstract",
  "multimedia",
  "a grade",
  "b grade",
];

/** "painting/drawing" → "Painting/Drawing", "b grade" → "B Grade". */
export function displayLabel(name: string): string {
  return name.replace(/(^|[\s/])(\S)/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

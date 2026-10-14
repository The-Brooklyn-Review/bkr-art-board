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
  "sculpture/textile/object",
  "a grade",
  "b grade",
  "use for poetry",
  "use for fiction",
];

/** "painting/drawing" → "Painting/Drawing", "b grade" → "B Grade",
 * "use for poetry" → "Use for Poetry". */
export function displayLabel(name: string): string {
  if (name.startsWith("use for ")) return `Use for ${capitalize(name.slice(8))}`;
  return name.replace(/(^|[\s/])(\S)/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Labels the poetry and fiction editors use to flag work they'd like —
 * shown as a badge on the artwork, not in the plain label line, so they
 * stand out to anyone browsing the gallery.
 */
export const BADGE_LABELS: Record<string, string> = {
  "use for poetry": "For poetry",
  "use for fiction": "For fiction",
};

/** An asset's badge labels, in a fixed order. */
export function badgesOf(labels: { name: string }[]): string[] {
  return Object.keys(BADGE_LABELS)
    .filter((key) => labels.some((l) => l.name === key))
    .map((key) => BADGE_LABELS[key]);
}

/**
 * The category labels grouped for the gallery's filter menu — they're a
 * mix of medium, style and the art editors' grade. Every KNOWN_LABELS
 * entry except the badge labels is in exactly one group (tested).
 */
export const LABEL_GROUPS: { heading: string; labels: string[] }[] = [
  {
    heading: "Medium",
    labels: [
      "painting/drawing",
      "photography",
      "collage",
      "sculpture/textile/object",
      "multimedia",
    ],
  },
  { heading: "Style", labels: ["abstract", "figurative", "landscape"] },
  { heading: "Grade", labels: ["a grade", "b grade"] },
];

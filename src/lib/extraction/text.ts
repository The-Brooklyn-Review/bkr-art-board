// Text clean-up for metadata the extractor stores (scripts/extract-metadata.ts).

/** Names that keep their capital when a Title Case medium is lowered. */
const PROPER = new Map(
  [
    "Japanese",
    "Chinese",
    "Korean",
    "Indian",
    "Nepalese",
    "Thai",
    "French",
    "Italian",
    "Mylar",
    "Yupo",
    "Arches",
    "Stonehenge",
    "Dura-Lar",
    "Plexiglas",
    "Plexiglass",
    "Sharpie",
    "Prismacolor",
    "Procreate",
    "Photoshop",
    "Polaroid",
    "Kodak",
    "Fuji",
  ].map((w) => [w.toLowerCase(), w]),
);
const PROPER_WORDS = new RegExp(`\\b(${[...PROPER.keys()].join("|")})\\b`, "g");

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * Sentence case for a medium: "digital photography" → "Digital photography".
 * Only the first letter changes, so names inside keep their capitals
 * ("oil and China marker on Japanese paper"). Title Case or ALL CAPS
 * phrases ("Graphite On Paper", "OIL ON CANVAS") are lowered first, since
 * those capitals are styling, not names; a lone acronym ("PLA") is kept.
 */
export function sentenceCase(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const words = s.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  const allCaps = s === s.toUpperCase() && /\p{Lu}/u.test(s);
  // "Oil on Canvas" counts too: small joining words are often left lower.
  const major = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const titleCase = major.length > 1 && major.every((w) => /^\p{Lu}/u.test(w));
  const lowered = (allCaps && words.length > 1) || (titleCase && !allCaps);
  const base = lowered ? s.toLowerCase().replace(PROPER_WORDS, (w) => PROPER.get(w)!) : s;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

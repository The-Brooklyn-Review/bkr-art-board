// Which reading period a submission came in during — "Winter ’25",
// "Fall ’26" — so the gallery can tell cycles apart even though Submittable
// now keeps them in one project (Winter 2025 was merged into Fall 2026).
//
// Derived from the submission date by season, so a new cycle needs no
// configuration:
//   Sep–Nov → Fall of that year
//   Dec–Feb → Winter, named for the December's year (Jan 2026 → Winter ’25)
//   Mar–May → Spring, Jun–Aug → Summer
// If a window ever straddles a season boundary (say, Nov 15 – Dec 15), add
// an override here rather than letting it split in two.
// Pure — shared by server and client.

export interface ReadingPeriod {
  /** Stable key, e.g. "2025-winter". */
  id: string;
  /** Display, e.g. "Winter ’25". */
  label: string;
  /** Chronological: earlier periods sort first. */
  sortKey: number;
}

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

export function readingPeriodOf(date: Date | string | null | undefined): ReadingPeriod | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  // New York time: a submission at 11pm on Nov 30 ET is still November.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);

  let season: (typeof SEASONS)[number];
  let seasonYear = year;
  if (month === 12) season = "Winter";
  else if (month <= 2) {
    season = "Winter";
    seasonYear = year - 1;
  } else if (month <= 5) season = "Spring";
  else if (month <= 8) season = "Summer";
  else season = "Fall";

  const index = SEASONS.indexOf(season);
  return {
    id: `${seasonYear}-${season.toLowerCase()}`,
    label: `${season} ’${String(seasonYear).slice(-2)}`,
    sortKey: seasonYear * 10 + index,
  };
}

/** The submission date Submittable reported, from the stored list item. */
export function submissionDateOf(rawSubmissionJson: unknown): string | null {
  if (!rawSubmissionJson || typeof rawSubmissionJson !== "object") return null;
  const v = (rawSubmissionJson as Record<string, unknown>).submissionDate;
  return typeof v === "string" ? v : null;
}

// Date formatting with a fixed locale and time zone, so server-rendered
// text never depends on where the server runs (and never mismatches on
// hydration). BKR is in New York.
const TZ = "America/New_York";

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "never";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });
}

/**
 * Browser-tab title for one submission or artwork: the artist first (tabs
 * cut titles short), then the work. "Al Varady — Contemporary Alters · BKR".
 */
export function workTabTitle(artist: string | null, title: string | null): string {
  const work = [artist?.trim(), title?.trim()].filter(Boolean).join(" — ");
  return `${work || "Untitled"} · BKR`;
}

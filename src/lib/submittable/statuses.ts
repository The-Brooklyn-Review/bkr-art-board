// What Submittable's submission statuses mean at BKR — see
// docs/SPEC-review-and-sync.md §2. Kept in one place so the importer, the
// sync, the gallery, and the reviewer can't drift apart.

/** Review is finished, one way or another. Everything else is undecided. */
export const DECIDED_STATUSES = ["completed", "accepted", "declined", "withdrawn"] as const;

/** Accepted = slated to publish or already published. `published` isn't used at BKR, but means the same if it ever appears. */
export const PUBLISHED_STATUSES = ["accepted", "published"] as const;

/**
 * Undecided = still needs review. Defined by exclusion on purpose: a status
 * nobody anticipated shows up in the reviewer queue instead of vanishing.
 * `published` is excluded too — it means the same as `accepted`.
 */
export function isUndecided(status: string | null | undefined): boolean {
  if (!status) return true;
  return !(DECIDED_STATUSES as readonly string[]).includes(status) && status !== "published";
}

/** The status groups the reviewer list filters by. */
export type StatusGroup = "undecided" | "completed" | "accepted" | "declined" | "all";

export const STATUS_GROUPS: { value: StatusGroup; label: string }[] = [
  { value: "undecided", label: "Undecided" },
  { value: "completed", label: "Completed" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "all", label: "All" },
];

export function statusGroupOf(status: string | null | undefined): Exclude<StatusGroup, "all"> {
  if (isUndecided(status)) return "undecided";
  if (status === "completed") return "completed";
  if (status === "declined" || status === "withdrawn") return "declined";
  return "accepted";
}

/** Human label for a raw Submittable status ("in_progress" → "In progress"). */
export function displayStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

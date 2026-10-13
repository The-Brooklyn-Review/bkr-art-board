// Review decisions and the Submittable note they're posted as
// (docs/SPEC-review-and-sync.md §7.2). Pure functions — no I/O — so the
// exact note text is unit-tested.

export const DECISIONS = [
  { value: "accept", label: "Accept", noteLabel: "ACCEPT" },
  { value: "tiered_reject", label: "Tiered Reject", noteLabel: "TIERED REJECT" },
  { value: "reject", label: "Reject", noteLabel: "REJECT" },
] as const;

export type Decision = (typeof DECISIONS)[number]["value"];

export function isDecision(value: unknown): value is Decision {
  return DECISIONS.some((d) => d.value === value);
}

export function decisionLabel(decision: string): string {
  return DECISIONS.find((d) => d.value === decision)?.label ?? decision;
}

/** Submittable rejects notes over 8,000 characters. */
export const SUBMITTABLE_NOTE_MAX = 8000;
/** Leaves room for the header line. */
export const COMMENT_MAX = 7800;
export const REVIEWER_NAME_MAX = 80;

/** Visibility for posted notes — Submittable's "Assigned Team" (believed; verify on first note). */
export const NOTE_VISIBILITY = "team";

/** "Oct 12, 2026" — fixed locale and time zone so the text never depends on the server. */
export function formatNoteDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/**
 * The exact note text posted to Submittable:
 *
 *   TIERED REJECT · Thomas Mathew · Oct 12, 2026
 *   Strong palette, but the series repeats after the third piece.
 *
 * Decision first, in caps, so it's scannable in Submittable's activity
 * feed; the reviewer's name in the text because API-posted notes appear
 * authored by the API key's owner.
 */
export function formatNoteText(input: {
  decision: Decision;
  reviewerName: string;
  comment?: string | null;
  date: Date;
}): string {
  const label = DECISIONS.find((d) => d.value === input.decision)!.noteLabel;
  const header = `${label} · ${input.reviewerName.trim()} · ${formatNoteDate(input.date)}`;
  const comment = input.comment?.trim();
  return comment ? `${header}\n${comment}` : header;
}

export type DecisionInputError =
  "missing_decision" | "missing_name" | "name_too_long" | "comment_too_long";

/** Validates user input before anything is written or posted. */
export function validateDecisionInput(input: {
  decision: unknown;
  reviewerName: string;
  comment?: string | null;
}): DecisionInputError | null {
  if (!isDecision(input.decision)) return "missing_decision";
  const name = input.reviewerName.trim();
  if (!name) return "missing_name";
  if (name.length > REVIEWER_NAME_MAX) return "name_too_long";
  if ((input.comment?.trim().length ?? 0) > COMMENT_MAX) return "comment_too_long";
  return null;
}

/**
 * Each reviewer's current decision = their most recent one. Decisions are
 * append-only (Submittable notes can't be edited), so history is kept and
 * this picks the latest per reviewer. Keyed by reviewerId when known,
 * otherwise by the name written on the note.
 */
export function latestDecisionPerReviewer<
  T extends { reviewerId: string | null; reviewerName: string; createdAt: Date },
>(decisions: T[]): T[] {
  const latest = new Map<string, T>();
  for (const d of decisions) {
    const key = d.reviewerId ?? `name:${d.reviewerName.trim().toLowerCase()}`;
    const prev = latest.get(key);
    if (!prev || d.createdAt > prev.createdAt) latest.set(key, d);
  }
  return [...latest.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

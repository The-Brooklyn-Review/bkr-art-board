// The labels a reviewer can apply from the app (docs/SPEC-review-and-sync.md
// §6.1). Identified by Submittable label ID, not name — Submittable's own
// casing is inconsistent ("landscape", "A Grade", "B GRADE") and names can
// be edited there; IDs can't. IDs confirmed by scripts/dry-run.ts against
// the live account on 2026-10-13.
//
// "Consider" and "acceptance" are deliberately absent: editors set those in
// Submittable when they change a submission's status.

export interface ReviewerLabel {
  submittableLabelId: string;
  /** BKR's capitalisation, used for display regardless of Submittable's. */
  name: string;
}

export const REVIEWER_LABELS: readonly ReviewerLabel[] = [
  { submittableLabelId: "62a64341-67f7-4465-90c9-22cfcdab42a4", name: "Landscape" },
  { submittableLabelId: "92eb7d4c-637c-44a0-aa11-ba54dd48e83c", name: "Photography" },
  { submittableLabelId: "1172c1d8-d6d9-4d9f-a45f-b69ccdd64968", name: "Figurative" },
  { submittableLabelId: "6ac4913a-ad1e-4dc9-9d9a-6aeccc906f4b", name: "Painting/Drawing" },
  { submittableLabelId: "cb783812-3176-43ec-b6c1-b896b9bad334", name: "Multimedia" },
  { submittableLabelId: "2fa059a7-ed1f-4439-9fb6-2dea32fa1f21", name: "Abstract" },
  { submittableLabelId: "af88cbb0-4482-4462-9b1d-f9d780782388", name: "Collage" },
  { submittableLabelId: "1c168259-cd77-4b47-b07f-47132cfd0e8b", name: "A Grade" },
  { submittableLabelId: "c59c8c7f-8b5e-478a-9230-77a6e4f24b50", name: "B Grade" },
];

const BY_ID = new Map(REVIEWER_LABELS.map((l) => [l.submittableLabelId, l]));

export function isReviewerLabel(submittableLabelId: string): boolean {
  return BY_ID.has(submittableLabelId);
}

export function reviewerLabelName(submittableLabelId: string): string | null {
  return BY_ID.get(submittableLabelId)?.name ?? null;
}

// "Consider" and "Under Consideration" are two Submittable labels used for
// the same thing (2026-10-14: 46 and 7 submissions, none with both). The
// app treats them as one, shown as "Under Consideration"; Submittable keeps
// both. Pure — shared by server and client.

/** Consider first: it's the canonical id the review-list filter uses. */
export const CONSIDERATION_LABEL_IDS = [
  "12f06803-c610-4662-b1a6-ed88be42a8b2", // Consider
  "52905365-9e78-4861-91f9-e7177a75a228", // Under Consideration
] as const;

export const CONSIDERATION_LABEL_ID = CONSIDERATION_LABEL_IDS[0];
export const CONSIDERATION_NAME = "Under Consideration";

/** Either consideration label → the one id; any other label unchanged. */
export function canonicalLabelId(submittableLabelId: string): string {
  return (CONSIDERATION_LABEL_IDS as readonly string[]).includes(submittableLabelId)
    ? CONSIDERATION_LABEL_ID
    : submittableLabelId;
}

/** The Submittable label ids a filter on this id should match. */
export function labelIdsMatching(submittableLabelId: string): string[] {
  return submittableLabelId === CONSIDERATION_LABEL_ID
    ? [...CONSIDERATION_LABEL_IDS]
    : [submittableLabelId];
}

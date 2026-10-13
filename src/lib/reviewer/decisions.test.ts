import { describe, expect, it } from "vitest";
import {
  formatNoteText,
  latestDecisionPerReviewer,
  validateDecisionInput,
  COMMENT_MAX,
} from "./decisions";

const date = new Date("2026-10-13T03:00:00Z"); // still Oct 12 in New York

describe("formatNoteText", () => {
  it("puts the decision first, then reviewer and New York date, then the comment", () => {
    expect(
      formatNoteText({
        decision: "tiered_reject",
        reviewerName: "  Thomas Mathew ",
        comment: " Strong palette, but the series repeats after the third piece. ",
        date,
      }),
    ).toBe(
      "TIERED REJECT · Thomas Mathew · Oct 12, 2026\nStrong palette, but the series repeats after the third piece.",
    );
  });

  it("omits the comment line when there's no comment", () => {
    expect(
      formatNoteText({ decision: "accept", reviewerName: "Jaden Schoenfeld", comment: "  ", date }),
    ).toBe("ACCEPT · Jaden Schoenfeld · Oct 12, 2026");
  });

  it("stays under Submittable's 8,000-character limit at the maximum comment length", () => {
    const text = formatNoteText({
      decision: "reject",
      reviewerName: "x".repeat(80),
      comment: "y".repeat(COMMENT_MAX),
      date,
    });
    expect(text.length).toBeLessThanOrEqual(8000);
  });
});

describe("validateDecisionInput", () => {
  it("requires a decision and a name", () => {
    expect(validateDecisionInput({ decision: "", reviewerName: "T" })).toBe("missing_decision");
    expect(validateDecisionInput({ decision: "accept", reviewerName: " " })).toBe("missing_name");
    expect(validateDecisionInput({ decision: "consider", reviewerName: "T" })).toBe(
      "missing_decision",
    );
  });
  it("rejects over-long comments", () => {
    expect(
      validateDecisionInput({
        decision: "accept",
        reviewerName: "T",
        comment: "y".repeat(COMMENT_MAX + 1),
      }),
    ).toBe("comment_too_long");
  });
  it("accepts a valid decision without a comment", () => {
    expect(validateDecisionInput({ decision: "reject", reviewerName: "T" })).toBeNull();
  });
});

describe("latestDecisionPerReviewer", () => {
  it("keeps only each reviewer's most recent decision", () => {
    const d = (id: string | null, name: string, t: number, decision: string) => ({
      reviewerId: id,
      reviewerName: name,
      createdAt: new Date(t),
      decision,
    });
    const out = latestDecisionPerReviewer([
      d("a", "Thomas", 1, "reject"),
      d("a", "Thomas", 3, "accept"),
      d("b", "Jaden", 2, "tiered_reject"),
      d(null, "Guest", 4, "reject"),
    ]);
    expect(out.map((x) => [x.reviewerName, x.decision])).toEqual([
      ["Jaden", "tiered_reject"],
      ["Thomas", "accept"],
      ["Guest", "reject"],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { workTabTitle } from "./format";

describe("workTabTitle", () => {
  it("leads with the artist, then the work", () => {
    expect(workTabTitle("Al Varady", "Contemporary Alters")).toBe(
      "Al Varady — Contemporary Alters · BKR",
    );
  });
  it("copes with either part missing", () => {
    expect(workTabTitle("Al Varady", null)).toBe("Al Varady · BKR");
    expect(workTabTitle(null, "  Visual Art Submission ")).toBe("Visual Art Submission · BKR");
    expect(workTabTitle(null, null)).toBe("Untitled · BKR");
  });
});

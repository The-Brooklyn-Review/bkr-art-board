import { describe, expect, it } from "vitest";
import { bucketStatusCounts, searchTerms } from "./queue";

describe("searchTerms", () => {
  it("splits on any run of whitespace", () => {
    expect(searchTerms("  Anna   Cho ")).toEqual(["Anna", "Cho"]);
  });
  it("is empty for a blank search", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("bucketStatusCounts", () => {
  it("puts each Submittable status in its filter group and totals them", () => {
    expect(
      bucketStatusCounts([
        [null, 2],
        ["in_progress", 3],
        ["completed", 4],
        ["accepted", 1],
        ["published", 1],
        ["declined", 5],
        ["withdrawn", 1],
      ]),
    ).toEqual({ undecided: 5, completed: 4, accepted: 2, declined: 6, all: 17 });
  });
});

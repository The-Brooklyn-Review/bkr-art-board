import { describe, expect, it } from "vitest";
import { bucketStatusCounts, decisionsOf, searchTerms } from "./queue";
import { DEFAULT_FILTERS } from "./filters";

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

describe("decisionsOf", () => {
  const me = "11111111-1111-1111-1111-111111111111";
  const jaden = "22222222-2222-2222-2222-222222222222";
  const f = (assigned: string) => ({ ...DEFAULT_FILTERS, assigned });
  it("follows the Assigned filter", () => {
    expect(decisionsOf(f("me"), me)).toBe(me);
    expect(decisionsOf(f(jaden), me)).toBe(jaden);
    expect(decisionsOf(f("all"), me)).toBeNull();
    expect(decisionsOf(f("unassigned"), me)).toBeNull();
  });
});

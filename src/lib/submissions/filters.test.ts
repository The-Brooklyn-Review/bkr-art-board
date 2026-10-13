import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filtersToQuery, parseFilters } from "./filters";

const uuid = "08e7c007-5577-4869-9d3b-ca7fdef2670a";

describe("reviewer list filters", () => {
  it("defaults to my undecided submissions", () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
  });
  it("round-trips through the URL", () => {
    const f = parseFilters({
      status: "completed",
      assigned: uuid,
      labels: `${uuid},${uuid}`,
      decision: "tiered_reject",
      q: "collage",
    });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))))).toEqual(f);
  });
  it("still reads the old 'decided by me' links", () => {
    expect(parseFilters({ mine: "todo" }).decision).toBe("none");
    expect(parseFilters({ mine: "done" }).decision).toBe("decided");
  });
  it("ignores junk values instead of failing", () => {
    expect(
      parseFilters({ status: "bogus", assigned: "'; drop", labels: "nope", decision: "x" }),
    ).toEqual(DEFAULT_FILTERS);
  });
});

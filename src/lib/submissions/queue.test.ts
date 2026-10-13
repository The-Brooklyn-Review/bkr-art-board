import { describe, expect, it } from "vitest";
import { searchTerms } from "./queue";

describe("searchTerms", () => {
  it("splits on any run of whitespace", () => {
    expect(searchTerms("  Anna   Cho ")).toEqual(["Anna", "Cho"]);
  });
  it("is empty for a blank search", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

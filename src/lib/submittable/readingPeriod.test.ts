import { describe, expect, it } from "vitest";
import { readingPeriodOf, submissionDateOf } from "./readingPeriod";

describe("readingPeriodOf", () => {
  it("names the Dec–Jan window for December's year", () => {
    expect(readingPeriodOf("2025-12-29T23:19:20Z")?.label).toBe("Winter ’25");
    expect(readingPeriodOf("2026-01-10T12:00:00Z")?.id).toBe("2025-winter");
  });
  it("puts September–November in Fall", () => {
    expect(readingPeriodOf("2026-09-14T12:00:00Z")?.label).toBe("Fall ’26");
    expect(readingPeriodOf("2026-11-30T12:00:00Z")?.id).toBe("2026-fall");
  });
  it("uses New York time at the boundary", () => {
    // 01:00 UTC Dec 1 is still Nov 30 in New York.
    expect(readingPeriodOf("2026-12-01T01:00:00Z")?.id).toBe("2026-fall");
  });
  it("orders periods chronologically", () => {
    const w = readingPeriodOf("2025-12-01T12:00:00Z")!;
    const f = readingPeriodOf("2026-09-01T12:00:00Z")!;
    expect(w.sortKey).toBeLessThan(f.sortKey);
  });
  it("returns null for missing or bad dates", () => {
    expect(readingPeriodOf(null)).toBeNull();
    expect(readingPeriodOf("not a date")).toBeNull();
  });
});

describe("submissionDateOf", () => {
  it("reads submissionDate from the stored list item", () => {
    expect(submissionDateOf({ submissionDate: "2025-12-29T23:19:20.467Z" })).toBe(
      "2025-12-29T23:19:20.467Z",
    );
    expect(submissionDateOf(null)).toBeNull();
    expect(submissionDateOf({})).toBeNull();
  });
});

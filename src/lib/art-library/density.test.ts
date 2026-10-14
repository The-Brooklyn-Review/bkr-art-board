import { describe, expect, it } from "vitest";
import { columnsAt } from "./density";

describe("columnsAt", () => {
  it("M (the default) adds a column per breakpoint, starting at one on a phone", () => {
    expect([375, 480, 600, 640, 800, 1100, 1440, 1920].map((w) => columnsAt("default", w))).toEqual(
      [1, 1, 2, 2, 3, 4, 5, 6],
    );
  });
  it("gives the phone toggle one per row (L) and two per row (S)", () => {
    expect(columnsAt("large", 375)).toBe(1);
    expect(columnsAt("compact", 375)).toBe(2);
  });
});

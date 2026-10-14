import { describe, expect, it } from "vitest";
import { cardSizes, columnsAt } from "./density";

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

describe("cardSizes", () => {
  it("describes each breakpoint's card width, narrowest first, default last", () => {
    expect(cardSizes("default")).toBe(
      [
        "(max-width: 480px) calc((100vw - 16px) / 1 - 16px)",
        "(max-width: 640px) calc((100vw - 16px) / 2 - 16px)",
        "(max-width: 960px) calc((100vw - 32px) / 3 - 16px)",
        "(max-width: 1280px) calc((100vw - 32px) / 4 - 16px)",
        "(max-width: 1600px) calc((100vw - 32px) / 5 - 16px)",
        "calc((100vw - 32px) / 6 - 16px)",
      ].join(", "),
    );
  });
});

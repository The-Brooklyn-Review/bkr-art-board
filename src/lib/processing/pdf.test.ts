import { describe, expect, it } from "vitest";
import { capDpiForPageSizes, MAX_RENDER_LONG_SIDE_PX } from "./pdf";

describe("capDpiForPageSizes", () => {
  it("leaves ordinary pages at the requested dpi", () => {
    // US Letter: 612 x 792 pts → 2,420 px long side at 220 dpi.
    expect(capDpiForPageSizes(220, [{ width: 612, height: 792 }])).toBe(220);
  });

  it("lowers dpi so the largest page fits the pixel cap", () => {
    // 60 x 60 inch poster page → 220 dpi would be 13,200 px.
    const dpi = capDpiForPageSizes(220, [
      { width: 612, height: 792 },
      { width: 4320, height: 4320 },
    ]);
    expect(dpi).toBe(200);
    expect((4320 / 72) * dpi).toBeLessThanOrEqual(MAX_RENDER_LONG_SIDE_PX);
  });

  it("falls back to the requested dpi when page sizes are unknown", () => {
    expect(capDpiForPageSizes(220, [])).toBe(220);
  });
});

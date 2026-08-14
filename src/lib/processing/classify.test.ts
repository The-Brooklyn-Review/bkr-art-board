import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { classifyPage } from "./classify";

function solidRgbImage(
  width: number,
  height: number,
  background: [number, number, number],
  patch?: { x: number; y: number; w: number; h: number; color: [number, number, number] },
): Promise<Buffer> {
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const inPatch =
        !!patch && x >= patch.x && x < patch.x + patch.w && y >= patch.y && y < patch.y + patch.h;
      const [r, g, b] = inPatch ? patch!.color : background;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const SATURATED_RED: [number, number, number] = [220, 20, 20];
const SATURATED_BLUE: [number, number, number] = [20, 20, 220];

describe("classifyPage", () => {
  it("classifies a mostly-white page with a small black patch as text-like", async () => {
    // Simulates a caption/statement page: sparse dark ink on a white page.
    const img = await solidRgbImage(100, 100, WHITE, { x: 10, y: 40, w: 80, h: 15, color: BLACK });
    const result = await classifyPage(img);
    expect(result.pageType).toBe("cover_statement");
    expect(result.visibleInArtLibrary).toBe(false);
  });

  it("classifies a page dominated by saturated color as artwork", async () => {
    const img = await solidRgbImage(100, 100, SATURATED_RED);
    const result = await classifyPage(img);
    expect(result.pageType).toBe("artwork");
    expect(result.visibleInArtLibrary).toBe(true);
  });

  it("classifies a small, vividly colorful image on a mostly-white page as artwork, not text", async () => {
    // The specific real-data bug this heuristic was extended to fix (see
    // classify.ts doc comment): tonal-breadth alone can't distinguish
    // "small colorful art with generous white margins" from "sparse text on
    // white" — both have low midtone coverage. A small saturated patch
    // (same size/brightness class as the black-patch case above, but in
    // color) must still resolve to "artwork" once the chroma signal is
    // considered, even though white/midtone ratios alone would call it text.
    const img = await solidRgbImage(100, 100, WHITE, {
      x: 35,
      y: 35,
      w: 30,
      h: 30,
      color: SATURATED_BLUE,
    });
    const result = await classifyPage(img);
    expect(result.pageType).toBe("artwork");
    expect(result.visibleInArtLibrary).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { tinyKeyFor } from "./tiny";

describe("tinyKeyFor", () => {
  it("derives the tiny key from a thumbnail key", () => {
    expect(tinyKeyFor("submittable/s/rendered/f/page-3-thumb.webp")).toBe(
      "submittable/s/rendered/f/page-3-tiny.webp",
    );
    expect(tinyKeyFor("submittable/s/rendered/f/image-thumb.webp")).toBe(
      "submittable/s/rendered/f/image-tiny.webp",
    );
  });

  it("returns null for keys that don't follow the thumbnail pattern", () => {
    expect(tinyKeyFor("submittable/s/rendered/f/page-3-full.webp")).toBeNull();
    expect(tinyKeyFor("submittable/s/thumb.webp.bak")).toBeNull();
  });
});

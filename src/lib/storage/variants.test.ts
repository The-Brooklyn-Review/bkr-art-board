import { describe, expect, it } from "vitest";
import { allVariantKeys, tinyKeyFor, variantKeyFor } from "./variants";

describe("variantKeyFor", () => {
  it("derives each variant's key from a thumbnail key", () => {
    expect(tinyKeyFor("submittable/s/rendered/f/page-3-thumb.webp")).toBe(
      "submittable/s/rendered/f/page-3-tiny.webp",
    );
    expect(variantKeyFor("submittable/s/rendered/f/image-thumb.webp", "card")).toBe(
      "submittable/s/rendered/f/image-card.webp",
    );
  });

  it("returns null for keys that don't follow the thumbnail pattern", () => {
    expect(variantKeyFor("submittable/s/rendered/f/page-3-full.webp", "card")).toBeNull();
    expect(tinyKeyFor("submittable/s/thumb.webp.bak")).toBeNull();
  });

  it("lists every variant to delete alongside a thumbnail", () => {
    expect(allVariantKeys("x/page-1-thumb.webp")).toEqual([
      "x/page-1-tiny.webp",
      "x/page-1-card.webp",
    ]);
    expect(allVariantKeys("x/other.webp")).toEqual([]);
  });
});

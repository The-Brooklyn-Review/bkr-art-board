import { describe, expect, it } from "vitest";
import { sentenceCase } from "./text";

describe("sentenceCase", () => {
  it.each([
    ["digital photography", "Digital photography"],
    ["Graphite On Paper", "Graphite on paper"],
    ["Archival Inkjet Print", "Archival inkjet print"],
    ["OIL ON CANVAS", "Oil on canvas"],
    ["Oil on Canvas", "Oil on canvas"],
    ["Graphite On Plywood", "Graphite on plywood"],
    ["Oil on Japanese paper", "Oil on Japanese paper"],
    ["Watercolor on Japanese Washi", "Watercolor on Japanese washi"],
    ["Pencil on Mylar", "Pencil on Mylar"],
    ["PLA", "PLA"],
    ["Acrylic", "Acrylic"],
    [
      "oil, graphite, China marker and pigment stick on paper",
      "Oil, graphite, China marker and pigment stick on paper",
    ],
    ["stainless steel, Cerakote, heat lamp", "Stainless steel, Cerakote, heat lamp"],
    ["collage and Acrylic on paper", "Collage and Acrylic on paper"],
    ["  watercolor ", "Watercolor"],
  ])("%s → %s", (raw, want) => {
    expect(sentenceCase(raw)).toBe(want);
  });

  it.each([null, undefined, "", "   "])("%s → null", (raw) => {
    expect(sentenceCase(raw)).toBeNull();
  });
});

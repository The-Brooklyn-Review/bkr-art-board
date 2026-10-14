import { describe, expect, it } from "vitest";
import {
  CONSIDERATION_LABEL_IDS,
  CONSIDERATION_LABEL_ID,
  canonicalLabelId,
  labelIdsMatching,
} from "./consideration";

describe("consideration labels", () => {
  it("treats Consider and Under Consideration as one label", () => {
    for (const id of CONSIDERATION_LABEL_IDS)
      expect(canonicalLabelId(id)).toBe(CONSIDERATION_LABEL_ID);
    expect(labelIdsMatching(CONSIDERATION_LABEL_ID).sort()).toEqual(
      [...CONSIDERATION_LABEL_IDS].sort(),
    );
  });
  it("leaves other labels alone", () => {
    expect(canonicalLabelId("other")).toBe("other");
    expect(labelIdsMatching("other")).toEqual(["other"]);
  });
});

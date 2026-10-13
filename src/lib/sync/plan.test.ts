import { describe, expect, it } from "vitest";
import { planSync, sameSet, shouldImport } from "./plan";

const ids = { consider: "consider", acceptance: "acceptance" };
const r = (submissionId: string, submissionStatus: string, labels: string[] = []) => ({
  submissionId,
  submissionStatus,
  labels,
});

describe("shouldImport", () => {
  it("imports undecided work for the reviewer, including unexpected statuses", () => {
    expect(shouldImport(r("1", "in_progress"), ids)).toBe(true);
    expect(shouldImport(r("1", "new"), ids)).toBe(true);
    expect(shouldImport(r("1", "some_future_status"), ids)).toBe(true);
  });
  it("imports completed work only when it's marked Consider", () => {
    expect(shouldImport(r("1", "completed", ["consider"]), ids)).toBe(true);
    expect(shouldImport(r("1", "completed"), ids)).toBe(false);
  });
  it("imports accepted work, and anything labelled acceptance", () => {
    expect(shouldImport(r("1", "accepted"), ids)).toBe(true);
    expect(shouldImport(r("1", "published"), ids)).toBe(true);
  });
  it("never imports declined or withdrawn work", () => {
    expect(shouldImport(r("1", "declined", ["consider"]), ids)).toBe(false);
    expect(shouldImport(r("1", "withdrawn"), ids)).toBe(false);
  });
});

describe("planSync", () => {
  it("updates, deletes withdrawn, flags imports, and never deletes what's merely missing", () => {
    const plan = planSync(
      [r("a", "in_progress"), r("b", "withdrawn"), r("c", "in_progress"), r("d", "declined")],
      [
        { id: "A", submittableId: "a" },
        { id: "B", submittableId: "b" },
        { id: "Z", submittableId: "z" },
      ],
      ids,
    );
    expect(plan.toUpdate.map((u) => u.local.id)).toEqual(["A"]);
    expect(plan.toDelete.map((u) => u.local.id)).toEqual(["B"]);
    expect(plan.toImport.map((x) => x.submissionId)).toEqual(["c"]);
    expect(plan.missingRemotely.map((x) => x.id)).toEqual(["Z"]);
  });
});

describe("sameSet", () => {
  it("ignores order and duplicates", () => {
    expect(sameSet(["a", "b"], ["b", "a", "a"])).toBe(true);
    expect(sameSet(["a"], ["a", "b"])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { displayStatus, isUndecided, statusGroupOf } from "./statuses";

describe("statuses", () => {
  it("treats anything not decided as undecided", () => {
    for (const s of ["new", "in_progress", "received", "viewed", "editable", null, "future"])
      expect(isUndecided(s)).toBe(true);
    for (const s of ["completed", "accepted", "declined", "withdrawn", "published"])
      expect(isUndecided(s)).toBe(false);
  });
  it("groups statuses for the reviewer filter", () => {
    expect(statusGroupOf("published")).toBe("accepted");
    expect(statusGroupOf("withdrawn")).toBe("declined");
    expect(displayStatus("in_progress")).toBe("In progress");
  });
});

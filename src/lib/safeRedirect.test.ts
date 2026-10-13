import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeNextPath("/submissions?status=all", "/x")).toBe("/submissions?status=all");
  });
  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "evil",
    "",
    42,
  ])("rejects %j", (bad) => expect(safeNextPath(bad, "/x")).toBe("/x"));
});

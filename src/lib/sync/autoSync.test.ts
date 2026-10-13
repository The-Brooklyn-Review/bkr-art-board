import { describe, expect, it } from "vitest";
import { AUTO_SYNC_AFTER_MS, isSyncStale } from "./autoSync";

describe("isSyncStale", () => {
  const now = Date.parse("2026-10-13T14:00:00Z");
  it("is stale when never synced", () => expect(isSyncStale(null, now)).toBe(true));
  it("is fresh just under the threshold", () =>
    expect(isSyncStale(new Date(now - AUTO_SYNC_AFTER_MS + 1000), now)).toBe(false));
  it("is stale at the threshold", () =>
    expect(isSyncStale(new Date(now - AUTO_SYNC_AFTER_MS), now)).toBe(true));
});

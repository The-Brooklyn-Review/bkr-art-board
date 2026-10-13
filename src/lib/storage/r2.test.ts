import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.CLOUDFLARE_R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "test";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "test";
  process.env.CLOUDFLARE_R2_BUCKET = "bucket";
});

describe("getSignedR2Url", () => {
  it("returns the same URL for the same key within a signing window", async () => {
    const { getSignedR2Url } = await import("./r2");
    const a = await getSignedR2Url("submittable/x/page-1-thumb.webp");
    const b = await getSignedR2Url("submittable/x/page-1-thumb.webp");
    expect(a).toBe(b);
    expect(a).toContain("response-cache-control=");
    expect(a).toContain("X-Amz-Expires=43200");
  });

  it("rounds the signing time down to a 6-hour boundary", async () => {
    const { signingWindowStart } = await import("./r2");
    const t = Date.parse("2026-10-13T17:45:00Z");
    expect(signingWindowStart(t).toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });
});

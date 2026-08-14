import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("fetchAllPages", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.SUBMITTABLE_API_KEY;

  beforeEach(() => {
    process.env.SUBMITTABLE_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.SUBMITTABLE_API_KEY = originalApiKey;
    vi.resetModules();
  });

  it("requests page two with a well-formed '?continuationToken=' URL, not '&'", async () => {
    // Regression test for a real bug: the separator was computed from
    // basePath's original query string, but then applied AFTER that query
    // string was stripped — producing "/v4/submissions&continuationToken="
    // with no "?" at all. It only showed up past page one, so it went
    // unnoticed while every real dataset fit on a single page.
    const requestedUrls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      const isFirstPage = !url.includes("continuationToken");
      const body = isFirstPage
        ? { continuationToken: "tok-1", items: [{ id: 1 }] }
        : { continuationToken: null, items: [{ id: 2 }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { fetchAllPages } = await import("./client");
    const items = await fetchAllPages<{ id: number }>(
      "/v4/submissions?Projects.Include=abc&size=50",
    );

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("/v4/submissions?Projects.Include=abc&size=50");
    // The bug produced "...submissions&continuationToken=tok-1" — assert
    // the correct form directly, not just "doesn't look like the old bug".
    expect(requestedUrls[1]).toMatch(/\/v4\/submissions\?continuationToken=tok-1$/);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("does not append a continuation token on the first request", async () => {
    const requestedUrls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ continuationToken: null, items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { fetchAllPages } = await import("./client");
    await fetchAllPages("/v4/labels?size=500");

    expect(requestedUrls).toEqual([expect.stringContaining("/v4/labels?size=500")]);
    expect(requestedUrls[0]).not.toContain("continuationToken");
  });
});

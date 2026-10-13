import { describe, expect, it, vi } from "vitest";
import { SubmittableError } from "./client";
import { addNote, applyLabel, removeLabel } from "./writes";

function fakeFetch(handlers: Record<string, () => unknown>) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const h = handlers[key];
    if (!h) throw new Error(`unexpected ${key}`);
    return h();
  }) as unknown as typeof import("./client").submittableFetch;
}

describe("applyLabel", () => {
  it("PUTs one label on one submission", async () => {
    const f = fakeFetch({ "PUT /v4/submissions/s1/labels/l1": () => null });
    await applyLabel("s1", "l1", f);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("treats a 400 as success when the label is already there", async () => {
    const f = fakeFetch({
      "PUT /v4/submissions/s1/labels/l1": () => {
        throw new SubmittableError(400, "", "already");
      },
      "GET /v4/submissions/s1": () => ({ labels: [{ labelId: "l1" }] }),
    });
    await expect(applyLabel("s1", "l1", f)).resolves.toBeUndefined();
  });
  it("still throws a 400 when the label isn't there", async () => {
    const f = fakeFetch({
      "PUT /v4/submissions/s1/labels/l1": () => {
        throw new SubmittableError(400, "", "bad");
      },
      "GET /v4/submissions/s1": () => ({ labels: [] }),
    });
    await expect(applyLabel("s1", "l1", f)).rejects.toThrow();
  });
});

describe("removeLabel", () => {
  it("treats removing an absent label as success", async () => {
    const f = fakeFetch({
      "DELETE /v4/submissions/s1/labels/l1": () => {
        throw new SubmittableError(400, "", "not applied");
      },
      "GET /v4/submissions/s1": () => ({ labels: [] }),
    });
    await expect(removeLabel("s1", "l1", f)).resolves.toBeUndefined();
  });
});

describe("addNote", () => {
  it("POSTs the note text and visibility", async () => {
    const calls: unknown[] = [];
    const f = vi.fn(async (_p: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return null;
    }) as unknown as typeof import("./client").submittableFetch;
    await addNote("s1", "ACCEPT · T · Oct 12, 2026", "team", f);
    expect(calls).toEqual([{ note: "ACCEPT · T · Oct 12, 2026", noteVisibility: "team" }]);
  });
});

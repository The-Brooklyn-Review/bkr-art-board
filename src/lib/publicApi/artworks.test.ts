import { describe, expect, it } from "vitest";
import { isAuthorized, matchesArtist, normalizeName } from "./artworks";

describe("normalizeName", () => {
  it("drops accents, punctuation, case and extra spaces", () => {
    expect(normalizeName("  Tanja  Softić ")).toBe("tanja softic");
    expect(normalizeName("Jean-Michel O’Neil")).toBe("jean michel o neil");
  });
});

describe("matchesArtist", () => {
  it.each([
    ["walden", "Yoanna Walden"],
    ["Yoanna Walden", "Yoanna Walden"],
    ["walden yoanna", "Yoanna Walden"],
    ["tanja softic", "Tanja Softić"],
    ["sandra cavanagh", "Sandra  Cavanagh"],
    ["reiner", "reiner heidorn"],
    ["yoa wal", "Yoanna Walden"],
  ])("%s finds %s", (q, name) => {
    expect(matchesArtist(q, name)).toBe(true);
  });

  it.each([
    ["alden", "Yoanna Walden"],
    ["yoanna smith", "Yoanna Walden"],
    ["", "Anyone"],
    ["walden", null],
  ])("%s doesn't find %s", (q, name) => {
    expect(matchesArtist(q, name)).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("accepts the right bearer key", () => {
    expect(isAuthorized("Bearer s3cret-key", "s3cret-key")).toBe(true);
    expect(isAuthorized("bearer   s3cret-key ", "s3cret-key")).toBe(true);
  });

  it.each([null, "", "Bearer", "Bearer wrong", "s3cret-key", "Basic s3cret-key"])(
    "rejects %s",
    (header) => {
      expect(isAuthorized(header, "s3cret-key")).toBe(false);
    },
  );

  it("rejects everything when no key is configured", () => {
    expect(isAuthorized("Bearer ", "")).toBe(false);
  });
});

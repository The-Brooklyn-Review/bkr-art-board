import { describe, expect, it } from "vitest";
import { normalizeInstagram, normalizeWebsite } from "./contact";

describe("normalizeWebsite", () => {
  it.each([
    ["www.LydiaKann.com,", "https://www.lydiakann.com"],
    ["www.rebeccaclarkart.com.", "https://www.rebeccaclarkart.com"],
    ["http://leahoates.com", "https://leahoates.com"],
    ["https://www.petershellenberger.com/#0", "https://www.petershellenberger.com"],
    ["www.reiner-heidorn.de/schoolmaps/", "https://www.reiner-heidorn.de/schoolmaps/"],
    [
      "https://www.saatchiart.com/account/artworks/823323",
      "https://www.saatchiart.com/account/artworks/823323",
    ],
  ])("%s → %s", (raw, want) => {
    expect(normalizeWebsite(raw)).toBe(want);
  });

  it.each([
    null,
    "",
    "artist@example.com",
    "https://www.instagram.com/gili_blacher/",
    "https://www.dropbox.com/s/abc/portfolio.pdf",
    "https://drive.google.com/file/d/123",
    "see my website",
    "localhost",
  ])("rejects %s", (raw) => {
    expect(normalizeWebsite(raw)).toBeNull();
  });
});

describe("normalizeInstagram", () => {
  it.each([
    ["@leahoates19", "leahoates19"],
    ["https://www.instagram.com/gili_blacher/", "gili_blacher"],
    ["www.Instagram.com/reinerheidorn", "reinerheidorn"],
    ["Some.Artist_", "some.artist_"],
  ])("%s → %s", (raw, want) => {
    expect(normalizeInstagram(raw)).toBe(want);
  });

  it.each([null, "", "not a handle", "https://instagram.com/p/", "a@b.com"])(
    "rejects %s",
    (raw) => {
      expect(normalizeInstagram(raw)).toBeNull();
    },
  );
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const mockPrisma = {
  sharedArtworkLink: { findUnique: vi.fn() },
  sharedSubmissionLink: { findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const { resolveShareToken, resolveSubmissionShareToken, hashShareToken } =
  await import("./sharePreview");

function sha256(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function activeLink(overrides: Record<string, unknown> = {}) {
  return {
    artAssetId: "asset-1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    artAsset: {
      submissionId: "sub-1",
      visibleInArtLibrary: true,
      usedState: "available",
      storagePathThumbnail: "path/thumb.webp",
      submission: { artistName: "Jane Doe", submissionTitle: "Piece" },
    },
    ...overrides,
  };
}

// This is the app's one real authorization boundary for unauthenticated
// traffic (see src/proxy.ts's /share/ exemption) — both the share page and
// its image route call this same function, so every case here is a case
// neither of them can get wrong independently.
describe("resolveShareToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a valid, active link", async () => {
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(activeLink());
    await expect(resolveShareToken("tok")).resolves.toEqual({
      assetId: "asset-1",
      submissionId: "sub-1",
      artistName: "Jane Doe",
      submissionTitle: "Piece",
      storagePathThumbnail: "path/thumb.webp",
    });
  });

  it("returns null for a token that doesn't exist", async () => {
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(null);
    await expect(resolveShareToken("nope")).resolves.toBeNull();
  });

  it("returns null for a revoked link", async () => {
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(
      activeLink({ revokedAt: new Date() }),
    );
    await expect(resolveShareToken("tok")).resolves.toBeNull();
  });

  it("returns null for an expired link", async () => {
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(
      activeLink({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(resolveShareToken("tok")).resolves.toBeNull();
  });

  it("returns null once the asset has been hidden, even with a still-valid link row", async () => {
    const link = activeLink();
    link.artAsset.visibleInArtLibrary = false;
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(link);
    await expect(resolveShareToken("tok")).resolves.toBeNull();
  });

  it("returns null once the asset is marked do_not_use", async () => {
    const link = activeLink();
    link.artAsset.usedState = "do_not_use";
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(link);
    await expect(resolveShareToken("tok")).resolves.toBeNull();
  });

  it("looks up by the token's hash, never the raw token", async () => {
    mockPrisma.sharedArtworkLink.findUnique.mockResolvedValue(activeLink());
    await resolveShareToken("tok");
    expect(mockPrisma.sharedArtworkLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256("tok") } }),
    );
  });
});

describe("resolveSubmissionShareToken", () => {
  beforeEach(() => vi.clearAllMocks());
  const piece = { id: "a1", storagePathThumbnail: "p/thumb.webp", width: 10, height: 10 };
  const link = (overrides: Record<string, unknown> = {}, assets = [piece]) => ({
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    submission: { id: "sub-1", artistName: "Jane Doe", submissionTitle: "Pieces", assets },
    ...overrides,
  });

  it("resolves to the artist, title and shareable pieces only", async () => {
    mockPrisma.sharedSubmissionLink.findUnique.mockResolvedValue(link());
    await expect(resolveSubmissionShareToken("tok")).resolves.toEqual({
      submissionId: "sub-1",
      artistName: "Jane Doe",
      submissionTitle: "Pieces",
      assets: [piece],
    });
    // Hidden and do-not-use pages are filtered in the query itself.
    expect(mockPrisma.sharedSubmissionLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256("tok") } }),
    );
    const query = mockPrisma.sharedSubmissionLink.findUnique.mock.calls[0][0];
    expect(query.include.submission.select.assets.where).toEqual({
      visibleInArtLibrary: true,
      usedState: { not: "do_not_use" },
    });
    // Nothing beyond pieces, name and title is even selected.
    expect(Object.keys(query.include.submission.select).sort()).toEqual(
      ["artistName", "assets", "id", "submissionTitle"].sort(),
    );
  });

  it("returns null for unknown, revoked, or expired links", async () => {
    mockPrisma.sharedSubmissionLink.findUnique.mockResolvedValue(null);
    await expect(resolveSubmissionShareToken("x")).resolves.toBeNull();
    mockPrisma.sharedSubmissionLink.findUnique.mockResolvedValue(link({ revokedAt: new Date() }));
    await expect(resolveSubmissionShareToken("x")).resolves.toBeNull();
    mockPrisma.sharedSubmissionLink.findUnique.mockResolvedValue(
      link({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(resolveSubmissionShareToken("x")).resolves.toBeNull();
  });

  it("returns null once no piece is left to show", async () => {
    mockPrisma.sharedSubmissionLink.findUnique.mockResolvedValue(link({}, []));
    await expect(resolveSubmissionShareToken("x")).resolves.toBeNull();
  });
});

describe("hashShareToken", () => {
  it("matches a plain sha256 hex digest", () => {
    expect(hashShareToken("tok")).toBe(sha256("tok"));
  });
});

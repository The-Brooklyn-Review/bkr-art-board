import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const mockPrisma = {
  sharedArtworkLink: { findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const { resolveShareToken, hashShareToken } = await import("./sharePreview");

function sha256(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function activeLink(overrides: Record<string, unknown> = {}) {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    artAsset: {
      visibleInArtLibrary: true,
      usedState: "available",
      storagePathLarge: "path/large.webp",
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
      artistName: "Jane Doe",
      submissionTitle: "Piece",
      storagePathLarge: "path/large.webp",
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

describe("hashShareToken", () => {
  it("matches a plain sha256 hex digest", () => {
    expect(hashShareToken("tok")).toBe(sha256("tok"));
  });
});

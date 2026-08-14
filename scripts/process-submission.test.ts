import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = {
  submissionFile: { update: vi.fn(async () => ({})) },
  submittableSubmission: {
    findUniqueOrThrow: vi.fn(async () => ({ thumbnailAssetId: null as string | null })),
    update: vi.fn(async () => ({})),
  },
  artAsset: {
    findFirst: vi.fn(async () => null as { pageNumber: number | null } | null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }: { data: { pageNumber: number | null } }) => ({
      id: `new-${data.pageNumber ?? "img"}`,
      pageNumber: data.pageNumber,
    })),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return arg(mockPrisma);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const mockUploadToR2 = vi.fn(async () => {});
vi.mock("@/lib/storage/r2", () => ({ uploadToR2: mockUploadToR2 }));

const { replaceFileAssets } = await import("./process-submission");
import type { PreparedAsset } from "./process-submission";

function preparedAsset(pageNumber: number | null): PreparedAsset {
  return {
    assetType: pageNumber === null ? "uploaded_image" : "pdf_page",
    pageNumber,
    largeKey: `key-${pageNumber}-full.webp`,
    largeBuffer: Buffer.from("large"),
    thumbKey: `key-${pageNumber}-thumb.webp`,
    thumbBuffer: Buffer.from("thumb"),
    width: 100,
    height: 100,
    aspectRatio: 1,
    extractedText: null,
    pageType: "artwork",
    visibleInArtLibrary: true,
    debug: null,
  };
}

describe("replaceFileAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.submittableSubmission.findUniqueOrThrow.mockResolvedValue({
      thumbnailAssetId: null,
    });
    mockPrisma.artAsset.findFirst.mockResolvedValue(null);
    mockPrisma.artAsset.create.mockImplementation(async ({ data }) => ({
      id: `new-${data.pageNumber ?? "img"}`,
      pageNumber: data.pageNumber,
    }));
    mockUploadToR2.mockResolvedValue(undefined);
  });

  it("uploads every asset, replaces the rows, and marks the file processed", async () => {
    const prepared = [preparedAsset(1), preparedAsset(2)];

    await replaceFileAssets("sub-1", { id: "file-1" }, prepared, 0);

    expect(mockUploadToR2).toHaveBeenCalledTimes(4); // large + thumb, per asset
    expect(mockPrisma.artAsset.deleteMany).toHaveBeenCalledWith({
      where: { submissionFileId: "file-1" },
    });
    expect(mockPrisma.artAsset.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.submissionFile.update).toHaveBeenCalledWith({
      where: { id: "file-1" },
      data: { processingStatus: "processed" },
    });
  });

  it("marks the file errored (with the real message) when an upload fails, before ever touching the DB", async () => {
    mockUploadToR2
      .mockResolvedValueOnce(undefined) // page 1 large
      .mockRejectedValueOnce(new Error("R2 network timeout")); // page 1 thumb

    await expect(
      replaceFileAssets("sub-1", { id: "file-1" }, [preparedAsset(1)], 0),
    ).rejects.toThrow("R2 network timeout");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.submissionFile.update).toHaveBeenCalledWith({
      where: { id: "file-1" },
      data: { processingStatus: "error", processingError: "R2 network timeout" },
    });
  });

  it("marks the file errored when the transaction fails, leaving old rows in place", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("thumbnail FK conflict"));

    await expect(
      replaceFileAssets("sub-1", { id: "file-1" }, [preparedAsset(1)], 0),
    ).rejects.toThrow("thumbnail FK conflict");

    expect(mockPrisma.submissionFile.update).toHaveBeenCalledWith({
      where: { id: "file-1" },
      data: { processingStatus: "error", processingError: "thumbnail FK conflict" },
    });
    // The failure was mid-transaction — the real Postgres transaction would
    // have rolled the deleteMany back too. This test can't assert on actual
    // DB rows (prisma is mocked), but it confirms the failure path never
    // reaches "processed": the "error" status is the only status recorded.
    expect(mockPrisma.submissionFile.update).toHaveBeenCalledTimes(1);
  });

  it("re-points a curator-selected thumbnail to the replacement asset at the same page position", async () => {
    mockPrisma.submittableSubmission.findUniqueOrThrow.mockResolvedValue({
      thumbnailAssetId: "old-asset-id",
    });
    mockPrisma.artAsset.findFirst.mockResolvedValue({ pageNumber: 2 });

    const prepared = [preparedAsset(1), preparedAsset(2), preparedAsset(3)];
    await replaceFileAssets("sub-1", { id: "file-1" }, prepared, 0);

    expect(mockPrisma.submittableSubmission.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { thumbnailAssetId: "new-2" },
    });
  });

  it("clears and reports the thumbnail when no replacement exists at that page position", async () => {
    mockPrisma.submittableSubmission.findUniqueOrThrow.mockResolvedValue({
      thumbnailAssetId: "old-asset-id",
    });
    mockPrisma.artAsset.findFirst.mockResolvedValue({ pageNumber: 5 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Reprocessed file now has only 3 pages — no page 5 to re-point to.
    const prepared = [preparedAsset(1), preparedAsset(2), preparedAsset(3)];
    await replaceFileAssets("sub-1", { id: "file-1" }, prepared, 0);

    expect(mockPrisma.submittableSubmission.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("thumbnail selection cleared"));

    warnSpy.mockRestore();
  });
});

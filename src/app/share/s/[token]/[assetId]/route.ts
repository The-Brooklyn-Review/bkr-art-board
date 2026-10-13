import { NextResponse } from "next/server";
import { resolveSubmissionShareToken } from "@/lib/sharePreview";
import { fetchR2Object } from "@/lib/storage/r2";

// One piece of a shared submission. Streamed, not redirected to a signed
// R2 URL, for the same reason as /share/<token>/image: the link's expiry
// and the piece's visibility are re-checked on every request. Only pieces
// the link currently resolves to are served — any other asset id is a 404.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; assetId: string }> },
) {
  const { token, assetId } = await params;
  const resolved = await resolveSubmissionShareToken(token);
  const asset = resolved?.assets.find((a) => a.id === assetId);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const { body, contentType } = await fetchR2Object(asset.storagePathThumbnail);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType || "image/webp",
      "Cache-Control": "private, no-store",
    },
  });
}

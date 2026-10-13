import { NextResponse } from "next/server";
import { resolveSubmissionShareToken } from "@/lib/sharePreview";
import { fetchR2Object } from "@/lib/storage/r2";
import { renderPreviewCard } from "@/lib/processing/previewCard";

// The link-preview card (og:image) for a shared submission: the featured
// piece (the one on screen when it was shared, else the cover), or the
// first pieces side by side — see renderPreviewCard. Re-checks the link on every
// request, like the pieces themselves.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveSubmissionShareToken(token);
  if (!resolved) return new NextResponse("Not found", { status: 404 });

  const featured = resolved.assets.find((a) => a.id === resolved.featuredAssetId);
  const shown = featured ? [featured] : resolved.assets.slice(0, 3);
  const images = await Promise.all(
    shown.map(async (a) => (await fetchR2Object(a.storagePathThumbnail)).body),
  );
  const card = await renderPreviewCard(images);
  return new NextResponse(new Uint8Array(card), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}

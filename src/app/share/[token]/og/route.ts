import { NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/sharePreview";
import { fetchR2Object } from "@/lib/storage/r2";
import { renderPreviewCard } from "@/lib/processing/previewCard";

// The link-preview card (og:image) for a shared artwork: a 1200×630 JPEG,
// see renderPreviewCard. Re-checks the link on every request, like
// ../image — an expired or replaced link serves nothing.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) return new NextResponse("Not found", { status: 404 });

  const { body } = await fetchR2Object(resolved.storagePathThumbnail);
  const card = await renderPreviewCard([body]);
  return new NextResponse(new Uint8Array(card), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}

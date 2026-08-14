import { NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/sharePreview";
import { fetchR2Object } from "@/lib/storage/r2";

// Streams the artwork bytes directly rather than redirecting to a signed
// R2 URL — a signed URL keeps working for its own multi-hour lifetime
// regardless of what happens to the share link, which would make the
// share/expiry check on this route pointless. Fetching fresh on every
// request means a replaced or expired link stops serving the image
// immediately, same as the page.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { body, contentType } = await fetchR2Object(resolved.storagePathLarge);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType || "image/webp",
      "Cache-Control": "private, no-store",
    },
  });
}

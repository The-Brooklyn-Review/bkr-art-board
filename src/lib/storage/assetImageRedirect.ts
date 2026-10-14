// Redirects to a freshly signed R2 URL for one of an asset's images. Lets a
// page carry a short app link (/api/assets/<id>/large, /thumb) instead of a
// ~500-character signed URL — signed only if the image is actually loaded.
// Plain GET requests also load in parallel, unlike server actions (Next
// runs a client's actions one at a time).
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/requireAuth";
import { getSignedR2Url } from "@/lib/storage/r2";

export async function redirectToAssetImage(
  id: string,
  which: "large" | "thumbnail",
): Promise<Response> {
  if (!(await isAuthenticated())) return new Response("Not signed in.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const asset = await prisma.artAsset.findUnique({
    where: { id },
    select: { storagePathLarge: true, storagePathThumbnail: true },
  });
  if (!asset) return new Response("Not found.", { status: 404 });
  const key = which === "large" ? asset.storagePathLarge : asset.storagePathThumbnail;
  return new Response(null, {
    status: 302,
    headers: {
      Location: await getSignedR2Url(key),
      // Signed URLs stay valid for at least 6h (see getSignedR2Url).
      "Cache-Control": "private, max-age=3600",
    },
  });
}

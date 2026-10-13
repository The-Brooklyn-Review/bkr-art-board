// The gallery lightbox's full-size image: redirects to a signed R2 URL.
// A GET route rather than a server action because Next runs a client's
// server actions one at a time — the slide on screen used to wait behind
// its neighbours' and any hover prefetches. Plain image requests load in
// parallel, and the browser caches the redirect.
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/requireAuth";
import { getSignedR2Url } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return new Response("Not signed in.", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const asset = await prisma.artAsset.findUnique({
    where: { id },
    select: { storagePathLarge: true },
  });
  if (!asset) return new Response("Not found.", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: await getSignedR2Url(asset.storagePathLarge),
      // Signed URLs stay valid for at least 6h (see getSignedR2Url).
      "Cache-Control": "private, max-age=3600",
    },
  });
}

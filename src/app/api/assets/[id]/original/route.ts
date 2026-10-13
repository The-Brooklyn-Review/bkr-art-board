// "Open Original File" in the gallery: redirects to a freshly signed R2 URL
// for the uploaded file this asset came from. Signing it on click instead
// of for every page up front keeps ~120 KB out of the gallery page.
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
    select: { submissionFile: { select: { storagePathOriginal: true } } },
  });
  if (!asset?.submissionFile) return new Response("Not found.", { status: 404 });
  return Response.redirect(await getSignedR2Url(asset.submissionFile.storagePathOriginal), 302);
}

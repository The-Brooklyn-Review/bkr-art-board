// An asset's regular thumbnail (see redirectToAssetImage) — the review
// list's fallback when a tiny thumbnail is missing, so each row doesn't
// carry a second signed URL it almost never uses.
import { redirectToAssetImage } from "@/lib/storage/assetImageRedirect";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return redirectToAssetImage((await ctx.params).id, "thumbnail");
}

// The gallery lightbox's full-size image (see redirectToAssetImage). Plain
// image requests load in parallel — the slide on screen used to wait
// behind its neighbours when this was a server action.
import { redirectToAssetImage } from "@/lib/storage/assetImageRedirect";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return redirectToAssetImage((await ctx.params).id, "large");
}

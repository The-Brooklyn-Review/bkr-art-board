// Read-only artwork lookup for the Brooklyn Review website. Exempt from the
// password gate (src/proxy.ts) because it checks its own key on every
// request: `Authorization: Bearer $ART_BOARD_API_KEY`. Usage and response
// shape: docs/PUBLIC-API.md. Logic: src/lib/publicApi/artworks.ts.
import type { NextRequest } from "next/server";
import { API_KEY_ENV, findPublishedArtworks, isAuthorized } from "@/lib/publicApi/artworks";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const key = process.env[API_KEY_ENV];
  if (!key) return json({ error: "The artwork API isn't configured." }, 503);
  if (!isAuthorized(request.headers.get("authorization"), key)) {
    return json({ error: "Missing or wrong API key." }, 401);
  }

  const p = request.nextUrl.searchParams;
  const ids = p
    .getAll("id")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  const query = {
    artist: p.get("artist")?.trim() || undefined,
    title: p.get("title")?.trim() || undefined,
    submittableId: p.get("submittableId")?.trim() || undefined,
    ids: ids.length ? ids : undefined,
  };

  const artworks = await findPublishedArtworks(query);
  return json({ count: artworks.length, artworks });
}

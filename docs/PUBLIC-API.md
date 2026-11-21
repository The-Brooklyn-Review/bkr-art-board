# Artwork API for the Brooklyn Review website

A read-only lookup the website's server calls to fill in what it doesn't know about a published piece: its title, medium, dimensions and year, and the artist's website and Instagram. Code: [`src/app/api/public/artworks/route.ts`](../src/app/api/public/artworks/route.ts), logic in [`src/lib/publicApi/artworks.ts`](../src/lib/publicApi/artworks.ts).

**What it returns:** only accepted/published work (accepted in Submittable, labelled "acceptance", or an artist with a piece marked published here), only artwork pages (no cover letters or statements), and never the artist's email. Undecided, considered and declined submissions are never returned.

## Setup

1. **This app (Vercel → Settings → Environment Variables):** set `ART_BOARD_API_KEY` to a long random value (`openssl rand -hex 32`) and redeploy. Without it the endpoint answers `503`.
2. **The website:** store the same value as a server-only secret (e.g. `ART_BOARD_API_KEY`) and the app's address (e.g. `ART_BOARD_URL=https://<art-board-domain>`). Call the API **only from the server** — the key must never reach a browser.

## Request

```
GET {ART_BOARD_URL}/api/public/artworks
Authorization: Bearer {ART_BOARD_API_KEY}
```

All parameters are optional and combine (AND). With none, it returns every published piece (a few hundred).

| Parameter       | Matches                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `artist`        | The artist's name. Ignores case, accents, punctuation and word order; each word matches the start of a name word (`walden`, `yoa wal`). |
| `title`         | Words in the piece's title or the submission's title.                                                                                   |
| `id`            | This app's piece id from an earlier lookup — exact. Repeat it or comma-separate for several.                                            |
| `submittableId` | A Submittable submission id.                                                                                                            |

## Response

```json
{
  "count": 1,
  "artworks": [
    {
      "id": "56f06397-a611-4cab-bc83-e0744395e041",
      "artist": { "name": "Honglei Li", "website": null, "instagram": null },
      "title": "Six Job Experiences of Mr. Liu",
      "medium": "Oil on canvas",
      "dimensions": "144\" x 64",
      "year": null,
      "titleSource": "page_caption",
      "submission": {
        "submittableId": "…",
        "title": "Lily Honglei: Reflecting Asian Immigrant Life & History",
        "status": "accepted"
      },
      "position": { "file": 1, "page": 2 },
      "thumbnailUrl": "https://…"
    }
  ]
}
```

- `title`, `medium`, `dimensions`, `year` are **null when the artist never stated them** — they're never guessed. `titleSource` says where a title came from: `page_caption`, `cover_letter`, `form_field` or `submission_title`.
- `instagram` is the handle without `@` (`https://www.instagram.com/{instagram}/`). `website` is a full `https://` URL.
- `thumbnailUrl` is the cropped artwork, for confirming a match. It's a signed link valid for **at least 6 hours** — don't store it or show it on the site; the website should use its own images.
- `id` is stable. **Store it** next to the website's piece once matched, and later look the piece up with `?id=` instead of matching again.

Errors: `401` missing/wrong key, `503` key not configured on this app.

## Matching a published piece (for Claude Code in the website repo)

Paste this into the website repo's `CLAUDE.md`:

> **Art Board lookup.** To fill in an artwork's title, medium, dimensions, year, or the artist's website/Instagram, call the Art Board API from the server side or a script — never client code:
> `curl -s -H "Authorization: Bearer $ART_BOARD_API_KEY" "$ART_BOARD_URL/api/public/artworks?artist=<name>"`
> (Full reference: `docs/PUBLIC-API.md` in the bkr-art-board repo.)
>
> To match one of our published images to the right piece:
>
> 1. If we've stored an Art Board `id` for it, look it up with `?id=` — done.
> 2. Otherwise search by `artist=`. One result → that's it. Several → download each `thumbnailUrl` and our image, look at them, and pick the same artwork (thumbnails are cropped from the artist's PDF, so framing and borders may differ). If none clearly matches, or the artist isn't found, stop and ask rather than guess.
> 3. Write the fields into our content; leave a field empty when the API returns null. Store the Art Board `id` with the piece.
> 4. Never put `thumbnailUrl` on the site or commit it — it expires. Never ask for or store the artist's email; the API doesn't have it.

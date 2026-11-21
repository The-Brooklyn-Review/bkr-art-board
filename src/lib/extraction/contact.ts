// Cleans up the website / Instagram values the metadata extractor returns
// (scripts/extract-metadata.ts) before they're stored. Pure, so it's tested
// directly. Email is never accepted here — it's private and never shown.

/** Hosts that hold files or submissions, not an artist's own site. */
const NOT_A_WEBSITE =
  /(^|\.)(submittable\.com|dropbox\.com|drive\.google\.com|docs\.google\.com|wetransfer\.com|we\.tl|instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|tiktok\.com|linkedin\.com|threads\.net)$/i;

/**
 * A canonical https URL for an artist's website, or null. Accepts bare
 * domains ("www.example.com"), strips trailing punctuation the prose left
 * on ("example.com." / "example.com,"), and rejects emails, file-sharing
 * links and social profiles (Instagram is stored separately).
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .trim()
    .replace(/[.,;:!?)\]}>"']+$/, "")
    .replace(/^[(<\["']+/, "");
  if (!s || s.includes("@") || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || NOT_A_WEBSITE.test(host)) return null;
  url.protocol = "https:";
  url.hash = "";
  const out = url.toString();
  // Drop the trailing slash on a bare domain: https://example.com/ → https://example.com
  return url.pathname === "/" && !url.search ? out.replace(/\/$/, "") : out;
}

/**
 * An Instagram handle without the "@", or null. Accepts "@handle",
 * "handle", "instagram.com/handle", or a full profile URL.
 */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const fromUrl = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, "").replace(/[.,;:!?)]+$/, "");
  // Instagram usernames: letters, digits, "." and "_", up to 30 characters.
  if (!/^[a-z0-9._]{1,30}$/i.test(s)) return null;
  if (/^(p|reel|reels|stories|explore|accounts)$/i.test(s)) return null;
  return s.toLowerCase();
}

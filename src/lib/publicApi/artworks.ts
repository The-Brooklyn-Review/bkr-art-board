// The read-only artwork lookup for the Brooklyn Review website
// (GET /api/public/artworks). Server-to-server only: the caller sends a
// secret key, never a browser. It answers "what do we know about this
// published piece?" — title, medium, size, year, the artist's website and
// Instagram, and a thumbnail to confirm the match. Only accepted/published
// work, only artwork pages, and never the artist's email.
//
// No `server-only` guard: imported by tests (see src/lib/db/index.ts).
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { PUBLISHED_SUBMISSION_FILTER } from "@/lib/art-library/getAssets";
import { getSignedR2Url } from "@/lib/storage/r2";

/** Env var holding the key the website sends as `Authorization: Bearer …`. */
export const API_KEY_ENV = "ART_BOARD_API_KEY";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Whether an Authorization header carries the configured key. Compares
 * fixed-length digests, so the check takes the same time however much of
 * the key a guess gets right.
 */
export function isAuthorized(header: string | null, key: string): boolean {
  const sent = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!sent || !key) return false;
  return timingSafeEqual(digest(sent), digest(key));
}

/** Lowercase, accents and punctuation removed, spaces collapsed. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Whether a name matches an artist query: every word of the query starts
 * a word of the name, in any order. "walden", "Yoanna Walden", "walden
 * yoanna" and "yoa wal" all find "Yoanna Walden"; "alden" doesn't.
 */
export function matchesArtist(query: string, name: string | null | undefined): boolean {
  const q = normalizeName(query).split(" ").filter(Boolean);
  const words = normalizeName(name).split(" ").filter(Boolean);
  return q.length > 0 && q.every((w) => words.some((n) => n.startsWith(w)));
}

export interface ArtworkQuery {
  /** Artist name, or part of it. */
  artist?: string;
  /** Words from the piece's or the submission's title. */
  title?: string;
  /** This app's artwork ids, from an earlier lookup — exact. */
  ids?: string[];
  /** A Submittable submission id. */
  submittableId?: string;
}

export interface PublicArtwork {
  /** This app's id for the piece. Store it to look the piece up exactly later. */
  id: string;
  artist: { name: string | null; website: string | null; instagram: string | null };
  /** The piece's own title; null when the artist never named it. */
  title: string | null;
  medium: string | null;
  dimensions: string | null;
  year: string | null;
  /** Where the title came from: page_caption | cover_letter | form_field | submission_title. */
  titleSource: string | null;
  submission: { submittableId: string; title: string | null; status: string | null };
  /** Which file and page of the submission this piece is on (1-based). */
  position: { file: number; page: number | null };
  /** Cropped thumbnail, for confirming a match. Signed; valid for at least 6 hours. */
  thumbnailUrl: string;
}

/** Most results one call returns — a guard, well above the published set
 * (~45 submissions, ~250 pieces in late 2026). Each result signs one URL. */
export const MAX_RESULTS = 1000;

export async function findPublishedArtworks(query: ArtworkQuery): Promise<PublicArtwork[]> {
  const assets = await prisma.artAsset.findMany({
    where: {
      pageType: "artwork",
      visibleInArtLibrary: true,
      usedState: { not: "do_not_use" },
      ...(query.ids?.length ? { id: { in: query.ids } } : {}),
      submission: {
        ...(query.submittableId ? { submittableId: query.submittableId } : {}),
        // Accepted in Submittable, or a piece by them marked published here.
        OR: [PUBLISHED_SUBMISSION_FILTER, { assets: { some: { usedState: "published" } } }],
      },
    },
    select: {
      id: true,
      localTitle: true,
      medium: true,
      dimensions: true,
      year: true,
      titleSource: true,
      fileIndex: true,
      pageNumber: true,
      storagePathThumbnail: true,
      submission: {
        select: {
          submittableId: true,
          submissionTitle: true,
          officialStatus: true,
          artistName: true,
          artistWebsite: true,
          artistInstagram: true,
        },
      },
    },
    orderBy: [{ submissionId: "asc" }, { fileIndex: "asc" }, { pageNumber: "asc" }],
  });

  // Name and title matching in code, not SQL: it ignores accents and word
  // order, over a set of a few hundred rows at most.
  const titleWords = normalizeName(query.title).split(" ").filter(Boolean);
  const matched = assets.filter((a) => {
    if (query.artist && !matchesArtist(query.artist, a.submission.artistName)) return false;
    if (titleWords.length) {
      const text = normalizeName(`${a.localTitle ?? ""} ${a.submission.submissionTitle ?? ""}`);
      if (!titleWords.every((w) => text.includes(w))) return false;
    }
    return true;
  });

  return Promise.all(
    matched.slice(0, MAX_RESULTS).map(async (a) => ({
      id: a.id,
      artist: {
        name: a.submission.artistName,
        website: a.submission.artistWebsite,
        instagram: a.submission.artistInstagram,
      },
      title: a.localTitle,
      medium: a.medium,
      dimensions: a.dimensions,
      year: a.year,
      titleSource: a.titleSource,
      submission: {
        submittableId: a.submission.submittableId,
        title: a.submission.submissionTitle,
        status: a.submission.officialStatus,
      },
      position: { file: (a.fileIndex ?? 0) + 1, page: a.pageNumber },
      thumbnailUrl: await getSignedR2Url(a.storagePathThumbnail),
    })),
  );
}

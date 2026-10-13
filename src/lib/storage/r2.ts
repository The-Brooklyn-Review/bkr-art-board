// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Singleton — the art library page signs 200+ URLs per request; a fresh
// S3Client per call is wasteful even though signing itself is a local,
// no-network operation.
let _client: S3Client | undefined;
function client() {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

const BUCKET = () => {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) throw new Error("Missing CLOUDFLARE_R2_BUCKET");
  return bucket;
};

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Private files — never a public bucket URL. Callers mint short-lived
 * signed URLs on demand. Default is 6h, not 1h — long review sessions
 * (an editor with a tab open through lunch) were hitting broken images
 * mid-session with the old 1h expiry. Still short-lived, just not
 * aggressively so, since these are never meant to be permanent links.
 */
export async function getSignedR2Url(key: string, expiresInSeconds = 21600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Fetches object bytes directly, for the one place a signed R2 URL should
 * never be handed out: the public share-link image route. That route's
 * only authorization check is a token hash on each request — a signed URL
 * would let the image keep loading for its own multi-hour lifetime even
 * after the link is replaced/expired, undermining that check entirely.
 */
export async function fetchR2Object(key: string): Promise<{ body: Buffer; contentType?: string }> {
  const result = await client().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
  const bytes = await result.Body!.transformToByteArray();
  return { body: Buffer.from(bytes), contentType: result.ContentType };
}

/**
 * Permanently deletes objects — used only when a submission is withdrawn
 * (docs/SPEC-review-and-sync.md §5). Batched at S3's 1,000-key limit.
 * Throws if any key fails, so callers can leave the DB rows in place and
 * retry on the next sync rather than orphaning a half-deleted submission.
 */
export async function deleteFromR2(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1000) {
    const batch = unique.slice(i, i + 1000);
    const result = await client().send(
      new DeleteObjectsCommand({
        Bucket: BUCKET(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors && result.Errors.length > 0) {
      const first = result.Errors[0];
      throw new Error(
        `R2 delete failed for ${result.Errors.length} object(s), e.g. ${first.Key}: ${first.Message}`,
      );
    }
  }
}

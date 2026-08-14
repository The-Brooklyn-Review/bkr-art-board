/**
 * One-off connectivity proof for Cloudflare R2 credentials.
 * Uploads a tiny object, downloads it back, verifies byte-for-byte match,
 * then deletes it. Ground truth before we build the real storage layer.
 *
 * Run: npx tsx scripts/test-r2.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

config({ path: resolve(process.cwd(), ".env.local") });

const client = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET!;
const KEY = "connectivity-test/hello.txt";
const CONTENT = `tbr-art-board R2 connectivity test — ${new Date().toISOString()}`;

async function streamToString(body: unknown): Promise<string> {
  const chunks: Uint8Array[] = [];
  // @ts-expect-error - AWS SDK v3 body is a Node.js Readable in this runtime
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  console.log(`Bucket:   ${BUCKET}`);
  console.log(`Endpoint: ${process.env.CLOUDFLARE_R2_ENDPOINT}`);

  console.log("\n[1] Uploading test object…");
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: CONTENT,
      ContentType: "text/plain",
    }),
  );
  console.log("✓ Upload succeeded.");

  console.log("\n[2] Downloading it back…");
  const got = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  const downloaded = await streamToString(got.Body);
  console.log(`✓ Download succeeded (${downloaded.length} bytes).`);

  if (downloaded !== CONTENT) {
    throw new Error(
      `Content mismatch!\n  expected: ${CONTENT}\n  got:      ${downloaded}`,
    );
  }
  console.log("✓ Byte-for-byte match confirmed.");

  console.log("\n[3] Cleaning up…");
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY }));
  console.log("✓ Test object deleted.");

  console.log("\n✓✓✓ R2 credentials fully verified: write, read, delete all work.");
}

main().catch((err) => {
  console.error("\n✗ R2 TEST FAILED:\n");
  console.error(err);
  process.exit(1);
});

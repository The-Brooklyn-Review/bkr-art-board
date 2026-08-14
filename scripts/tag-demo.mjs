/**
 * Generate tags for 5 random artworks using Claude's vision API.
 * Saves results to tag-results.json (no DB writes).
 * Uses credentials from .env.local
 *
 * Run: node scripts/tag-demo.mjs
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
config({ path: resolve(__dirname, '..', '.env.local') });

// Manual fetch since we're using .mjs
async function fetchImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('base64'));
      });
      res.on('error', reject);
    });
  });
}

async function getSignedR2Url(key) {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
    }),
    { expiresIn: 21600 }
  );
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;

  const prisma = new PrismaClient();
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  console.log('🎨 Auto-tag artwork demo (review mode)\n');

  // Load 5 random visible artAssets
  console.log('[1] Loading 5 random visible artAssets…');
  const assets = await prisma.artAsset.findMany({
    where: { visibleInArtLibrary: true },
    include: {
      submission: {
        select: {
          artistName: true,
          submissionTitle: true,
          coverLetter: true,
        },
      },
    },
    take: 5,
    skip: Math.floor(Math.random() * (212 - 5)),
  });

  if (assets.length === 0) {
    console.log('✗ No visible artAssets found!');
    process.exit(1);
  }

  console.log(`✓ Loaded ${assets.length} artAssets\n`);

  const results = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const assetNum = i + 1;

    console.log(
      `[${assetNum}/${assets.length}] Processing: "${asset.submission.submissionTitle || 'untitled'}" by ${asset.submission.artistName || 'unknown'}`
    );

    try {
      const imageUrl = await getSignedR2Url(asset.storagePathLarge);
      const imageBase64 = await fetchImageAsBase64(imageUrl);

      const textParts = [
        asset.submission.coverLetter || '',
        asset.extractedText || '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const textContext =
        textParts.slice(0, 1000) || '(no text context available)';

      const result = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `You are analyzing an artwork for an art library. Based on the image and the context below, generate two categories of tags.

Context (cover letter / extracted text):
${textContext}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "concreteTags": ["tag1", "tag2", ...],
  "interpretiveTags": ["tag1", "tag2", ...]
}

Concrete tags: subject matter, medium, style, techniques, objects, people, scenes
Interpretive tags: mood, themes, emotion, aesthetic qualities, art movements, conceptual ideas

Keep tags concise (1-3 words each), lowercase, and specific to this artwork.`,
              },
            ],
          },
        ],
      });

      totalInputTokens += result.usage.input_tokens;
      totalOutputTokens += result.usage.output_tokens;

      const content = result.content[0];
      const tags = JSON.parse(content.text);

      results.push({
        id: asset.id,
        submissionId: asset.submissionId,
        title: asset.submission.submissionTitle,
        artist: asset.submission.artistName,
        tags,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      });

      console.log(`  ✓ Concrete: ${tags.concreteTags.join(', ')}`);
      console.log(`  ✓ Interpretive: ${tags.interpretiveTags.join(', ')}`);
      console.log(
        `  ✓ Tokens: ${result.usage.input_tokens} in, ${result.usage.output_tokens} out\n`
      );
    } catch (err) {
      console.error(
        `  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  }

  // Save results
  const outputPath = resolve(process.cwd(), 'tag-results.json');
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        sampleSize: assets.length,
        results,
        summary: {
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          avgTokensPerImage: Math.round(
            (totalInputTokens + totalOutputTokens) / assets.length
          ),
          estimatedFor212: Math.round(
            ((totalInputTokens + totalOutputTokens) / assets.length) * 212
          ),
        },
      },
      null,
      2
    )
  );

  console.log('━'.repeat(60));
  console.log('📊 Token usage summary:');
  console.log(`  Total input tokens: ${totalInputTokens}`);
  console.log(`  Total output tokens: ${totalOutputTokens}`);
  console.log(`  Total tokens (5 images): ${totalInputTokens + totalOutputTokens}`);

  const avgPerImage = (totalInputTokens + totalOutputTokens) / assets.length;
  const estimatedFor212 = Math.round(avgPerImage * 212);

  console.log('\n💰 Extrapolation to full library (212 images):');
  console.log(
    `  Estimated tokens: ~${estimatedFor212} (at ${Math.round(avgPerImage)} tokens/image)`
  );

  console.log(`\n📁 Results saved to: ${outputPath}`);
  console.log('\n✓✓✓ Review tag-results.json, then run: npx tsx scripts/write-tags.ts');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n✗ FAILED:\n', err);
  process.exit(1);
});

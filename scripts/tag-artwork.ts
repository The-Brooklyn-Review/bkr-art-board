/**
 * Auto-tag artwork demo: generate AI tags for 5 random artAssets to measure
 * token cost and review tag quality before doing all 212.
 *
 * Run: npx tsx scripts/tag-artwork.ts
 *
 * Outputs JSON to stdout and saves to tag-results.json for review.
 * Does NOT write to database — inspect results first, then decide.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { getSignedR2Url } from "@/lib/storage/r2";
import Anthropic from "@anthropic-ai/sdk";
import https from "node:https";

config({ path: resolve(process.cwd(), ".env.local") });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface TagResult {
  concreteTags: string[];
  interpretiveTags: string[];
}

async function fetchImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString("base64"));
      });
      res.on("error", reject);
    });
  });
}

async function tagArtwork(
  assetId: string,
  imageUrl: string,
  textContext: string,
): Promise<TagResult> {
  const imageBase64 = await fetchImageAsBase64(imageUrl);

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageBase64,
            },
          },
          {
            type: "text",
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

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const tags: TagResult = JSON.parse(content.text);
  return tags;
}

async function main() {
  console.log("🎨 Auto-tag artwork demo (review mode)\n");

  // Load 5 random visible artAssets
  console.log("[1] Loading 5 random visible artAssets…");
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
    skip: Math.floor(Math.random() * (212 - 5)), // Random offset for sampling
  });

  if (assets.length === 0) {
    console.log("✗ No visible artAssets found!");
    process.exit(1);
  }

  console.log(`✓ Loaded ${assets.length} artAssets\n`);

  const results: Array<{
    id: string;
    submissionId: string;
    title: string | null;
    artist: string | null;
    tags: TagResult;
    inputTokens: number;
    outputTokens: number;
  }> = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Process each asset sequentially
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const assetNum = i + 1;

    console.log(
      `[${assetNum}/${assets.length}] Processing: "${asset.submission.submissionTitle || "untitled"}" by ${asset.submission.artistName || "unknown"}`,
    );

    try {
      // Get signed URL for the large image
      const imageUrl = await getSignedR2Url(asset.storagePathLarge);

      // Combine text context
      const textParts = [
        asset.submission.coverLetter || "",
        asset.extractedText || "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const textContext =
        textParts.slice(0, 1000) || "(no text context available)";

      // Tag the artwork
      const result = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: await fetchImageAsBase64(imageUrl),
                },
              },
              {
                type: "text",
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
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      const tags: TagResult = JSON.parse(content.text);

      results.push({
        id: asset.id,
        submissionId: asset.submissionId,
        title: asset.submission.submissionTitle,
        artist: asset.submission.artistName,
        tags,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      });

      console.log(`  ✓ Concrete: ${tags.concreteTags.join(", ")}`);
      console.log(`  ✓ Interpretive: ${tags.interpretiveTags.join(", ")}`);
      console.log(
        `  ✓ Tokens: ${result.usage.input_tokens} in, ${result.usage.output_tokens} out\n`,
      );
    } catch (err) {
      console.error(
        `  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  // Save results to JSON file
  const outputPath = resolve(process.cwd(), "tag-results.json");
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
            (totalInputTokens + totalOutputTokens) / assets.length,
          ),
          estimatedFor212: Math.round(
            ((totalInputTokens + totalOutputTokens) / assets.length) * 212,
          ),
        },
      },
      null,
      2,
    ),
  );

  // Report results
  console.log("━".repeat(60));
  console.log("📊 Token usage summary:");
  console.log(`  Total input tokens: ${totalInputTokens}`);
  console.log(`  Total output tokens: ${totalOutputTokens}`);
  console.log(`  Total tokens (5 images): ${totalInputTokens + totalOutputTokens}`);

  const avgPerImage = (totalInputTokens + totalOutputTokens) / assets.length;
  const estimatedFor212 = Math.round(avgPerImage * 212);

  console.log("\n💰 Extrapolation to full library (212 images):");
  console.log(
    `  Estimated tokens: ~${estimatedFor212} (at ${Math.round(avgPerImage)} tokens/image)`,
  );
  console.log(`  Confidence: sample size ${assets.length} images`);

  console.log(`\n📁 Results saved to: ${outputPath}`);
  console.log("\n✓✓✓ Tag demo completed. Review results, then decide whether to:");
  console.log("  1. Adjust the prompt and re-run");
  console.log("  2. Write results to database with a separate script");
}


main()
  .catch((err) => {
    console.error("\n✗ TAG DEMO FAILED:\n", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

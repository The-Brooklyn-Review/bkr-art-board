/**
 * Extracts, per submission:
 *   - a title (plus medium, dimensions, year when stated) for each
 *     individual artwork page — from the caption on the page, its PDF text
 *     layer, or a numbered list in the cover letter / form / submission
 *     title. Null when the artist didn't name the piece anywhere.
 *   - the artist's website and Instagram handle (never email — it's
 *     private and never shown).
 *
 * One Claude call per submission: every artwork page image, each page's
 * text layer, the cover letter and the form's text fields. Results go to
 * ArtAsset.localTitle/medium/dimensions/year/titleSource and
 * SubmittableSubmission.artistWebsite/artistInstagram.
 *
 * Idempotent: only submissions with an artwork asset whose
 * metadataExtractedAt is null are processed. Re-importing a submission
 * recreates its assets, so it's picked up again on the next run.
 *
 * Mutating (DB). Costs Claude API credit (roughly $0.05–0.10 a submission).
 *
 * Run:
 *   npx tsx scripts/extract-metadata.ts                  # every pending submission
 *   npx tsx scripts/extract-metadata.ts --dry-run --limit 3   # print results, write nothing
 *   npx tsx scripts/extract-metadata.ts <submittableId> [...] # just these (re-extracts)
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { fetchR2Object } from "@/lib/storage/r2";
import { normalizeInstagram, normalizeWebsite } from "@/lib/extraction/contact";
import { sentenceCase } from "@/lib/extraction/text";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

const TITLE_SOURCES = ["page_caption", "cover_letter", "form_field", "submission_title"] as const;
type TitleSource = (typeof TITLE_SOURCES)[number];

interface ExtractedArtwork {
  page: string;
  title: string | null;
  medium: string | null;
  dimensions: string | null;
  year: string | null;
  title_source: TitleSource | null;
}
interface Extraction {
  website: string | null;
  instagram: string | null;
  artworks: ExtractedArtwork[];
}

const nullableString = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["website", "instagram", "artworks"],
  properties: {
    website: nullableString,
    instagram: nullableString,
    artworks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "title", "medium", "dimensions", "year", "title_source"],
        properties: {
          page: { type: "string" },
          title: nullableString,
          medium: nullableString,
          dimensions: nullableString,
          year: nullableString,
          title_source: { anyOf: [{ type: "string", enum: [...TITLE_SOURCES] }, { type: "null" }] },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You are cataloguing an artist's submission to a literary magazine's visual-art section. Each artwork page is labelled (P1, P2, …) and shown as an image, followed by any text found in the PDF's text layer for that page.

For EVERY artwork page, return one entry in "artworks" (same page label):
- title: the title the artist gave this specific piece, exactly as written (keep their capitalization; drop surrounding quotes). Look in this order:
  1. a caption on the page itself (in the image or its text layer) → title_source "page_caption"
  2. a numbered or ordered list of titles in the cover letter / statement that clearly maps to the page order → "cover_letter"
  3. the same kind of list in a form field → "form_field"
  4. the submission title, only when it is clearly a list of the individual pieces' titles in order → "submission_title"
  If the artist wrote "Untitled", that is the title. A series name alone is not a piece title unless the artist uses it as one (e.g. "Landscape 6/1").
  If you can't tell which title belongs to this page, or the artist never named it, return null — never invent or describe.
- medium, dimensions, year: only when the artist states them for this piece; otherwise null. Copy them as written.
- title_source: as above, or null when title is null.

Also return:
- website: the artist's own website, if they give one anywhere (a portfolio page on a site like Artsy or Saatchi counts if it is the only one). Not file-sharing links (Dropbox, Google Drive, WeTransfer), not Submittable, not social media. Null if none.
- instagram: their Instagram handle (without "@"), if given anywhere. Null if none.
Never return an email address in any field.`;

type SubmissionWithAssets = Awaited<ReturnType<typeof loadSubmissions>>[number];

async function loadSubmissions(ids: string[]) {
  return prisma.submittableSubmission.findMany({
    where: ids.length
      ? { submittableId: { in: ids } }
      : { assets: { some: { pageType: "artwork", metadataExtractedAt: null } } },
    select: {
      id: true,
      submittableId: true,
      artistName: true,
      submissionTitle: true,
      coverLetter: true,
      artistStatement: true,
      rawEntriesJson: true,
      assets: {
        select: {
          id: true,
          pageType: true,
          fileIndex: true,
          pageNumber: true,
          extractedText: true,
          storagePathLarge: true,
        },
        orderBy: [{ fileIndex: "asc" }, { pageNumber: "asc" }],
      },
    },
    orderBy: { artistName: "asc" },
  });
}

/** Short text answers from the Submittable form (file fields excluded). */
function formTextFields(rawEntriesJson: unknown): string[] {
  const out: string[] = [];
  const entries = (rawEntriesJson as { formEntries?: { entry?: { fieldData?: unknown[] } }[] })
    ?.formEntries;
  for (const fe of entries ?? []) {
    for (const d of (fe.entry?.fieldData ?? []) as { value?: unknown }[]) {
      if (typeof d.value === "string" && d.value.trim()) out.push(d.value.trim());
    }
  }
  return out;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/** Emails are never needed for extraction, so they never leave the DB. */
const redact = (t: string) => t.replace(EMAIL, "[email removed]");

async function buildContent(s: SubmissionWithAssets) {
  const artwork = s.assets.filter((a) => a.pageType === "artwork");
  const other = s.assets.filter((a) => a.pageType !== "artwork" && a.extractedText?.trim());
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];

  const intro = [
    `Artist: ${s.artistName ?? "(unknown)"}`,
    `Submission title: ${s.submissionTitle ?? "(none)"}`,
    "",
    "Form fields:",
    ...formTextFields(s.rawEntriesJson).map((v) => `- ${redact(v)}`),
    "",
    "Cover letter / statement:",
    redact([s.coverLetter, s.artistStatement].filter(Boolean).join("\n\n") || "(none)"),
  ];
  if (other.length) {
    intro.push("", "Text from non-artwork pages (statement, title pages):");
    for (const a of other) intro.push(redact(a.extractedText!.trim()));
  }
  content.push({ type: "text", text: intro.join("\n") });

  const labels = new Map<string, string>();
  for (const [i, a] of artwork.entries()) {
    const label = `P${i + 1}`;
    labels.set(label, a.id);
    const { body } = await fetchR2Object(a.storagePathLarge);
    content.push({
      type: "text",
      text: `${label} (file ${(a.fileIndex ?? 0) + 1}, page ${a.pageNumber ?? 1}). Text layer: ${
        a.extractedText?.trim() ? redact(a.extractedText.trim()) : "(none)"
      }`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/webp", data: body.toString("base64") },
    });
  }
  content.push({ type: "text", text: INSTRUCTIONS });
  return { content, labels, artwork };
}

async function extract(content: Anthropic.Beta.BetaContentBlockParam[]) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`refused (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("hit max_tokens");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");
  return { result: JSON.parse(text.text) as Extraction, usage: response.usage };
}

const clean = (v: string | null | undefined) => {
  const t = v
    ?.trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
  return t ? t : null;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit");

  const submissions = (await loadSubmissions(ids)).slice(0, limit);
  console.log(`${submissions.length} submission(s) to extract${dryRun ? " (dry run)" : ""}\n`);

  let inTok = 0;
  let outTok = 0;
  let titled = 0;
  let pages = 0;
  const failures: string[] = [];

  for (const [i, s] of submissions.entries()) {
    const who = `${s.artistName} — "${s.submissionTitle}"`;
    process.stdout.write(`[${i + 1}/${submissions.length}] ${who.slice(0, 60)} … `);
    try {
      const { content, labels, artwork } = await buildContent(s);
      if (artwork.length === 0) {
        console.log("no artwork pages, skipped");
        continue;
      }
      const { result, usage } = await extract(content);
      inTok += usage.input_tokens;
      outTok += usage.output_tokens;

      const website = normalizeWebsite(result.website);
      const instagram = normalizeInstagram(result.instagram);
      const byAsset = new Map<string, ExtractedArtwork>();
      for (const a of result.artworks) {
        const assetId = labels.get(a.page);
        if (assetId) byAsset.set(assetId, a);
      }
      const n = [...byAsset.values()].filter((a) => clean(a.title)).length;
      titled += n;
      pages += artwork.length;
      console.log(
        `${n}/${artwork.length} titled${website ? ` · ${website}` : ""}${instagram ? ` · @${instagram}` : ""}`,
      );
      if (dryRun) {
        for (const [label, id] of labels) {
          const a = byAsset.get(id);
          console.log(
            `    ${label}: ${a?.title ?? "—"}${a?.title_source ? ` [${a.title_source}]` : ""}${
              a?.medium ? ` · ${a.medium}` : ""
            }${a?.dimensions ? ` · ${a.dimensions}` : ""}${a?.year ? ` · ${a.year}` : ""}`,
          );
        }
        continue;
      }

      const now = new Date();
      await prisma.$transaction([
        ...artwork.map((asset) => {
          const a = byAsset.get(asset.id);
          const title = clean(a?.title);
          return prisma.artAsset.update({
            where: { id: asset.id },
            data: {
              localTitle: title,
              medium: sentenceCase(clean(a?.medium)),
              dimensions: clean(a?.dimensions),
              year: clean(a?.year),
              titleSource: title && a?.title_source ? a.title_source : null,
              metadataExtractedAt: now,
            },
          });
        }),
        prisma.submittableSubmission.update({
          where: { id: s.id },
          data: { artistWebsite: website, artistInstagram: instagram },
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg.slice(0, 120)}`);
      failures.push(`${who}: ${msg}`);
    }
  }

  // Opus 5.5 list prices: $4 / $20 per million input / output tokens.
  const cost = (inTok * 4 + outTok * 20) / 1_000_000;
  console.log("\n" + "━".repeat(70));
  console.log(`Titled ${titled}/${pages} artwork pages across ${submissions.length} submissions`);
  console.log(
    `Tokens: ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out ≈ $${cost.toFixed(2)}`,
  );
  if (failures.length) {
    console.log(`\n✗ ${failures.length} failed (rerun to retry — they stay pending):`);
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());

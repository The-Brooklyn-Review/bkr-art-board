// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Renders every page of a PDF to a JPEG buffer via pdftoppm (Poppler).
 * Requires `pdftoppm` on PATH — local/admin-triggered processing only,
 * never runs on Vercel. See scripts/test-r2.ts-style ground-truth check:
 * confirmed working via `which pdftoppm` before this module was written.
 */
export async function renderPdfPages(pdfBuffer: Buffer, dpi = 220): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "bkr-pdf-"));
  const inputPath = join(dir, "input.pdf");
  const outputPrefix = join(dir, "page");

  try {
    await writeFile(inputPath, pdfBuffer);

    await execFileAsync("pdftoppm", ["-jpeg", "-r", String(dpi), inputPath, outputPrefix]);

    const files = (await readdir(dir))
      .filter((f) => f.startsWith("page") && f.endsWith(".jpg"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      throw new Error("pdftoppm produced no output pages");
    }

    return Promise.all(files.map((f) => readFile(join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Per-page embedded text via pdftotext (Poppler) — confirmed on real
 * submission data that captions ("Firefly / 2025 / Acrylic on canvas") are
 * genuine embedded text, not flattened into the rasterized image, so this
 * is worth extracting for search even though most of a page's *art* is
 * just pixels. One process call for the whole PDF, split on the form-feed
 * character pdftotext uses as its default page separator — much cheaper
 * than one subprocess per page.
 */
export async function extractPdfPagesText(pdfBuffer: Buffer): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "bkr-pdftext-"));
  const inputPath = join(dir, "input.pdf");

  try {
    await writeFile(inputPath, pdfBuffer);
    const { stdout } = await execFileAsync("pdftotext", [inputPath, "-"]);
    // pdftotext emits one trailing \f after the last page — drop the
    // resulting empty final element rather than treat it as a phantom page.
    const pages = stdout.split("\f").map((s) => s.trim());
    if (pages.length > 0 && pages[pages.length - 1] === "") pages.pop();
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

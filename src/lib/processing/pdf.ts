// No `server-only` guard: shared with standalone scripts run via tsx,
// where that package unconditionally throws (see src/lib/db/index.ts).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Longest side, in pixels, any rendered page may have. sharp refuses
 * inputs over ~268 megapixels by default, and a few submissions are
 * poster-sized PDFs (one Fall 2026 page failed at 220 dpi). 12,000 px keeps
 * a square page under 144 MP. Ordinary pages are unaffected: a US Letter
 * page at 220 dpi is 2,420 px on its long side, and everything is resized
 * to 1,800 px for display anyway.
 */
export const MAX_RENDER_LONG_SIDE_PX = 12_000;

/**
 * The dpi to render at: the requested dpi, lowered only as far as needed so
 * the largest page's long side stays within maxLongSidePx. Page sizes are
 * in PDF points (1/72 inch), as reported by pdfinfo.
 */
export function capDpiForPageSizes(
  dpi: number,
  pageSizesPts: { width: number; height: number }[],
  maxLongSidePx = MAX_RENDER_LONG_SIDE_PX,
): number {
  const longestPts = Math.max(0, ...pageSizesPts.map((p) => Math.max(p.width, p.height)));
  if (longestPts <= 0) return dpi;
  const maxDpi = Math.floor(maxLongSidePx / (longestPts / 72));
  return Math.max(1, Math.min(dpi, maxDpi));
}

/** Every page's size in PDF points, via pdfinfo (Poppler, same as pdftoppm). */
async function readPageSizesPts(inputPath: string): Promise<{ width: number; height: number }[]> {
  const { stdout: summary } = await execFileAsync("pdfinfo", [inputPath]);
  const pageCount = Number(/^Pages:\s+(\d+)/m.exec(summary)?.[1] ?? "0");
  if (pageCount === 0) return [];
  const { stdout } = await execFileAsync("pdfinfo", [
    "-f",
    "1",
    "-l",
    String(pageCount),
    inputPath,
  ]);
  const sizes: { width: number; height: number }[] = [];
  for (const m of stdout.matchAll(/^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gm)) {
    sizes.push({ width: Number(m[1]), height: Number(m[2]) });
  }
  return sizes;
}

/**
 * Renders every page of a PDF to a JPEG buffer via pdftoppm (Poppler).
 * Requires `pdftoppm` and `pdfinfo` on PATH — local/admin-triggered
 * processing only, never runs on Vercel. See scripts/test-r2.ts-style
 * ground-truth check: confirmed working via `which pdftoppm` before this
 * module was written.
 *
 * The requested dpi is lowered for oversized PDFs — see
 * MAX_RENDER_LONG_SIDE_PX.
 */
export async function renderPdfPages(pdfBuffer: Buffer, dpi = 220): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "bkr-pdf-"));
  const inputPath = join(dir, "input.pdf");
  const outputPrefix = join(dir, "page");

  try {
    await writeFile(inputPath, pdfBuffer);

    const effectiveDpi = capDpiForPageSizes(dpi, await readPageSizesPts(inputPath));
    if (effectiveDpi < dpi) {
      console.log(`    (oversized pages — rendering at ${effectiveDpi} dpi instead of ${dpi})`);
    }

    await execFileAsync("pdftoppm", ["-jpeg", "-r", String(effectiveDpi), inputPath, outputPrefix]);

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

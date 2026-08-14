/**
 * Phase 1 dry-run (Checkpoint A).
 *
 * Proves, against the LIVE Submittable API:
 *   1. Auth works (and which header encoding the API accepts).
 *   2. We can locate "Winter 2025 Visual Arts Submissions" (→ projectId).
 *   3. We can locate the "Consider" label + the 7 art labels (→ labelIds).
 *   4. We can count submissions matching project + status=completed + Consider.
 *
 * Downloads NOTHING. Dumps every raw response to fixtures/ so all later code is
 * written against real shapes, not assumptions.
 *
 * Run: npx tsx scripts/dry-run.ts
 */

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  submittableFetch,
  fetchAllPages,
  SubmittableError,
} from "../src/lib/submittable/client.ts";
import type { ListProject, Label, SubmissionListItem } from "../src/lib/submittable/types.ts";

config({ path: resolve(process.cwd(), ".env.local") });

const FIXTURES_DIR = resolve(process.cwd(), "fixtures");
mkdirSync(FIXTURES_DIR, { recursive: true });

function dump(name: string, data: unknown) {
  const path = resolve(FIXTURES_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`   ↳ wrote fixtures/${name}`);
}

// Defaults below are tied to the Winter 2025 cycle this pipeline was built
// for. A future submission cycle (new project, different label/count) needs
// its own values — set the ART_LIBRARY_* env vars rather than editing these
// defaults, so old fixtures/config stay reproducible. If PROJECT_NAME
// doesn't match, this script lists every available project name to pick
// the new one from (see "not found" branch below).
const PROJECT_NAME = process.env.ART_LIBRARY_PROJECT_NAME ?? "Winter 2025 Visual Arts Submissions";
const REQUIRED_LABEL = process.env.ART_LIBRARY_REQUIRED_LABEL ?? "Consider";
const REQUIRED_STATUS = process.env.ART_LIBRARY_REQUIRED_STATUS ?? "completed";
const EXPECTED = Number(process.env.ART_LIBRARY_EXPECTED_SUBMISSION_COUNT ?? "46");

const KNOWN_ART_LABELS = [
  "Landscape",
  "Photography",
  "Figurative",
  "Painting/Drawing",
  "Collage",
  "Abstract",
  "Multimedia",
];

const hr = () => console.log("─".repeat(70));

/** Try each auth encoding against /v4/organizations; set the one that works. */
async function probeAuth(): Promise<void> {
  const formats = ["bearer", "standard", "nocolon", "raw"] as const;
  for (const format of formats) {
    process.env.SUBMITTABLE_AUTH_FORMAT = format;
    try {
      const org = await submittableFetch<unknown>("/v4/organizations");
      console.log(`✓ Auth OK using format="${format}"`);
      dump("organization.json", org);
      return;
    } catch (err) {
      if (err instanceof SubmittableError && (err.status === 401 || err.status === 403)) {
        console.log(`  · format="${format}" rejected (${err.status})`);
        continue;
      }
      throw err; // non-auth error — surface it
    }
  }
  throw new Error("All auth formats failed. Check SUBMITTABLE_API_KEY.");
}

async function main() {
  hr();
  console.log("TBR Art Board — Submittable dry-run");
  console.log(`Project : ${PROJECT_NAME}`);
  console.log(`Label   : ${REQUIRED_LABEL}`);
  console.log(`Status  : ${REQUIRED_STATUS}`);
  console.log(`Expected: ~${EXPECTED} submissions`);
  hr();

  // 1. AUTH
  console.log("\n[1] Verifying authentication…");
  await probeAuth();

  // 2. PROJECT
  console.log("\n[2] Locating project…");
  const projects = await fetchAllPages<ListProject>("/v4/projects?size=500");
  dump("projects.json", projects);
  console.log(`   Found ${projects.length} projects total.`);
  const project = projects.find(
    (p) => (p.name ?? "").trim().toLowerCase() === PROJECT_NAME.toLowerCase(),
  );
  if (!project) {
    console.log(`\n✗ Could not find a project named "${PROJECT_NAME}".`);
    console.log("  Available project names (look for a near-match):");
    projects
      .filter((p) => !p.isArchived)
      .forEach((p) => console.log(`    · ${p.name}  [${p.projectId}]`));
    throw new Error("Project not found — see list above.");
  }
  console.log(`✓ Project: "${project.name}"`);
  console.log(`   projectId   = ${project.projectId}`);
  console.log(`   initialFormId = ${project.initialFormId}`);

  // 3. LABELS
  console.log("\n[3] Locating labels…");
  const labels = await fetchAllPages<Label>("/v4/labels?size=500");
  dump("labels.json", labels);
  console.log(`   Found ${labels.length} labels total.`);

  const byName = (n: string) =>
    labels.find((l) => (l.name ?? "").trim().toLowerCase() === n.toLowerCase());

  const considerLabel = byName(REQUIRED_LABEL);
  if (!considerLabel?.labelId) {
    console.log(`\n✗ Could not find label "${REQUIRED_LABEL}". All labels:`);
    labels.forEach((l) => console.log(`    · ${l.name}  [${l.labelId}]  (count ${l.count})`));
    throw new Error("Consider label not found — see list above.");
  }
  console.log(
    `✓ "${considerLabel.name}" label → ${considerLabel.labelId} (org-wide count ${considerLabel.count})`,
  );

  console.log("   Art labels present in org:");
  for (const name of KNOWN_ART_LABELS) {
    const l = byName(name);
    console.log(
      l ? `    ✓ ${name} → ${l.labelId}` : `    ✗ ${name} — NOT FOUND (may differ in spelling)`,
    );
  }

  // 4. MATCHING SUBMISSIONS
  console.log("\n[4] Counting matching submissions (project + completed + Consider)…");
  const filtered = await fetchAllPages<SubmissionListItem>(
    `/v4/submissions?Projects.Include=${project.projectId}` +
      `&Statuses.Include=${REQUIRED_STATUS}` +
      `&Labels.IncludeAll=${considerLabel.labelId}` +
      `&size=500`,
  );
  dump("submissions-matching.json", filtered);

  // 5. DIAGNOSTIC: all submissions in project (no status/label filter) → distribution
  console.log("\n[5] Diagnostic: full project submission breakdown…");
  const allInProject = await fetchAllPages<SubmissionListItem>(
    `/v4/submissions?Projects.Include=${project.projectId}&size=500`,
  );
  dump("submissions-all-in-project.json", allInProject);

  const statusCounts: Record<string, number> = {};
  const labelIdCounts: Record<string, number> = {};
  for (const s of allInProject) {
    const st = s.submissionStatus ?? "(none)";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    for (const lid of s.labels ?? []) labelIdCounts[lid] = (labelIdCounts[lid] ?? 0) + 1;
  }
  const labelName = (id: string) =>
    labels.find((l) => l.labelId === id)?.name ?? `(unknown ${id.slice(0, 8)})`;

  console.log(`   Total in project: ${allInProject.length}`);
  console.log("   By status:");
  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([st, n]) => console.log(`     ${st.padEnd(14)} ${n}`));
  console.log("   By label (top 15):");
  Object.entries(labelIdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([id, n]) => console.log(`     ${labelName(id).padEnd(22)} ${n}`));

  // SUMMARY
  hr();
  console.log("RESULT");
  hr();
  console.log(`Matching submissions (${REQUIRED_STATUS} + ${REQUIRED_LABEL}): ${filtered.length}`);
  console.log(`Expected:                                        ~${EXPECTED}`);
  if (filtered.length === EXPECTED) {
    console.log("✓ EXACT MATCH.");
  } else {
    console.log(
      `⚠ Count differs from expected by ${filtered.length - EXPECTED}. See [5] breakdown above to diagnose.`,
    );
  }

  console.log("\nFirst matching submissions:");
  filtered.slice(0, 8).forEach((s, i) => {
    const name =
      [s.submitterFirstName, s.submitterLastName].filter(Boolean).join(" ") || "(no name)";
    const labelNames = (s.labels ?? []).map(labelName).join(", ");
    console.log(
      `  ${String(i + 1).padStart(2)}. ${name.padEnd(24)} "${s.submissionTitle ?? "(untitled)"}"`,
    );
    console.log(`      status=${s.submissionStatus}  labels=[${labelNames}]`);
    console.log(`      submissionId=${s.submissionId}`);
  });

  hr();
  console.log("Fixtures written to fixtures/. Dry-run complete — no files downloaded.");
  hr();
}

main().catch((err) => {
  console.error("\n✗ DRY-RUN FAILED:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

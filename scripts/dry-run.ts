/**
 * Read-only preflight check against the live Submittable API before running
 * the real importer (process-submission.ts). Proves:
 *   1. Auth works (and which header encoding the API accepts).
 *   2. We can locate the visual-arts project(s) (→ projectIds) — see
 *      "PROJECT DISCOVERY" below.
 *   3. We can locate the art labels (and an optional required label).
 *   4. We can list the submissions to import — by default every submission
 *      that is still UNDECIDED (see "STATUS FILTER" below).
 *   5. Who they're assigned to (reviewer IDs, resolved to names if the API
 *      key is allowed to read the team list).
 *   6. CONTINUITY: if fixtures/winter-2025/ exists (a backup of the Winter
 *      2025 import's fixtures), whether those already-imported submissions
 *      still exist under the same Submittable IDs, still `completed` +
 *      "Consider". The head editor moved them into the Fall 2026 project; if
 *      their IDs changed, re-importing would duplicate them, so check first.
 *
 * Downloads NOTHING, writes nothing to the DB. Dumps raw responses to
 * fixtures/ — process-submission.ts --all imports exactly the submissions in
 * fixtures/submissions-matching.json.
 *
 * PROJECT DISCOVERY: every non-archived project whose name contains
 * ART_LIBRARY_PROJECT_NAME_PATTERN (default "visual arts", case-insensitive).
 * Several matches are fine (one per submission cycle) and all are included;
 * zero matches fails loudly with the list of live projects.
 * ART_LIBRARY_PROJECT_NAME (exact name) overrides discovery and can target an
 * archived project.
 *
 * STATUS FILTER: by default, excludes statuses that mean the submission has
 * already been decided — ART_LIBRARY_EXCLUDED_STATUSES, default
 * "completed,accepted,declined,withdrawn" — leaving new / in_progress /
 * received / viewed / editable (and anything unexpected, which should be
 * reviewed rather than silently skipped). Setting ART_LIBRARY_REQUIRED_STATUS
 * switches to the old include-one-status behaviour instead (the Winter 2025
 * import used ART_LIBRARY_REQUIRED_STATUS=completed + ART_LIBRARY_REQUIRED_LABEL=Consider).
 *
 * See docs/SPEC-review-and-sync.md §4 for what the app imports and why.
 *
 * Run: npx tsx scripts/dry-run.ts
 */

import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { submittableFetch, fetchAllPages, SubmittableError } from "@/lib/submittable/client";
import type { ListProject, Label, SubmissionListItem } from "@/lib/submittable/types";

config({ path: resolve(process.cwd(), ".env.local") });

const FIXTURES_DIR = resolve(process.cwd(), "fixtures");
const WINTER_BACKUP = resolve(FIXTURES_DIR, "winter-2025", "submissions-matching.json");
mkdirSync(FIXTURES_DIR, { recursive: true });

function dump(name: string, data: unknown) {
  const path = resolve(FIXTURES_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`   ↳ wrote fixtures/${name}`);
}

const PROJECT_NAME = process.env.ART_LIBRARY_PROJECT_NAME || null;
const PROJECT_NAME_PATTERN = process.env.ART_LIBRARY_PROJECT_NAME_PATTERN || "visual arts";
const REQUIRED_LABEL = process.env.ART_LIBRARY_REQUIRED_LABEL || null;
const REQUIRED_STATUS = process.env.ART_LIBRARY_REQUIRED_STATUS || null;
const EXCLUDED_STATUSES = (
  process.env.ART_LIBRARY_EXCLUDED_STATUSES || "completed,accepted,declined,withdrawn"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EXPECTED = process.env.ART_LIBRARY_EXPECTED_SUBMISSION_COUNT
  ? Number(process.env.ART_LIBRARY_EXPECTED_SUBMISSION_COUNT)
  : null;

// The labels reviewers can apply (docs/SPEC-review-and-sync.md §6.1).
// Matched case-insensitively — Submittable's own casing is inconsistent
// ("landscape", "A Grade", "B GRADE").
const KNOWN_ART_LABELS = [
  "Landscape",
  "Photography",
  "Figurative",
  "Painting/Drawing",
  "Multimedia",
  "Abstract",
  "Collage",
  "Sculpture/Textile/Object",
  "A Grade",
  "B Grade",
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

/** Repeated-key query string for an array param (OpenAPI style=form, explode). */
function repeat(key: string, values: string[]): string {
  return values.map((v) => `&${key}=${encodeURIComponent(v)}`).join("");
}

type TeamMember = {
  userId: string;
  email?: string | null;
  name?: { first?: string | null; last?: string | null; full?: string | null } | null;
};

/** Best-effort reviewer-name lookup; returns an empty map if not permitted. */
async function lookupReviewerNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  try {
    const members = await submittableFetch<TeamMember[]>("/v4/organizations/team/list", {
      method: "POST",
      body: JSON.stringify({ userIds }),
    });
    dump("team-members.json", members);
    for (const m of members ?? []) {
      const full = m.name?.full || [m.name?.first, m.name?.last].filter(Boolean).join(" ");
      names.set(m.userId, full || m.email || m.userId);
    }
  } catch (err) {
    const why = err instanceof SubmittableError ? `HTTP ${err.status}` : String(err);
    console.log(`   (couldn't resolve reviewer names — ${why}; showing IDs only)`);
  }
  return names;
}

async function main() {
  hr();
  console.log("BKR Art Board — Submittable dry-run");
  console.log(
    `Project : ${PROJECT_NAME ? `"${PROJECT_NAME}" (exact override)` : `all non-archived containing "${PROJECT_NAME_PATTERN}"`}`,
  );
  console.log(
    `Status  : ${REQUIRED_STATUS ? `only "${REQUIRED_STATUS}"` : `excluding ${EXCLUDED_STATUSES.join(", ")}`}`,
  );
  console.log(`Label   : ${REQUIRED_LABEL ?? "(none required)"}`);
  console.log(
    `Expected: ${EXPECTED !== null ? `~${EXPECTED} submissions` : "(not set — skipping count check)"}`,
  );
  hr();

  // 1. AUTH
  console.log("\n[1] Verifying authentication…");
  await probeAuth();

  // 2. PROJECTS
  console.log("\n[2] Locating project(s)…");
  const projects = await fetchAllPages<ListProject>("/v4/projects?size=500");
  dump("projects.json", projects);
  console.log(`   Found ${projects.length} projects total.`);
  const liveProjects = projects.filter((p) => !p.isArchived);

  let selected: ListProject[];
  if (PROJECT_NAME) {
    selected = projects.filter(
      (p) => (p.name ?? "").trim().toLowerCase() === PROJECT_NAME.toLowerCase(),
    );
  } else {
    const pattern = PROJECT_NAME_PATTERN.toLowerCase();
    selected = liveProjects.filter((p) => (p.name ?? "").toLowerCase().includes(pattern));
  }
  if (selected.length === 0) {
    console.log(
      PROJECT_NAME
        ? `\n✗ No project named "${PROJECT_NAME}".`
        : `\n✗ No non-archived project name contains "${PROJECT_NAME_PATTERN}".`,
    );
    console.log("  Available (non-archived) project names:");
    liveProjects.forEach((p) => console.log(`    · ${p.name}  [${p.projectId}]`));
    throw new Error("No matching project — see list above.");
  }
  for (const p of selected) {
    console.log(`✓ Project: "${p.name}"  [${p.projectId}]${p.isArchived ? "  (archived)" : ""}`);
  }
  const projectIds = selected.map((p) => p.projectId);

  // 3. LABELS
  console.log("\n[3] Locating labels…");
  const labels = await fetchAllPages<Label>("/v4/labels?size=500");
  dump("labels.json", labels);
  console.log(`   Found ${labels.length} labels total.`);
  const byName = (n: string) =>
    labels.find((l) => (l.name ?? "").trim().toLowerCase() === n.toLowerCase());
  const labelName = (id: string) =>
    labels.find((l) => l.labelId === id)?.name ?? `(unknown ${id.slice(0, 8)})`;

  let requiredLabelId: string | null = null;
  if (REQUIRED_LABEL) {
    const l = byName(REQUIRED_LABEL);
    if (!l?.labelId) {
      console.log(`\n✗ Could not find label "${REQUIRED_LABEL}". All labels:`);
      labels.forEach((x) => console.log(`    · ${x.name}  [${x.labelId}]`));
      throw new Error("Required label not found — see list above.");
    }
    requiredLabelId = l.labelId;
    console.log(`✓ Required label "${l.name}" → ${l.labelId}`);
  }
  console.log("   Art labels:");
  for (const name of KNOWN_ART_LABELS) {
    const l = byName(name);
    console.log(
      l ? `    ✓ ${name.padEnd(17)} → ${l.labelId}` : `    ✗ ${name} — NOT FOUND (check spelling)`,
    );
  }
  const considerId = byName("Consider")?.labelId ?? null;

  // 4. SUBMISSIONS TO IMPORT
  console.log("\n[4] Listing submissions to import…");
  const statusFilter = REQUIRED_STATUS
    ? repeat("Statuses.Include", [REQUIRED_STATUS])
    : repeat("Statuses.Exclude", EXCLUDED_STATUSES);
  const labelFilter = requiredLabelId ? repeat("Labels.IncludeAll", [requiredLabelId]) : "";
  const matching = await fetchAllPages<SubmissionListItem>(
    `/v4/submissions?size=500${repeat("Projects.Include", projectIds)}${statusFilter}${labelFilter}`,
  );
  dump("submissions-matching.json", matching);

  // 5. DIAGNOSTIC: everything in the project(s), unfiltered
  console.log("\n[5] Diagnostic: full project breakdown…");
  const allInProjects = await fetchAllPages<SubmissionListItem>(
    `/v4/submissions?size=500${repeat("Projects.Include", projectIds)}`,
  );
  dump("submissions-all-in-project.json", allInProjects);

  const statusCounts: Record<string, number> = {};
  const labelIdCounts: Record<string, number> = {};
  for (const s of allInProjects) {
    const st = s.submissionStatus ?? "(none)";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    for (const lid of s.labels ?? []) labelIdCounts[lid] = (labelIdCounts[lid] ?? 0) + 1;
  }
  console.log(`   Total in project(s): ${allInProjects.length}`);
  console.log("   By status:");
  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([st, n]) => console.log(`     ${st.padEnd(14)} ${n}`));
  console.log("   By label (top 15):");
  Object.entries(labelIdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([id, n]) => console.log(`     ${labelName(id).padEnd(22)} ${n}`));

  // 6. ASSIGNMENTS among the submissions to import
  console.log("\n[6] Reviewer assignments (submissions to import)…");
  const perReviewer: Record<string, number> = {};
  let unassigned = 0;
  let multi = 0;
  for (const s of matching) {
    const r = s.reviewers ?? [];
    if (r.length === 0) unassigned += 1;
    if (r.length > 1) multi += 1;
    for (const id of r) perReviewer[id] = (perReviewer[id] ?? 0) + 1;
  }
  const names = await lookupReviewerNames(Object.keys(perReviewer));
  Object.entries(perReviewer)
    .sort((a, b) => b[1] - a[1])
    .forEach(([id, n]) => console.log(`     ${(names.get(id) ?? id).padEnd(38)} ${n}`));
  console.log(`     (unassigned)${" ".repeat(26)} ${unassigned}`);
  console.log(`     submissions with 2+ reviewers: ${multi}`);

  // 7. CONTINUITY with the Winter 2025 import
  console.log("\n[7] Continuity with already-imported Winter 2025 submissions…");
  let continuityOk: boolean | null = null;
  if (!existsSync(WINTER_BACKUP)) {
    console.log("   (no fixtures/winter-2025/ backup — skipped)");
  } else {
    const winter = JSON.parse(readFileSync(WINTER_BACKUP, "utf-8")) as SubmissionListItem[];
    const now = new Map(allInProjects.map((s) => [s.submissionId, s]));
    const missing: SubmissionListItem[] = [];
    const changed: string[] = [];
    let intact = 0;
    for (const w of winter) {
      const cur = w.submissionId ? now.get(w.submissionId) : undefined;
      const who = `${w.submitterFirstName ?? ""} ${w.submitterLastName ?? ""}`.trim();
      if (!cur) {
        missing.push(w);
        continue;
      }
      const hasConsider = considerId ? (cur.labels ?? []).includes(considerId) : false;
      if (cur.submissionStatus === "completed" && hasConsider) intact += 1;
      else
        changed.push(
          `${who} — now status=${cur.submissionStatus}, Consider=${hasConsider ? "yes" : "no"}`,
        );
    }
    console.log(`   Winter submissions previously imported: ${winter.length}`);
    console.log(`   ✓ same ID, still completed + Consider:   ${intact}`);
    console.log(`   ~ same ID, status/label changed:         ${changed.length}`);
    changed.forEach((c) => console.log(`       · ${c}`));
    console.log(`   ✗ ID not found in project(s):            ${missing.length}`);
    missing.forEach((m) =>
      console.log(
        `       · ${m.submitterFirstName} ${m.submitterLastName} "${m.submissionTitle}" [${m.submissionId}]`,
      ),
    );
    const overlap = matching.filter((s) =>
      winter.some((w) => w.submissionId === s.submissionId),
    ).length;
    if (overlap > 0) {
      console.log(
        `   ⚠ ${overlap} already-imported Winter submission(s) are in the import list — they'll be reprocessed.`,
      );
    }
    continuityOk = missing.length === 0;
  }

  // SUMMARY
  hr();
  console.log("RESULT");
  hr();
  console.log(`Submissions to import: ${matching.length}`);
  if (EXPECTED !== null) {
    console.log(
      matching.length === EXPECTED
        ? `✓ Matches expected ${EXPECTED}.`
        : `⚠ Expected ~${EXPECTED}; differs by ${matching.length - EXPECTED}.`,
    );
  }
  if (continuityOk === false) {
    console.log(
      "✗ Some Winter submissions weren't found under their old IDs — STOP and review [7] before importing.",
    );
  } else if (continuityOk === true) {
    console.log("✓ All Winter submissions found under their original IDs.");
  }

  console.log("\nFirst submissions to import:");
  matching.slice(0, 8).forEach((s, i) => {
    const name =
      [s.submitterFirstName, s.submitterLastName].filter(Boolean).join(" ") || "(no name)";
    const labelNames = (s.labels ?? []).map(labelName).join(", ");
    const who = (s.reviewers ?? []).map((id) => names.get(id) ?? id.slice(0, 8)).join(", ");
    console.log(
      `  ${String(i + 1).padStart(2)}. ${name.padEnd(24)} "${s.submissionTitle ?? "(untitled)"}"`,
    );
    console.log(
      `      status=${s.submissionStatus}  labels=[${labelNames}]  reviewers=[${who || "—"}]`,
    );
  });

  hr();
  console.log(
    "Fixtures written to fixtures/. Dry-run complete — no files downloaded, no DB writes.",
  );
  console.log("Next: npx tsx scripts/process-submission.ts --all");
  hr();
}

main().catch((err) => {
  console.error("\n✗ DRY-RUN FAILED:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

// The Submittable → app sync (docs/SPEC-review-and-sync.md §5). Refreshes
// status, labels, project and assignments for every submission the app
// holds; hard-deletes withdrawn ones; reports submissions that need the
// importer. Metadata only — never downloads or renders files, so it's
// cheap enough for the in-app Sync button on Vercel and the daily Action.
//
// No `server-only` guard: shared with scripts/sync-submittable.ts (see
// src/lib/db/index.ts).
import { prisma } from "@/lib/db";
import { fetchAllPages } from "@/lib/submittable/client";
import type { Label, ListProject, SubmissionListItem } from "@/lib/submittable/types";
import { getTeamMembers, teamMemberName } from "@/lib/submittable/writes";
import { deleteFromR2 } from "@/lib/storage/r2";
import { tinyKeyFor } from "@/lib/storage/tiny";
import { planSync, sameSet, type RemoteSubmission } from "@/lib/sync/plan";

export interface SyncOptions {
  /** Plan and report only — no DB or R2 writes. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface SyncSummary {
  dryRun: boolean;
  projects: string[];
  remoteCount: number;
  localCount: number;
  updated: number;
  statusChanges: { artist: string; from: string | null; to: string | null }[];
  labelChanges: number;
  assignmentChanges: number;
  reviewersCreated: string[];
  deleted: string[];
  deleteErrors: string[];
  toImport: { artist: string; title: string | null; status: string | null }[];
  missingRemotely: string[];
  finishedAt: string;
}

const PLACEHOLDER_PREFIX = "Reviewer ·";
const placeholderName = (userId: string) => `${PLACEHOLDER_PREFIX}${userId.slice(0, 4)}`;

function remoteArtist(r: SubmissionListItem): string {
  return (
    [r.submitterFirstName, r.submitterLastName].filter(Boolean).join(" ") ||
    r.submissionId ||
    "(unknown)"
  );
}

export async function syncSubmittable(options: SyncOptions = {}): Promise<SyncSummary> {
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? (() => {});
  const pattern = (process.env.ART_LIBRARY_PROJECT_NAME_PATTERN || "visual arts").toLowerCase();

  // 1. Projects
  const projects = (await fetchAllPages<ListProject>("/v4/projects?size=500")).filter(
    (p) => !p.isArchived && (p.name ?? "").toLowerCase().includes(pattern),
  );
  if (projects.length === 0) {
    throw new Error(`No non-archived Submittable project name contains "${pattern}".`);
  }
  log(`Projects: ${projects.map((p) => p.name).join(", ")}`);

  // 2. Label catalogue
  const labels = await fetchAllPages<Label>("/v4/labels?size=500");
  if (!dryRun) {
    for (const l of labels) {
      if (!l.labelId) continue;
      const data = {
        name: l.name ?? "",
        color: l.backgroundColor,
        foregroundColor: l.foregroundColor,
        active: l.active ?? true,
        isConcealed: l.isConcealed ?? false,
        rawJson: JSON.parse(JSON.stringify(l)),
      };
      await prisma.submittableLabel.upsert({
        where: { submittableLabelId: l.labelId },
        update: data,
        create: { submittableLabelId: l.labelId, ...data },
      });
    }
  }
  const byName = (n: string) =>
    labels.find((l) => (l.name ?? "").trim().toLowerCase() === n)?.labelId ?? null;
  const workflowIds = { consider: byName("consider"), acceptance: byName("acceptance") };
  const localLabels = await prisma.submittableLabel.findMany({
    select: { id: true, submittableLabelId: true },
  });
  const localLabelId = new Map(localLabels.map((l) => [l.submittableLabelId, l.id]));

  // 3. Remote submissions (all statuses)
  const include = projects.map((p) => `&Projects.Include=${encodeURIComponent(p.projectId)}`);
  const remote = await fetchAllPages<SubmissionListItem>(
    `/v4/submissions?size=500${include.join("")}`,
  );
  const remoteById = new Map(remote.map((r) => [r.submissionId, r]));
  const projectNameById = new Map(projects.map((p) => [p.projectId, p.name]));

  // 4. Local submissions
  const local = await prisma.submittableSubmission.findMany({
    select: {
      id: true,
      submittableId: true,
      artistName: true,
      officialStatus: true,
      projectId: true,
      labels: { select: { labelId: true, label: { select: { submittableLabelId: true } } } },
      assignments: { select: { reviewer: { select: { submittableUserId: true } } } },
    },
  });
  const localById = new Map(local.map((l) => [l.id, l]));
  const plan = planSync(remote as RemoteSubmission[], local, workflowIds);

  const summary: SyncSummary = {
    dryRun,
    projects: projects.map((p) => p.name ?? p.projectId),
    remoteCount: remote.length,
    localCount: local.length,
    updated: 0,
    statusChanges: [],
    labelChanges: 0,
    assignmentChanges: 0,
    reviewersCreated: [],
    deleted: [],
    deleteErrors: [],
    toImport: plan.toImport.map((r) => {
      const full = remoteById.get(r.submissionId)!;
      return {
        artist: remoteArtist(full),
        title: full.submissionTitle,
        status: r.submissionStatus,
      };
    }),
    missingRemotely: plan.missingRemotely.map(
      (l) => localById.get(l.id)?.artistName ?? l.submittableId,
    ),
    finishedAt: "",
  };

  // 5. Reviewers referenced by any submission we hold
  const reviewerIds = new Set<string>();
  for (const { remote: r } of plan.toUpdate)
    for (const id of r.reviewers ?? []) reviewerIds.add(id);
  const existingReviewers = await prisma.reviewer.findMany({
    where: { submittableUserId: { in: [...reviewerIds] } },
  });
  const reviewerByUserId = new Map(existingReviewers.map((r) => [r.submittableUserId!, r]));
  const needNames = [...reviewerIds].filter((id) => {
    const r = reviewerByUserId.get(id);
    return !r || r.displayName.startsWith(PLACEHOLDER_PREFIX);
  });
  if (needNames.length > 0) {
    let names = new Map<string, { name: string; email: string | null }>();
    try {
      const members = await getTeamMembers(needNames);
      names = new Map(members.map((m) => [m.userId, { name: teamMemberName(m), email: m.email }]));
    } catch (err) {
      log(`  (couldn't fetch reviewer names: ${err instanceof Error ? err.message : err})`);
    }
    for (const userId of needNames) {
      const found = names.get(userId);
      const existing = reviewerByUserId.get(userId);
      if (dryRun) {
        if (!existing) summary.reviewersCreated.push(found?.name ?? placeholderName(userId));
        continue;
      }
      if (existing) {
        if (found) {
          reviewerByUserId.set(
            userId,
            await prisma.reviewer.update({
              where: { id: existing.id },
              data: { displayName: found.name, email: found.email },
            }),
          );
        }
      } else {
        // Someone may have typed this name into the "Who's reviewing?"
        // picker before the first sync — adopt that row (and its
        // decisions) instead of creating a duplicate.
        const typedIn = found
          ? await prisma.reviewer.findFirst({
              where: {
                submittableUserId: null,
                displayName: { equals: found.name, mode: "insensitive" },
              },
            })
          : null;
        if (typedIn) {
          reviewerByUserId.set(
            userId,
            await prisma.reviewer.update({
              where: { id: typedIn.id },
              data: { submittableUserId: userId, displayName: found!.name, email: found!.email },
            }),
          );
          continue;
        }
        // upsert, not create: a concurrent sync (button + daily Action) may
        // have created this reviewer a moment ago.
        const created = await prisma.reviewer.upsert({
          where: { submittableUserId: userId },
          update: {},
          create: {
            submittableUserId: userId,
            displayName: found?.name ?? placeholderName(userId),
            email: found?.email ?? null,
          },
        });
        reviewerByUserId.set(userId, created);
        summary.reviewersCreated.push(created.displayName);
      }
    }
  }

  // 6. Updates
  const now = new Date();
  for (const { local: l, remote: r } of plan.toUpdate) {
    const current = localById.get(l.id)!;
    const full = remoteById.get(r.submissionId)!;
    const statusChanged = current.officialStatus !== r.submissionStatus;
    const projectChanged = current.projectId !== full.projectId;
    const wantLabels = (r.labels ?? []).filter((id) => localLabelId.has(id));
    const haveLabels = current.labels.map((x) => x.label.submittableLabelId);
    const labelsChanged = !sameSet(wantLabels, haveLabels);
    const wantReviewers = (r.reviewers ?? []).filter((id) => reviewerByUserId.has(id) || dryRun);
    const haveReviewers = current.assignments
      .map((a) => a.reviewer.submittableUserId)
      .filter((x): x is string => !!x);
    const assignmentsChanged = !sameSet(wantReviewers, haveReviewers);

    if (statusChanged) {
      summary.statusChanges.push({
        artist: current.artistName ?? l.submittableId,
        from: current.officialStatus,
        to: r.submissionStatus,
      });
    }
    if (labelsChanged) summary.labelChanges += 1;
    if (assignmentsChanged) summary.assignmentChanges += 1;
    if (!(statusChanged || projectChanged || labelsChanged || assignmentsChanged)) continue;
    summary.updated += 1;
    if (dryRun) continue;

    await prisma.$transaction([
      prisma.submittableSubmission.update({
        where: { id: l.id },
        data: {
          officialStatus: r.submissionStatus,
          projectId: full.projectId,
          projectName: projectNameById.get(full.projectId ?? "") ?? full.projectTitle,
          rawSubmissionJson: JSON.parse(JSON.stringify(full)),
          syncStatus: "synced",
          updatedAt: now,
        },
      }),
      ...(labelsChanged
        ? [
            prisma.submissionLabel.deleteMany({ where: { submissionId: l.id } }),
            prisma.submissionLabel.createMany({
              data: wantLabels.map((id) => ({
                submissionId: l.id,
                labelId: localLabelId.get(id)!,
                source: "submittable",
              })),
            }),
          ]
        : []),
      ...(assignmentsChanged
        ? [
            prisma.submissionAssignment.deleteMany({ where: { submissionId: l.id } }),
            prisma.submissionAssignment.createMany({
              data: wantReviewers.map((id) => ({
                submissionId: l.id,
                reviewerId: reviewerByUserId.get(id)!.id,
              })),
            }),
          ]
        : []),
    ]);
  }

  // 7. Withdrawn → delete entirely (images first; DB only if that worked)
  for (const { local: l } of plan.toDelete) {
    const name = localById.get(l.id)?.artistName ?? l.submittableId;
    if (dryRun) {
      summary.deleted.push(name);
      continue;
    }
    try {
      const [assets, files] = await Promise.all([
        prisma.artAsset.findMany({
          where: { submissionId: l.id },
          select: { storagePathLarge: true, storagePathThumbnail: true },
        }),
        prisma.submissionFile.findMany({
          where: { submissionId: l.id },
          select: { storagePathOriginal: true },
        }),
      ]);
      await deleteFromR2([
        ...assets.flatMap((a) => [
          a.storagePathLarge,
          a.storagePathThumbnail,
          tinyKeyFor(a.storagePathThumbnail) ?? "",
        ]),
        ...files.map((f) => f.storagePathOriginal),
      ]);
      await prisma.$transaction([
        prisma.reviewAction.deleteMany({ where: { submissionId: l.id } }),
        prisma.reviewNote.deleteMany({ where: { submissionId: l.id } }),
        // deleteMany: tolerant of a concurrent sync having deleted it already.
        prisma.submittableSubmission.deleteMany({ where: { id: l.id } }),
      ]);
      summary.deleted.push(name);
      log(`  deleted withdrawn submission: ${name}`);
    } catch (err) {
      summary.deleteErrors.push(`${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 8. Stamp everything still present as synced now
  if (!dryRun) {
    await prisma.submittableSubmission.updateMany({
      where: { id: { in: plan.toUpdate.map((u) => u.local.id) } },
      data: { lastSyncedAt: now },
    });
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

/** The most recent completed sync, for "Last synced …" in the UI. */
export async function lastSyncedAt(): Promise<Date | null> {
  const row = await prisma.submittableSubmission.aggregate({ _max: { lastSyncedAt: true } });
  return row._max.lastSyncedAt;
}

/** Plain-text report of a sync, for the CLI and the GitHub Action log. */
export function formatSyncSummary(s: SyncSummary): string {
  const lines = [
    `${s.dryRun ? "DRY RUN — nothing written. " : ""}Synced ${s.projects.join(", ")}`,
    `Submittable: ${s.remoteCount} submissions · app: ${s.localCount}`,
    `Updated: ${s.updated} (status ${s.statusChanges.length}, labels ${s.labelChanges}, assignments ${s.assignmentChanges})`,
  ];
  for (const c of s.statusChanges) lines.push(`  · ${c.artist}: ${c.from} → ${c.to}`);
  if (s.reviewersCreated.length) lines.push(`New reviewers: ${s.reviewersCreated.join(", ")}`);
  if (s.deleted.length) lines.push(`Deleted (withdrawn): ${s.deleted.join(", ")}`);
  for (const e of s.deleteErrors) lines.push(`  ✗ delete failed — ${e}`);
  if (s.toImport.length) {
    lines.push(`Waiting to import (run process-submission.ts): ${s.toImport.length}`);
    for (const t of s.toImport) lines.push(`  · ${t.artist} — "${t.title ?? ""}" [${t.status}]`);
  }
  if (s.missingRemotely.length) {
    lines.push(`⚠ In the app but not in Submittable's list: ${s.missingRemotely.join(", ")}`);
  }
  return lines.join("\n");
}

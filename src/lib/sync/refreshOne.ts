// Re-reads ONE submission's status and labels from Submittable and saves
// any difference. Runs when a reviewer opens a submission, so a change made
// in Submittable a minute ago shows up without anyone pressing Sync.
// (Assignments aren't in GET /v4/submissions/{id}; the full sync covers
// those, and withdrawn submissions are deleted by the full sync too.)
//
// No `server-only` guard: shared with scripts (see src/lib/db/index.ts).
import { prisma } from "@/lib/db";
import { submittableFetch } from "@/lib/submittable/client";
import type { SubmittableSubmissionDetail } from "@/lib/submittable/writes";
import { sameSet } from "@/lib/sync/plan";

/** A page-open refresh must never hold anything up for long. */
const READ_TIMEOUT_MS = 8_000;

/** Returns true when something changed locally. */
export async function refreshOneSubmission(submissionId: string): Promise<boolean> {
  const local = await prisma.submittableSubmission.findUnique({
    where: { id: submissionId },
    select: {
      submittableId: true,
      officialStatus: true,
      labels: { select: { label: { select: { submittableLabelId: true } } } },
    },
  });
  if (!local) return false;

  const remote = await submittableFetch<SubmittableSubmissionDetail>(
    `/v4/submissions/${encodeURIComponent(local.submittableId)}`,
    { signal: AbortSignal.timeout(READ_TIMEOUT_MS) },
  );

  const known = await prisma.submittableLabel.findMany({
    select: { id: true, submittableLabelId: true },
  });
  const localLabelId = new Map(known.map((l) => [l.submittableLabelId, l.id]));
  // Labels the app hasn't seen yet are left for the full sync to create.
  const want = (remote.labels ?? [])
    .map((l) => l.labelId)
    .filter((id): id is string => !!id && localLabelId.has(id));
  const have = local.labels.map((l) => l.label.submittableLabelId);

  const statusChanged =
    !!remote.submissionStatus && remote.submissionStatus !== local.officialStatus;
  const labelsChanged = !sameSet(want, have);
  if (!statusChanged && !labelsChanged) return false;

  await prisma.$transaction([
    ...(statusChanged
      ? [
          prisma.submittableSubmission.update({
            where: { id: submissionId },
            data: { officialStatus: remote.submissionStatus, updatedAt: new Date() },
          }),
        ]
      : []),
    ...(labelsChanged
      ? [
          prisma.submissionLabel.deleteMany({ where: { submissionId } }),
          prisma.submissionLabel.createMany({
            data: want.map((id) => ({
              submissionId,
              labelId: localLabelId.get(id)!,
              source: "submittable",
            })),
          }),
        ]
      : []),
  ]);
  return true;
}

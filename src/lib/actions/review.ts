"use server";

// Server actions behind the Submission Reviewer: choose who's reviewing,
// toggle a label (pushed to Submittable), post a decision note (pushed to
// Submittable), retry a failed note, and sync. See
// docs/SPEC-review-and-sync.md §7–9. Submission *status* is never written.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { REVIEWER_COOKIE_NAME, getCurrentReviewer } from "@/lib/reviewer/identity";
import { isReviewerLabel } from "@/lib/reviewer/labels";
import {
  NOTE_VISIBILITY,
  REVIEWER_NAME_MAX,
  formatNoteText,
  validateDecisionInput,
  type Decision,
} from "@/lib/reviewer/decisions";
import {
  addNote,
  applyLabel,
  describeSubmittableError,
  removeLabel,
} from "@/lib/submittable/writes";
import { formatSyncSummary, lastSyncedAt, syncSubmittable } from "@/lib/sync/syncSubmittable";

function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/submissions";
}

/** "Who's reviewing?" — pick a known reviewer or type a new name. */
export async function chooseReviewer(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const newName = String(formData.get("newName") ?? "")
    .trim()
    .slice(0, REVIEWER_NAME_MAX);

  let id: string | null = null;
  if (reviewerId && reviewerId !== "new") {
    id = (await prisma.reviewer.findUnique({ where: { id: reviewerId } }))?.id ?? null;
  } else if (newName) {
    const existing = await prisma.reviewer.findFirst({
      where: { displayName: { equals: newName, mode: "insensitive" } },
    });
    id = existing?.id ?? (await prisma.reviewer.create({ data: { displayName: newName } })).id;
  }
  if (!id) redirect(`/reviewer?error=1&next=${encodeURIComponent(next)}`);

  (await cookies()).set(REVIEWER_COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(next);
}

export type ActionResult =
  | { ok: true; message?: string }
  /** saved: the decision was recorded here but its note didn't reach Submittable — retry it, don't re-post. */
  | { ok: false; error: string; saved?: boolean };

/** Applies or removes one allowlisted label, in Submittable first, then locally. */
export async function setSubmissionLabel(
  submissionId: string,
  submittableLabelId: string,
  on: boolean,
): Promise<ActionResult> {
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return { ok: false, error: "Choose who's reviewing first." };
  if (!isReviewerLabel(submittableLabelId))
    return { ok: false, error: "That label can't be set here." };

  const [submission, label] = await Promise.all([
    prisma.submittableSubmission.findUnique({ where: { id: submissionId } }),
    prisma.submittableLabel.findUnique({ where: { submittableLabelId } }),
  ]);
  if (!submission) return { ok: false, error: "Submission not found." };
  if (!label) return { ok: false, error: "Label not synced yet — run Sync first." };

  try {
    if (on) await applyLabel(submission.submittableId, submittableLabelId);
    else await removeLabel(submission.submittableId, submittableLabelId);
  } catch (err) {
    return { ok: false, error: `Label not changed. ${describeSubmittableError(err)}` };
  }

  await prisma.$transaction([
    on
      ? prisma.submissionLabel.upsert({
          where: { submissionId_labelId: { submissionId, labelId: label.id } },
          update: {},
          create: { submissionId, labelId: label.id, source: "submittable" },
        })
      : prisma.submissionLabel.deleteMany({ where: { submissionId, labelId: label.id } }),
    prisma.reviewAction.create({
      data: {
        submissionId,
        actionType: on ? "label_applied" : "label_removed",
        newValue: { label: label.name, submittableLabelId, by: reviewer.displayName },
      },
    }),
  ]);
  revalidatePath(`/submissions/${submissionId}`);
  return { ok: true };
}

async function pushDecision(decisionId: string): Promise<ActionResult> {
  const d = await prisma.reviewDecision.findUniqueOrThrow({
    where: { id: decisionId },
    include: { submission: { select: { submittableId: true } } },
  });
  try {
    await addNote(d.submission.submittableId, d.noteText, NOTE_VISIBILITY);
  } catch (err) {
    const error = describeSubmittableError(err);
    await prisma.reviewDecision.update({
      where: { id: decisionId },
      data: { pushStatus: "failed", pushError: error },
    });
    return {
      ok: false,
      saved: true,
      error: `Saved here, but not posted to Submittable (${error.replace(/\.$/, "")}). Use Retry under Decisions.`,
    };
  }
  await prisma.$transaction([
    prisma.reviewDecision.update({
      where: { id: decisionId },
      data: { pushStatus: "pushed", pushError: null, pushedAt: new Date() },
    }),
    prisma.reviewAction.create({
      data: {
        submissionId: d.submissionId,
        actionType: "decision_posted",
        newValue: { decision: d.decision, reviewer: d.reviewerName, decisionId },
      },
    }),
  ]);
  return { ok: true, message: "Posted to Submittable." };
}

/** Records a decision and posts it to Submittable as a note. */
export async function postDecision(
  submissionId: string,
  input: { decision: string; reviewerName: string; comment: string },
): Promise<ActionResult> {
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return { ok: false, error: "Choose who's reviewing first." };
  const invalid = validateDecisionInput(input);
  if (invalid) {
    const messages = {
      missing_decision: "Pick Accept, Tiered Reject, or Reject.",
      missing_name: "Add the reviewer name for the note.",
      name_too_long: "That name is too long.",
      comment_too_long: "That comment is too long for a Submittable note.",
    } as const;
    return { ok: false, error: messages[invalid] };
  }
  const submission = await prisma.submittableSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) return { ok: false, error: "Submission not found." };

  const decision = input.decision as Decision;
  const comment = input.comment.trim() || null;
  const reviewerName = input.reviewerName.trim();
  const created = await prisma.reviewDecision.create({
    data: {
      submissionId,
      reviewerId: reviewer.id,
      reviewerName,
      decision,
      comment,
      noteText: formatNoteText({ decision, reviewerName, comment, date: new Date() }),
    },
  });
  const result = await pushDecision(created.id);
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath("/submissions");
  return result;
}

/** Re-posts a decision whose note failed to reach Submittable. */
export async function retryDecision(decisionId: string): Promise<ActionResult> {
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return { ok: false, error: "Choose who's reviewing first." };
  const d = await prisma.reviewDecision.findUnique({ where: { id: decisionId } });
  if (!d) return { ok: false, error: "Decision not found." };
  if (d.pushStatus === "pushed") return { ok: true, message: "Already posted." };
  const result = await pushDecision(decisionId);
  revalidatePath(`/submissions/${d.submissionId}`);
  return result;
}

/** The Sync button. Metadata only; at most once a minute. */
export async function syncNow(): Promise<ActionResult> {
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return { ok: false, error: "Choose who's reviewing first." };
  const last = await lastSyncedAt();
  if (last && Date.now() - last.getTime() < 60_000) {
    return { ok: true, message: "Synced less than a minute ago." };
  }
  try {
    const summary = await syncSubmittable();
    revalidatePath("/submissions", "layout");
    revalidatePath("/art-library");
    const parts = [`${summary.updated} updated`];
    if (summary.deleted.length) parts.push(`${summary.deleted.length} withdrawn removed`);
    if (summary.toImport.length) parts.push(`${summary.toImport.length} new waiting to import`);
    console.log(formatSyncSummary(summary));
    return { ok: true, message: `Synced — ${parts.join(", ")}.` };
  } catch (err) {
    return { ok: false, error: `Sync failed. ${describeSubmittableError(err)}` };
  }
}

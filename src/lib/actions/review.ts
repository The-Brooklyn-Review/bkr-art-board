"use server";

// Server actions behind the Submission Reviewer: choose who's reviewing,
// toggle a label (pushed to Submittable), post a decision note (pushed to
// Submittable), retry a note, and sync. See docs/SPEC-review-and-sync.md
// §7–9. Submission *status* is never written.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAuthenticated, requireAuth } from "@/lib/requireAuth";
import { safeNextPath } from "@/lib/safeRedirect";
import { REVIEWER_COOKIE_NAME, getCurrentReviewer } from "@/lib/reviewer/identity";
import { isReviewerLabel } from "@/lib/reviewer/labels";
import {
  NOTE_VISIBILITY,
  REVIEWER_NAME_MAX,
  STALE_PENDING_MS,
  formatNoteText,
  validateDecisionInput,
  type Decision,
} from "@/lib/reviewer/decisions";
import { SubmittableError } from "@/lib/submittable/client";
import {
  addNote,
  applyLabel,
  describeSubmittableError,
  removeLabel,
} from "@/lib/submittable/writes";
import { formatSyncSummary, lastSyncedAt, syncSubmittable } from "@/lib/sync/syncSubmittable";
import { refreshOneSubmission } from "@/lib/sync/refreshOne";
import { AUTO_SYNC_AFTER_MS } from "@/lib/sync/autoSync";

export type ActionResult =
  | { ok: true; message?: string }
  /** saved: the decision is recorded here but its note may not have reached Submittable — retry it, don't re-post. */
  | { ok: false; error: string; saved?: boolean };

const NOT_SIGNED_IN: ActionResult = {
  ok: false,
  error: "Your session has expired — sign in again.",
};
const NO_REVIEWER: ActionResult = { ok: false, error: "Choose who's reviewing first." };

/** "Who's reviewing?" — pick a known reviewer or type a new name. */
export async function chooseReviewer(formData: FormData) {
  await requireAuth();
  const next = safeNextPath(formData.get("next"), "/submissions");
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const newName = String(formData.get("newName") ?? "")
    .trim()
    .slice(0, REVIEWER_NAME_MAX);

  let id: string | null = null;
  if (/^[0-9a-f-]{36}$/i.test(reviewerId)) {
    id = (await prisma.reviewer.findUnique({ where: { id: reviewerId } }))?.id ?? null;
  } else if (reviewerId === "new" && newName) {
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

/** Applies or removes one allowlisted label, in Submittable first, then locally. */
export async function setSubmissionLabel(
  submissionId: string,
  submittableLabelId: string,
  on: boolean,
): Promise<ActionResult> {
  if (!(await isAuthenticated())) return NOT_SIGNED_IN;
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return NO_REVIEWER;
  if (!isReviewerLabel(submittableLabelId)) {
    return { ok: false, error: "That label can't be set here." };
  }

  const [submission, label] = await Promise.all([
    prisma.submittableSubmission.findUnique({ where: { id: submissionId } }),
    prisma.submittableLabel.findUnique({ where: { submittableLabelId } }),
  ]);
  if (!submission) return { ok: false, error: "Submission not found." };
  if (!label) return { ok: false, error: "That label hasn't been loaded from Submittable yet." };

  try {
    if (on) await applyLabel(submission.submittableId, submittableLabelId);
    else await removeLabel(submission.submittableId, submittableLabelId);
  } catch (err) {
    return { ok: false, error: `Label not changed. ${describeSubmittableError(err)}` };
  }

  // Submittable has the change; now record it here. Retry once, then fall
  // back to re-reading the submission from Submittable. If even that fails
  // the next page open or sync reconciles it — nothing for the reviewer to do.
  const saveLocally = () =>
    prisma.$transaction([
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
  try {
    await saveLocally();
  } catch {
    try {
      await saveLocally();
    } catch (err) {
      console.error("label saved in Submittable but not locally", submissionId, err);
      await refreshOneSubmission(submissionId).catch(() => {});
    }
  }
  revalidatePath(`/submissions/${submissionId}`);
  return { ok: true };
}

/**
 * Posts a decision's note. Expects the row to be claimed (`pending`).
 * Outcome:
 *   pushed  — Submittable accepted it.
 *   failed  — Submittable definitely refused it (a 4xx): safe to retry.
 *   unknown — timeout, network error or 5xx: it may have been stored, and
 *             notes can't be listed or deleted through the API, so the
 *             reviewer must check Submittable before re-posting.
 */
async function pushDecision(decisionId: string): Promise<ActionResult> {
  const d = await prisma.reviewDecision.findUniqueOrThrow({
    where: { id: decisionId },
    include: { submission: { select: { submittableId: true } } },
  });
  try {
    await addNote(d.submission.submittableId, d.noteText, NOTE_VISIBILITY);
  } catch (err) {
    const definite = err instanceof SubmittableError && err.status >= 400 && err.status < 500;
    const error = describeSubmittableError(err);
    await prisma.reviewDecision.update({
      where: { id: decisionId },
      data: { pushStatus: definite ? "failed" : "unknown", pushError: error },
    });
    return {
      ok: false,
      saved: true,
      error: definite
        ? `Saved here, but Submittable refused the note (${error.replace(/\.$/, "")}). Use Retry under Decisions.`
        : `Saved here, but couldn't confirm the note reached Submittable (${error.replace(/\.$/, "")}). Check the submission's notes in Submittable before retrying.`,
    };
  }
  try {
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
  } catch {
    return {
      ok: true,
      message: "Posted to Submittable, but not marked as posted here — don't post it again.",
    };
  }
  return { ok: true, message: "Posted to Submittable." };
}

/** Records a decision and posts it to Submittable as a note. */
export async function postDecision(
  submissionId: string,
  input: { decision: string; reviewerName: string; comment: string },
): Promise<ActionResult> {
  if (!(await isAuthenticated())) return NOT_SIGNED_IN;
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return NO_REVIEWER;
  // Notes are always signed with the reviewer chosen at sign-in; the
  // client's name (if any) is ignored.
  input = { ...input, reviewerName: reviewer.displayName };
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

/**
 * Re-posts a decision's note. Claims the row atomically first, so two tabs
 * (or a double click) can't both post it.
 */
export async function retryDecision(decisionId: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return NOT_SIGNED_IN;
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return NO_REVIEWER;
  const claimed = await prisma.reviewDecision.updateMany({
    where: {
      id: decisionId,
      OR: [
        { pushStatus: { in: ["failed", "unknown"] } },
        // A post that never finished (e.g. the function was cut off).
        { pushStatus: "pending", createdAt: { lt: new Date(Date.now() - STALE_PENDING_MS) } },
      ],
    },
    data: { pushStatus: "pending" },
  });
  const d = await prisma.reviewDecision.findUnique({ where: { id: decisionId } });
  if (!d) return { ok: false, error: "Decision not found." };
  if (claimed.count !== 1) {
    return d.pushStatus === "pushed"
      ? { ok: true, message: "Already posted." }
      : { ok: false, error: "This note is already being posted." };
  }
  const result = await pushDecision(decisionId);
  revalidatePath(`/submissions/${d.submissionId}`);
  return result;
}

/**
 * Opening a submission re-reads it from Submittable (status + labels).
 * Returns whether anything changed, so the page knows to refresh.
 * Failure is silent: the page already shows the last-known state.
 */
export async function refreshSubmission(submissionId: string): Promise<{ changed: boolean }> {
  if (!(await isAuthenticated())) return { changed: false };
  try {
    const changed = await refreshOneSubmission(submissionId);
    if (changed) {
      revalidatePath(`/submissions/${submissionId}`);
      revalidatePath("/submissions");
    }
    return { changed };
  } catch (err) {
    console.warn("refreshSubmission failed", submissionId, err);
    return { changed: false };
  }
}

/**
 * Background sync, fired by the page when the last sync is stale. Does
 * nothing if a sync finished recently (another tab, the daily Action, or
 * the menu's Sync now).
 */
export async function autoSync(): Promise<
  { ok: true; ran: boolean; changed: boolean } | { ok: false; error: string }
> {
  if (!(await isAuthenticated())) return { ok: false, error: "Not signed in." };
  const last = await lastSyncedAt();
  if (last && Date.now() - last.getTime() < AUTO_SYNC_AFTER_MS) {
    return { ok: true, ran: false, changed: false };
  }
  try {
    const summary = await syncSubmittable();
    console.log(formatSyncSummary(summary));
    const changed = summary.updated > 0 || summary.deleted.length > 0;
    if (changed) {
      revalidatePath("/submissions", "layout");
      revalidatePath("/art-library");
    }
    return { ok: true, ran: true, changed };
  } catch (err) {
    return { ok: false, error: describeSubmittableError(err) };
  }
}

/** "Sync now" in the reviewer menu. Metadata only; at most once a minute. */
export async function syncNow(): Promise<ActionResult> {
  if (!(await isAuthenticated())) return NOT_SIGNED_IN;
  const reviewer = await getCurrentReviewer();
  if (!reviewer) return NO_REVIEWER;
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

/**
 * First-run bootstrap from the "Who's reviewing?" page: reviewers are
 * created by the sync, but the Sync button sits behind the picker. So when
 * no reviewer has been synced yet, the picker can run the sync itself —
 * app-password authentication is enough here, no reviewer needed.
 */
export async function loadReviewersFromSubmittable(): Promise<ActionResult> {
  if (!(await isAuthenticated())) return NOT_SIGNED_IN;
  const alreadyLoaded = await prisma.reviewer.count({
    where: { submittableUserId: { not: null } },
  });
  if (alreadyLoaded > 0) return { ok: true, message: "Reviewers already loaded." };
  try {
    const summary = await syncSubmittable();
    revalidatePath("/reviewer");
    console.log(formatSyncSummary(summary));
    return { ok: true, message: `Loaded ${summary.reviewersCreated.length} reviewers.` };
  } catch (err) {
    return { ok: false, error: `Couldn't load reviewers. ${describeSubmittableError(err)}` };
  }
}

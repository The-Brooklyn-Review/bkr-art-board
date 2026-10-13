// Server-only writes to Submittable: apply/remove one label on one
// submission, and add a note. These are the ONLY Submittable writes the
// app makes (docs/SPEC-review-and-sync.md §7). Never call
// DELETE /v4/labels/remove/{labelId} (acts org-wide), DELETE/PUT
// /v4/labels/{labelId}, or POST /v4/labels from here.
//
// No `server-only` guard: shared with standalone scripts run via tsx (see
// src/lib/db/index.ts). Never import into a "use client" file.
import { submittableFetch, SubmittableError } from "@/lib/submittable/client";
import type { V4Label } from "@/lib/submittable/types";

export interface SubmittableSubmissionDetail {
  submissionId: string;
  submissionStatus: string | null;
  labels: V4Label[] | null;
}

type Fetch = typeof submittableFetch;

/**
 * Writes give up after 20s. Without a timeout a hung request would run
 * until the serverless function is killed, leaving the outcome unknowable.
 */
const WRITE_TIMEOUT_MS = 20_000;
const timeout = () => AbortSignal.timeout(WRITE_TIMEOUT_MS);

export function getSubmittableSubmission(
  submissionId: string,
  fetchImpl: Fetch = submittableFetch,
): Promise<SubmittableSubmissionDetail> {
  return fetchImpl<SubmittableSubmissionDetail>(
    `/v4/submissions/${encodeURIComponent(submissionId)}`,
  );
}

async function currentLabelIds(submissionId: string, fetchImpl: Fetch): Promise<Set<string>> {
  const s = await getSubmittableSubmission(submissionId, fetchImpl);
  return new Set((s.labels ?? []).map((l) => l.labelId).filter((id): id is string => !!id));
}

/**
 * Applies one label to one submission. If Submittable rejects the call
 * with a 400, re-reads the submission: a label that's already there counts
 * as success (Submittable's response to a duplicate apply isn't
 * documented, so this doesn't depend on it).
 */
export async function applyLabel(
  submissionId: string,
  labelId: string,
  fetchImpl: Fetch = submittableFetch,
): Promise<void> {
  try {
    await fetchImpl(
      `/v4/submissions/${encodeURIComponent(submissionId)}/labels/${encodeURIComponent(labelId)}`,
      { method: "PUT", signal: timeout() },
    );
  } catch (err) {
    if (err instanceof SubmittableError && err.status === 400) {
      if ((await currentLabelIds(submissionId, fetchImpl)).has(labelId)) return;
    }
    throw err;
  }
}

/** Removes one label from one submission. Already-absent counts as success. */
export async function removeLabel(
  submissionId: string,
  labelId: string,
  fetchImpl: Fetch = submittableFetch,
): Promise<void> {
  try {
    await fetchImpl(
      `/v4/submissions/${encodeURIComponent(submissionId)}/labels/${encodeURIComponent(labelId)}`,
      { method: "DELETE", signal: timeout() },
    );
  } catch (err) {
    if (err instanceof SubmittableError && (err.status === 400 || err.status === 404)) {
      if (!(await currentLabelIds(submissionId, fetchImpl)).has(labelId)) return;
    }
    throw err;
  }
}

/** Adds a note to a submission. Notes can't be edited or deleted afterwards. */
export async function addNote(
  submissionId: string,
  note: string,
  noteVisibility: "team" | "admins_only",
  fetchImpl: Fetch = submittableFetch,
): Promise<void> {
  await fetchImpl(`/v4/submissions/${encodeURIComponent(submissionId)}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, noteVisibility }),
    signal: timeout(),
  });
}

export interface TeamMember {
  userId: string;
  email: string | null;
  name: { first: string | null; last: string | null; full: string | null } | null;
}

/** Names for a set of Submittable user IDs (reviewers). */
export async function getTeamMembers(
  userIds: string[],
  fetchImpl: Fetch = submittableFetch,
): Promise<TeamMember[]> {
  if (userIds.length === 0) return [];
  const members = await fetchImpl<TeamMember[] | null>("/v4/organizations/team/list", {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
  return members ?? [];
}

export function teamMemberName(m: TeamMember): string {
  const full = m.name?.full || [m.name?.first, m.name?.last].filter(Boolean).join(" ");
  return full || m.email || m.userId;
}

/** A short, user-facing explanation for a failed Submittable call. */
export function describeSubmittableError(err: unknown): string {
  if (err instanceof SubmittableError) {
    if (err.status === 403) return "Submittable refused (403): the API key lacks permission.";
    if (err.status === 401) return "Submittable rejected the API key (401).";
    if (err.status === 404) return "Submittable couldn't find that submission (404).";
    return `Submittable error ${err.status}.`;
  }
  return err instanceof Error ? err.message : String(err);
}

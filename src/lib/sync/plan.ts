// Pure decision logic for the Submittable sync (docs/SPEC-review-and-sync.md
// §4–5): which remote submissions the app should hold, which local ones to
// update, delete, or flag. No I/O, so it's unit-tested directly.
import { isUndecided, PUBLISHED_STATUSES } from "@/lib/submittable/statuses";

export interface RemoteSubmission {
  submissionId: string | null;
  submissionStatus: string | null;
  labels: string[] | null;
  reviewers?: string[] | null;
}

export interface LocalSubmission {
  id: string;
  submittableId: string;
}

export interface WorkflowLabelIds {
  consider: string | null;
  acceptance: string | null;
}

/**
 * Should the app import this submission's files? (§4)
 *   1. undecided → the reviewer's work
 *   2. completed + Consider → the gallery's default pool
 *   3. accepted/published, or labelled acceptance → the gallery's "published artists" toggle
 * declined and withdrawn never; completed without Consider isn't fetched proactively.
 */
export function shouldImport(remote: RemoteSubmission, ids: WorkflowLabelIds): boolean {
  const status = remote.submissionStatus;
  const labels = remote.labels ?? [];
  if (status === "withdrawn" || status === "declined") return false;
  if (isUndecided(status)) return true;
  if (status === "completed") return !!ids.consider && labels.includes(ids.consider);
  if ((PUBLISHED_STATUSES as readonly string[]).includes(status ?? "")) return true;
  return !!ids.acceptance && labels.includes(ids.acceptance);
}

export interface SyncPlan {
  /** In both — refresh status/labels/assignments. */
  toUpdate: { local: LocalSubmission; remote: RemoteSubmission }[];
  /** Withdrawn in Submittable — delete from the app entirely. */
  toDelete: { local: LocalSubmission; remote: RemoteSubmission }[];
  /** In Submittable, not in the app, and should be — run the importer. */
  toImport: RemoteSubmission[];
  /** In the app but absent from Submittable's list — warn, never delete. */
  missingRemotely: LocalSubmission[];
}

export function planSync(
  remote: RemoteSubmission[],
  local: LocalSubmission[],
  ids: WorkflowLabelIds,
): SyncPlan {
  const localById = new Map(local.map((l) => [l.submittableId, l]));
  const seen = new Set<string>();
  const plan: SyncPlan = { toUpdate: [], toDelete: [], toImport: [], missingRemotely: [] };

  for (const r of remote) {
    if (!r.submissionId) continue;
    seen.add(r.submissionId);
    const l = localById.get(r.submissionId);
    if (l) {
      if (r.submissionStatus === "withdrawn") plan.toDelete.push({ local: l, remote: r });
      else plan.toUpdate.push({ local: l, remote: r });
    } else if (shouldImport(r, ids)) {
      plan.toImport.push(r);
    }
  }
  for (const l of local) {
    if (!seen.has(l.submittableId)) plan.missingRemotely.push(l);
  }
  return plan;
}

/** Order-insensitive set equality, for skipping no-op writes. */
export function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

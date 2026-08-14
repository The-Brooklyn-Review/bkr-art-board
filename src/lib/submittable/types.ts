/**
 * Minimal Submittable v4 response types — only the fields we actually read.
 * Derived from the OpenAPI spec (swagger_07-06-2026.json). Full raw payloads
 * are always persisted separately, so these can stay lean.
 */

export type SubmissionStatus =
  | "new"
  | "in_progress"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "completed"
  | "editable"
  | "viewed"
  | "received"
  | "published";

/** GET /v4/projects → items */
export interface ListProject {
  projectId: string;
  name: string | null;
  initialFormId: string | null;
  isArchived: boolean;
  isLive: boolean;
}

/** GET /v4/labels → items */
export interface Label {
  labelId: string | null;
  name: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  count: number | null;
}

/** GET /v4/submissions → items (list shape; labels are ID strings here) */
export interface SubmissionListItem {
  submissionId: string | null;
  projectId: string | null;
  submitterId: string | null;
  submissionStatus: SubmissionStatus | null;
  labels: string[] | null;
  submitterFirstName: string | null;
  submitterLastName: string | null;
  submitterEmail: string | null;
  submissionTitle: string | null;
  projectTitle: string | null;
  submissionDate: string;
}

/** V4LabelResponse — labels on a single GET /v4/submissions/{id} (full objects) */
export interface V4Label {
  labelId: string | null;
  name: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
}

/**
 * GET /v4/entries/submissions/{submissionId} response shape.
 * Confirmed against real responses (fixtures/entries/*.json) — no `name`,
 * `email`, `phone`, or `website` fieldTypes were present in any sample;
 * artist identity comes from the SubmissionListItem instead.
 */
export interface EntryFile {
  fileId: string;
  fileName: string;
  type: string;
  fileSizeBytes: number;
  getDownloadUrl: string;
  metadata: unknown[];
}

export interface EntryFieldData {
  fieldType: string;
  formFieldId: string;
  value?: string;
  files?: EntryFile[];
}

export interface Entry {
  submissionId: string;
  projectId: string;
  entryId: string;
  formId: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  fieldData: EntryFieldData[];
  entryVersionId: string;
}

export interface FormEntry {
  formType: "initial" | string;
  entry: Entry;
}

export interface EntriesResponse {
  formEntries: FormEntry[];
}

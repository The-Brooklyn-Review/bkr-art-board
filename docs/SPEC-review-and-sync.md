# Spec — Submission Reviewer, Submittable sync, and Fall 2026 import

Status: **implemented on branch `reviewer-and-sync` (2026-10-13); schema applied to the live DB. Pending: first real label/note write-back check.**
Scope: everything needed to (1) import the Fall 2026 open period, (2) keep the app's copy of Submittable current, (3) make the Submission Reviewer a real working tool that writes labels and review notes back to Submittable, and (4) re-scope the Art Gallery to the right subset.

Read alongside `docs/ARCHITECTURE.md`. Two of its stated principles change under this spec and must be updated when this ships (see §11).

---

## 1. Context

- The head editor has moved all Winter 2025 visual-art submissions into the **Fall 2026 Visual Arts Submissions** project and removed the Winter project. One project now holds both the already-curated pool and the new open-period work.
- The app currently imports once and never refreshes. Status, labels, and assignment all change in Submittable during a live review cycle, so the app needs a recurring sync.
- The Reviewer UI (`/submissions/[id]`) is a prototype: reachable only from the gallery, queue = every imported submission alphabetically, one shared recommendation per submission, no reviewer identity, no assignment, nothing pushed to Submittable.

## 2. Vocabulary — what the Submittable signals mean at BKR

| Signal                                                 | Kind   | Meaning at BKR                                           |
| ------------------------------------------------------ | ------ | -------------------------------------------------------- |
| `new`, `in_progress`, `received`, `viewed`, `editable` | status | **Undecided** — still needs review                       |
| `completed`                                            | status | Processed, up for consideration                          |
| `Consider`                                             | label  | Shortlisted for possible publication                     |
| `accepted`                                             | status | Accepted — slated to publish or already published        |
| `acceptance`                                           | label  | Published (applied separately from status)               |
| `declined`                                             | status | Rejected                                                 |
| `withdrawn`                                            | status | Artist pulled the work — remove from the app entirely    |
| `published`                                            | status | Not used at BKR as far as we know; treat like `accepted` |

Any status not listed is treated as **undecided** (fail visible: unknown statuses show up in the reviewer queue rather than disappearing).

App-side terms:

- **Decision** (this spec): a reviewer's Accept / Tiered Reject / Reject, posted as a Submittable note. Not a Submittable status change. "Accept" here ≠ Submittable `accepted`; the naming overlap is accepted by the team.
- **Published (asset)**: `ArtAsset.usedState = "published"`, set in-app per piece.

## 3. Project scope

- Source projects: every Submittable project whose name contains **"Visual Arts"** (case-insensitive), not archived.
- Replaces the single-project auto-discovery currently uncommitted in `scripts/dry-run.ts` (which fails on >1 match). Multiple matches are now normal (future cycles); zero matches is still a loud failure.
- `ART_LIBRARY_PROJECT_NAME` stays as an exact-name override for debugging.

## 4. Import scope

A submission in a source project is imported (files downloaded, pages rendered, classified, cropped, uploaded to R2) if **any** of:

1. status is **undecided** (§2) — the Reviewer's work;
2. status is `completed` **and** has the `Consider` label — the Gallery's default pool;
3. status is `accepted`/`published`, or has the `acceptance` label — the Gallery's "published artists" toggle.

Not imported proactively: `declined`, `withdrawn`, and `completed` without `Consider`. A submission imported earlier (e.g. while undecided) is **kept** when it later becomes `declined` or `completed` — it just leaves the default views.

The 44 existing Winter submissions should match rule 2 and upsert onto their existing rows (keyed on `submittableId`), **provided their Submittable IDs survived the project move**. This is verified in the dry run (§10) before any write.

The initial Fall 2026 import is therefore: all undecided submissions (expected ≈119, all assigned to Thomas Mathew or Jaden Schoenfeld) + any rule-2/rule-3 submissions not already in the DB.

## 5. Sync (status refresh)

A new script, `scripts/sync-submittable.ts`, separate from the heavy importer:

1. Fetch the label catalogue (`GET /v4/labels`) and upsert `SubmittableLabel` (name, colours, `active`, `isConcealed`).
2. For each source project, list all submissions (`GET /v4/submissions?Projects.Include=…`, paginated). One call returns status, label IDs, and `reviewers` for every submission.
3. For each submission already in the DB: update `officialStatus`, project id/name, labels (`SubmissionLabel`, replace set), and assignments (§6.2). Set `lastSyncedAt`.
4. For each submission **not** in the DB that matches §4 rules: enqueue for the importer (set a pending row, or pass ids straight to `process-submission.ts`).
5. For each submission now `withdrawn`: **hard delete** — R2 objects (large, thumbnail, originals), `ArtAsset`, `SubmissionFile`, labels, assignments, decisions, notes, audit rows, share links, then the submission row. Log what was deleted (artist name + submittableId only).
6. Submissions present in the DB but absent from Submittable's list: log a warning, do not delete (could be a permissions or pagination glitch).

Triggers:

- Scheduled GitHub Action once every 24 hours (`.github/workflows/sync-submittable.yml`) (new workflow alongside `tag-artwork.yml`). This also keeps the Supabase free tier awake, so `supabase-keepalive.yml` becomes redundant and can be removed once the sync workflow is proven.
- "Sync with Submittable" button in the app (server action, rate-limited to once per minute).
- After any in-app write to Submittable, re-fetch that one submission (`GET /v4/submissions/{id}`) to confirm the change landed.

### 5.1 Where sync and import run

Import is bursty, sync is routine. The Fall 2026 window is closed, so the bulk of the work arrives in **one import now**; the window may reopen up to twice more this school year (about a month total). Outside those windows only status, labels, and assignments change.

- **Import** (`process-submission.ts`): run **manually on Thomas's Mac**, as today — once now, and once per reopened window. No CI import; PDF rendering has only ever been verified locally and doesn't need to move.
- **Sync** (`sync-submittable.ts`): daily GitHub Action, plus automatic in-app syncing on Vercel — opening any page runs a background sync when the last one is over 10 minutes old (`autoSync`), and opening a submission re-reads that one submission's status and labels (`refreshSubmission`; Submittable has no webhooks to push changes). "Sync with Submittable now" in the reviewer menu is the manual escape hatch. Metadata only. Newly discovered submissions that need importing are flagged "N new submissions waiting to import" in the UI — a reminder to run the importer, which only happens during an open window.

Environment values (all already exist in `.env.local`; they just haven't been needed outside Thomas's machine until now):

- **Vercel**: `SUBMITTABLE_API_KEY`, `SUBMITTABLE_API_BASE_URL`, `SUBMITTABLE_WEB_BASE_URL` — the deployed app has never called Submittable; label/note writes and the Sync button do.
- **GitHub Actions**: `SUBMITTABLE_API_KEY` (+ base URL) for the daily sync; the four `CLOUDFLARE_R2_*` values for deleting withdrawn submissions' images.
- **Existing bug, fixed by the same step**: `tag-artwork.yml` passes only `DATABASE_URL` and `ANTHROPIC_API_KEY`, but `tag-all-artwork.ts` signs R2 URLs to fetch images. It will fail on the first scheduled run that has untagged artwork (i.e. Jan 1, after the Fall import). Add the R2 secrets to that workflow too.

Failure handling: a failed sync leaves the previous state intact; the app shows "Last synced <time>" in both UIs so staleness is visible. The existing "no failure notification" gap in OPERATIONS.md applies here too.

The importer's header claim that source-tier fields are "never updated after import" becomes false for `officialStatus`, labels, project, and assignments. Artist name, title, cover letter, statement stay write-once.

## 6. Data model changes

> **Prerequisites:** take a `pg_dump` of the Supabase DB first (the free tier has no point-in-time restore). Schema changes go through `prisma db push`, as before — and every new table then needs RLS enabled and a line added to `sql/001_lock_down_data_api.sql`, per `docs/OPERATIONS.md#database-access-model`. (Optional, later: baseline `prisma migrate` from the live DB so schema changes are reviewable migrations.)

### 6.1 Labels

- `SubmittableLabel`: add `active Boolean`, `isConcealed Boolean`.
- Reviewer label allowlist (by **label ID**, resolved once from names, case-insensitive — Submittable casing is inconsistent: `landscape`, `A Grade`, `B GRADE`):
  Landscape, Photography, Figurative, Painting/Drawing, Multimedia, Abstract, Collage, A Grade, B Grade.
  Stored as config (a small table or a constant of IDs), displayed with BKR's capitalisation and Submittable's colours. `Consider` and `acceptance` are **not** in the picker — editors set those in Submittable.
- Update `src/lib/art-library/labels.ts` `KNOWN_LABELS` to include the two grades.

### 6.2 Reviewers and assignment

- `Reviewer`: `id`, `submittableUserId` (unique, nullable), `displayName`.
- `SubmissionAssignment`: `submissionId`, `reviewerId`, `source` (`"submittable"`), composite PK. Replaced wholesale on each sync from the submission's `reviewers` array.
- Names: `POST /v4/organizations/team/list` with the `userIds` from `reviewers` returns `userId`, `name`, `email`, `permissionLevel`, `roles` (or `GET /v4/organizations/team` for everyone). Fetched during sync; `displayName` stays editable in-app as an override.

### 6.3 Decisions

- `ReviewDecision`: `id`, `submissionId`, `reviewerId` (nullable), `reviewerName` (as written on the note), `decision` (`accept` | `tiered_reject` | `reject`), `comment` (nullable), `noteText` (exact text sent), `pushStatus` (`pending` | `pushed` | `failed`), `pushError`, `pushedAt`, `createdAt`. Append-only.
- "Current decision" for a reviewer = their latest row. Earlier rows stay as history (Submittable notes can't be edited or deleted via API).
- `SubmittableSubmission.localReviewRecommendation` and `ReviewNote` are retired from the reviewer UI. Existing rows are kept, read-only, shown as "legacy notes" on the submission.
- Every push writes a `ReviewAction` row (`decision_posted`, `label_applied`, `label_removed`) with the acting reviewer name.

## 7. Writing to Submittable

Endpoints (v4, confirmed against the OpenAPI spec saved at `docs/reference/submittable-v4-openapi_2026-07-06.json`):

| Action                 | Call                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| Apply label            | `PUT /v4/submissions/{submissionId}/labels/{labelId}`                          |
| Remove label           | `DELETE /v4/submissions/{submissionId}/labels/{labelId}`                       |
| Add note               | `POST /v4/submissions/{submissionId}/notes` — body `{ note, noteVisibility }`  |
| Check key permissions  | `GET /v4/users/permissions` — list of permission strings for the key's account |
| Team member names      | `POST /v4/organizations/team/list`                                             |
| Re-read one submission | `GET /v4/submissions/{submissionId}`                                           |

**Never call**: `DELETE /v4/labels/remove/{labelId}` (no submission parameter — acts on the label org-wide), `DELETE /v4/labels/{labelId}` (deletes the label definition), `PUT /v4/labels/{labelId}`, `POST /v4/labels`. The API also exposes assignment and review-stage writes (`PUT /v4/submissions/{id}/assignments`, `/stage/{stageId}`); out of scope.

**Never written:** submission status. Accept/decline stays in Submittable with the editors; sync brings it back.

### 7.1 Labels

- Toggle in the reviewer UI → immediate API call → optimistic UI, reverted with an error message on failure.
- Applying a label already present, or removing one already absent, is treated as success.

### 7.2 Review notes

- Form: **decision** (required: Accept / Tiered Reject / Reject), **comment** (optional; up to ~7,800 chars to stay under Submittable's 8,000 limit with the header). The note is always signed with the reviewer chosen at sign-in (set server-side; not editable per note).
- Note text:

  ```
  TIERED REJECT · Thomas Mathew · Oct 12, 2026
  Strong palette, but the series repeats after the third piece.
  ```

  Decision in caps first so it's scannable in Submittable's activity feed; reviewer name in the text because API notes will (inferred) appear authored by the API key's owner.

- `noteVisibility: "team"` — believed to be Submittable's "Assigned Team" option. Verify on the first real note; switch to `admins_only` if wrong.
- Submit shows a preview of the exact note and the line "Posts to Submittable — can't be edited afterwards."
- Write order: insert `ReviewDecision` (`pending`) → POST note → mark `pushed` / `failed`. Failed pushes show a Retry button; they never silently vanish.

### 7.3 Permissions

- The API key's account will be the visible author of every note and label change. Thomas's account is acceptable. **Confirm which account owns the key** — the API has no "who am I" call, so either check where the key was generated in Submittable, or post one test note and read its author.
- Preflight with `GET /v4/users/permissions`, then one `PUT` + `DELETE` of a label on a test submission and one note.
- `SUBMITTABLE_API_KEY` stays server-only; all writes go through server actions.

## 8. Reviewer identity

- Keep the single shared `APP_PASSWORD`. After login, a one-time "Who's reviewing?" picker (known reviewers + "Other: type a name") sets an `httpOnly` cookie with `reviewerId` / name.
- Name shown in the header with a "switch" link. Honour-system; adequate for a small internal team.

## 9. UI

### 9.1 Reviewer — list page `/submissions` (new)

- Default filter: **undecided** statuses, assignment = **Mine**.
- Filters: assignment (Mine / Unassigned / Everyone / a specific reviewer), status group (Undecided / Completed / Accepted / Declined / All), has-my-decision (yes/no), search (artist, title).
- Row: thumbnail, artist, title, assigned reviewer name(s), Submittable status, art labels, decision chips per reviewer (e.g. "TM · Accept", "JS · —").
- Header (shared with the Gallery, `AppHeader`): nav, "Synced …" status text (syncs in the background when stale), reviewer menu (Switch reviewer · Keyboard shortcuts · Sync now). Title, then filters: status tabs with counts, Assigned / My decision / Labels menus, search.

### 9.2 Reviewer — detail page `/submissions/[id]`

- Remove the "Prototype" banner.
- Left queue: the list page's current filtered set (not every submission), with next/previous preserved.
- Centre: existing zoomable viewer + thumbnail strip (keep).
- Right panel, in order:
  1. Artist, title, Submittable status, assigned reviewers, "Open in Submittable".
  2. Labels: the 9 allowlisted labels as toggles (§7.1).
  3. Decisions: every reviewer's latest decision + history; then the decision form (§7.2).
  4. Cover letter / statement (collapsed).
  5. Legacy notes (if any).
  6. Page actions live on the artwork's ⋯ menu: hide/show the page in the Gallery, use as cover image. Hidden pages carry an eye-slash in the page strip. (The page-type picker was dropped from the reviewer.)
- Remove: the four-button local recommendation, the free-floating notes box, "Needs Submittable update" / "Done in Submittable" (superseded by sync).
- Keyboard: `j`/`k` next/previous submission, `←`/`→` page, `1`/`2`/`3` select Accept / Tiered Reject / Reject (focus the comment), `⌘↵` submit, `l` focus labels.

### 9.3 Gallery `/art-library`

- Default query: `officialStatus = "completed"` **and** has label `Consider` **and not** label `acceptance`; asset `visibleInArtLibrary`; asset `usedState` not in (`published`, `do_not_use`).
- Toggle "Include published artists": additionally shows submissions with status `accepted`/`published` or label `acceptance`, badged "Published artist". Remembered per browser.
- Withdrawn submissions never appear (they're deleted).
- Label filter chips gain A Grade and B Grade.

## 10. Rollout order

1. **Read-only checks** — update `dry-run.ts` per §3/§4 (multi-project, optional status filter, no `Consider` requirement for undecided), run it, and confirm:
   - undecided count ≈ 119;
   - the 44 existing Winter `submittableId`s are present in Fall 2026 with `completed` + `Consider`;
   - the `reviewers` arrays contain Thomas's and Jaden's IDs.
     Stop and reassess if the 44 IDs don't match.
2. **API permission check** (§7.3) on a test submission.
3. **DB backup + migration baseline** (§6 prerequisite), then schema changes.
4. **Sync script** (§5), run once manually, verify counts.
5. **Import** (locally) undecided + any missing gallery submissions via `process-submission.ts`. Re-check R2 (10 GB free) and Supabase (500 MB free) usage afterwards.
6. **Gallery query change** (§9.3) — verify the 44 still show.
7. **Reviewer identity + list page + detail page + write-back.** First real note: confirm it reads correctly and shows as "Assigned Team" in Submittable.
8. **Daily sync workflow** + Sync button; add Submittable/R2 values to Vercel and GitHub Actions (§5.1), including the R2 fix for `tag-artwork.yml`.
9. **Tagging**: run `tag-all-artwork.ts` for the new visible assets (~$0.02–0.04 each) or let the Jan 1 run pick them up.
10. **Docs**: update ARCHITECTURE, OPERATIONS (new script, workflow, env vars incl. `ART_LIBRARY_PROJECT_NAME_PATTERN`), `.env.local.example`.

## 11. Principle changes to record in ARCHITECTURE.md

- "Nothing writes back to Submittable" → the app writes **labels and notes only**; never status, never label definitions.
- "Source-imported tier is write-once" → status, labels, project, and assignments are refreshed by sync; withdrawn submissions are hard-deleted.

## 12. Open items

- **Whose API key** — confirm it's Thomas's account (§7.3). Head editor has OK'd label/note write-back.
- **Jaden's access** — deployed URL + `APP_PASSWORD`; add to the reviewer picker.

- **`team` visibility = "Assigned Team"** — confirm on first note.
- **Mobile review** — current layout hides the queue and controls below laptop/tablet width. In scope only if reviewers review on phones.
- **`published` status** — confirm unused at BKR.
- **Submittable docs bug** — the v4 docs page requests `swagger_<local date>.json` but the file is published under the UTC date; fetch `/docs/v4/swagger_<UTC date>.json` directly to get the spec. A copy (July 2026 version) is saved at `docs/reference/`.

## 13. Out of scope

Changing Submittable statuses; creating, renaming, or recolouring labels; editing or deleting posted notes; per-user passwords; R2 orphan sweeping; failure alerting for scheduled jobs.

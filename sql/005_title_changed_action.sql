-- Allow 'title_changed' in review_actions: editing a submission's title
-- in the reviewer (setSubmissionTitle in src/lib/actions/mutations.ts).
-- The importer also checks for this row to keep an edited title on
-- re-import. Same list as 004 plus the new type.
--
-- Idempotent.
alter table public.review_actions
  drop constraint if exists review_actions_action_type_check;

alter table public.review_actions
  add constraint review_actions_action_type_check check (
    action_type = any (array[
      'visibility_changed',
      'thumbnail_changed',
      'page_type_changed',
      'recommendation_changed',
      'note_added',
      'submittable_update_marked_done',
      'asset_published',
      'label_applied',
      'label_removed',
      'decision_posted',
      'decision_confirmed',
      'title_changed'
    ])
  );

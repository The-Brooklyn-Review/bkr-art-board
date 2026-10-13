-- Allow the reviewer's audit-trail action types in review_actions.
--
-- The live database has a CHECK constraint on review_actions.action_type
-- (created with the original schema, outside Prisma) that predates the
-- Submission Reviewer, so inserts of label_applied / label_removed /
-- decision_posted / decision_confirmed were rejected. The app no longer
-- lets an audit-row failure block the real update, but without this the
-- audit trail for those actions is silently skipped.
--
-- Run once in the Supabase SQL editor (idempotent).
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
      'decision_confirmed'
    ])
  );

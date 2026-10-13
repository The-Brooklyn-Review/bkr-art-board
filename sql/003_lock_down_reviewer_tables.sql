-- Apply right after `prisma db push` creates the reviewer tables
-- (docs/SPEC-review-and-sync.md §6). Same deny-everything model as
-- 001_lock_down_data_api.sql: RLS on, zero policies. The default-privilege
-- revokes in 001 already keep anon/authenticated from getting grants on
-- these new tables; the revokes below are belt-and-braces.

revoke all on public.reviewers, public.submission_assignments, public.review_decisions
  from anon, authenticated;

alter table public.reviewers              enable row level security;
alter table public.submission_assignments enable row level security;
alter table public.review_decisions       enable row level security;

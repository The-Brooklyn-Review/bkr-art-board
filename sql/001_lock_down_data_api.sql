-- Applied 2026-08-18, after a Supabase advisor flagged
-- public.submittable_submissions as Data API-reachable with RLS off. It was
-- broader than that: Supabase's default privileges had granted ALL on every
-- table in `public` to `anon`/`authenticated`, so the project's publishable
-- anon key could read all 46 submissions (artist_email included) and could
-- UPDATE or DELETE them.
--
-- Nothing here uses PostgREST, supabase-js, or Supabase Auth — the app is
-- Prisma on a direct connection as `postgres` (src/lib/db/index.ts). With no
-- auth.uid() and no per-user ownership column, the advisor's suggested
-- `auth.uid() = user_id` policy shape doesn't apply; the Data API should
-- simply be unreachable. Enforced twice: no grants, and RLS with no policies.
-- `postgres` has BYPASSRLS, so Prisma is unaffected.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Without this, any table a later `prisma db push` creates lands wide open
-- again — Supabase's defaults grant ALL on future tables.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Zero policies is deliberate: no policy means no row passes. Per-table, so
-- new tables need adding here by hand.
alter table public.submittable_submissions enable row level security;
alter table public.submittable_labels      enable row level security;
alter table public.submission_labels       enable row level security;
alter table public.submission_files        enable row level security;
alter table public.art_assets              enable row level security;
alter table public.shared_artwork_links    enable row level security;
alter table public.review_notes            enable row level security;
alter table public.review_actions          enable row level security;

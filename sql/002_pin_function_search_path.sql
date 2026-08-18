-- Applied 2026-08-18. Clears the advisor's `function_search_path_mutable`
-- warning on set_updated_at (the BEFORE UPDATE trigger function behind every
-- trg_*_updated_at). Its body only calls now() and assigns to NEW, and
-- pg_catalog stays implicitly in scope, so an empty search_path is safe.
-- Hardening only — the function is SECURITY INVOKER, not DEFINER.

alter function public.set_updated_at() set search_path = '';

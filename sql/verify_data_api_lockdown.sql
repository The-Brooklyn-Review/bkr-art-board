-- Checks 001_lock_down_data_api.sql still holds. Run after adding a model.
-- Every row must read "locked down".

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
  coalesce(
    (select string_agg(distinct g.grantee, ', ' order by g.grantee)
       from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = c.relname
        and g.grantee in ('anon', 'authenticated')),
    'none'
  ) as data_api_grants,
  case
    when c.relrowsecurity and not exists (
      select 1 from information_schema.role_table_grants g
       where g.table_schema = 'public' and g.table_name = c.relname
         and g.grantee in ('anon', 'authenticated')
    ) then 'locked down'
    else 'EXPOSED - see sql/001_lock_down_data_api.sql'
  end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

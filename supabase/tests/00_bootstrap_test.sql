-- Phase 0 pgTAP test: the database builds from migrations and the API schema is safe.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select has_schema('public', 'public schema exists');

-- Every table in the API-exposed schema must have row level security enabled (baseline row 14).
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);

select ok(
  (select count(*) from supabase_migrations.schema_migrations where version = '20261125104017') = 1,
  'migration 1 (init) is recorded as applied'
);

select * from finish();
rollback;

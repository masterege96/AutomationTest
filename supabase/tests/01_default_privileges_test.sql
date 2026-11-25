-- Task 1: default privileges for future objects in public (specs/1/schema.md, test list 1-5).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Objects created by postgres inside this transaction pick up the default privileges.
set local role postgres;
create table public.t1_probe (id bigint primary key);
create sequence public.t1_probe_seq;
create function public.t1_probe_fn() returns int language sql as $$ select 1 $$;

-- 1, 2: API roles get nothing on new tables.
select ok(not has_table_privilege('anon', 'public.t1_probe', 'SELECT, INSERT, UPDATE, DELETE'),
  'anon: no SELECT/INSERT/UPDATE/DELETE on a new table');
select ok(not has_table_privilege('anon', 'public.t1_probe', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'anon: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on a new table');
select ok(not has_table_privilege('authenticated', 'public.t1_probe', 'SELECT, INSERT, UPDATE, DELETE'),
  'authenticated: no SELECT/INSERT/UPDATE/DELETE on a new table');
select ok(not has_table_privilege('authenticated', 'public.t1_probe', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'authenticated: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on a new table');

-- 3: service_role keeps production's four, and nothing else.
select ok(has_table_privilege('service_role', 'public.t1_probe', 'TRUNCATE')
      and has_table_privilege('service_role', 'public.t1_probe', 'REFERENCES')
      and has_table_privilege('service_role', 'public.t1_probe', 'TRIGGER')
      and has_table_privilege('service_role', 'public.t1_probe', 'MAINTAIN'),
  'service_role: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on a new table');
select ok(not has_table_privilege('service_role', 'public.t1_probe', 'SELECT, INSERT, UPDATE, DELETE'),
  'service_role: no SELECT/INSERT/UPDATE/DELETE by default on a new table');

-- 4: nobody gets anything on new sequences.
select ok(not has_sequence_privilege('anon', 'public.t1_probe_seq', 'USAGE, SELECT, UPDATE'),
  'anon: nothing on a new sequence');
select ok(not has_sequence_privilege('authenticated', 'public.t1_probe_seq', 'USAGE, SELECT, UPDATE'),
  'authenticated: nothing on a new sequence');
select ok(not has_sequence_privilege('service_role', 'public.t1_probe_seq', 'USAGE, SELECT, UPDATE'),
  'service_role: nothing on a new sequence');

-- 5: the default ACL rows exist for postgres in public.
select ok(exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                  where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r'),
  'default ACL for tables (postgres, public) exists');
select ok(exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                  where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'S'),
  'default ACL for sequences (postgres, public) exists');
select ok(exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                  where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'),
  'default ACL for functions (postgres, public) exists');

select * from finish();
rollback;

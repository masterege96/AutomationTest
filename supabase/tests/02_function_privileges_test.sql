-- Task 2a: EXECUTE defaults for functions created by postgres (specs/2a/schema.md section 8: T1-T4, T6, idempotence).
-- T5 is 01_default_privileges_test.sql passing unchanged. pgTAP runs as postgres; role switches happen only
-- inside the SQL strings passed to throws_ok/lives_ok.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Probes, created by postgres inside this transaction, with no grant.
set local role postgres;
create function public.t2_probe() returns int language sql as $$ select 1 $$;
create function public.t2_probe_definer() returns int language sql security definer set search_path = ''
  as $$ select 1 $$;
create schema t2_other;
create function t2_other.t2_probe() returns int language sql as $$ select 1 $$;
create procedure public.t2_probe_proc() language sql as $$ select 1 $$;

-- T1 (AC1): the global default row for postgres functions gives EXECUTE to nobody but the owner.
select ok(exists (select 1 from pg_default_acl
                  where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'),
  'T1: global default ACL row for functions (postgres) exists');
select ok(not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                      where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
                        and a.privilege_type = 'EXECUTE'
                        and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)),
  'T1: global default gives no EXECUTE to PUBLIC, anon or authenticated');
select is((select defaclacl::text from pg_default_acl
           where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'),
  '{postgres=X/postgres}',
  'T1: global default ACL is exactly {postgres=X/postgres}');

-- T2 (AC2): no API role can execute any probe; the owner can.
select ok(not has_function_privilege('anon', 'public.t2_probe()', 'EXECUTE'), 'T2: anon cannot execute public.t2_probe()');
select ok(not has_function_privilege('authenticated', 'public.t2_probe()', 'EXECUTE'), 'T2: authenticated cannot execute public.t2_probe()');
select ok(not has_function_privilege('service_role', 'public.t2_probe()', 'EXECUTE'), 'T2: service_role cannot execute public.t2_probe()');
select ok(has_function_privilege('postgres', 'public.t2_probe()', 'EXECUTE'), 'T2: postgres can execute public.t2_probe()');

select ok(not has_function_privilege('anon', 'public.t2_probe_definer()', 'EXECUTE'), 'T2: anon cannot execute public.t2_probe_definer()');
select ok(not has_function_privilege('authenticated', 'public.t2_probe_definer()', 'EXECUTE'), 'T2: authenticated cannot execute public.t2_probe_definer()');
select ok(not has_function_privilege('service_role', 'public.t2_probe_definer()', 'EXECUTE'), 'T2: service_role cannot execute public.t2_probe_definer()');
select ok(has_function_privilege('postgres', 'public.t2_probe_definer()', 'EXECUTE'), 'T2: postgres can execute public.t2_probe_definer()');

select ok(not has_function_privilege('anon', 't2_other.t2_probe()', 'EXECUTE'), 'T2: anon cannot execute t2_other.t2_probe()');
select ok(not has_function_privilege('authenticated', 't2_other.t2_probe()', 'EXECUTE'), 'T2: authenticated cannot execute t2_other.t2_probe()');
select ok(not has_function_privilege('service_role', 't2_other.t2_probe()', 'EXECUTE'), 'T2: service_role cannot execute t2_other.t2_probe()');
select ok(has_function_privilege('postgres', 't2_other.t2_probe()', 'EXECUTE'), 'T2: postgres can execute t2_other.t2_probe()');

select ok(not has_function_privilege('anon', 'public.t2_probe_proc()', 'EXECUTE'), 'T2: anon cannot execute procedure public.t2_probe_proc()');
select ok(not has_function_privilege('authenticated', 'public.t2_probe_proc()', 'EXECUTE'), 'T2: authenticated cannot execute procedure public.t2_probe_proc()');
select ok(not has_function_privilege('service_role', 'public.t2_probe_proc()', 'EXECUTE'), 'T2: service_role cannot execute procedure public.t2_probe_proc()');
select ok(has_function_privilege('postgres', 'public.t2_probe_proc()', 'EXECUTE'), 'T2: postgres can execute procedure public.t2_probe_proc()');

-- T3 (AC2, behavioral): calls as anon and authenticated fail with 42501. The trailing reset role only runs if
-- a call wrongly succeeds (e.g. in the negative control), so the rest of the file still runs as postgres.
select throws_ok($q$ set local role anon; select public.t2_probe(); reset role $q$,
  '42501', 'permission denied for function t2_probe', 'T3: anon calling public.t2_probe() is denied');
select throws_ok($q$ set local role anon; select public.t2_probe_definer(); reset role $q$,
  '42501', 'permission denied for function t2_probe_definer', 'T3: anon calling public.t2_probe_definer() is denied');
select throws_ok($q$ set local role authenticated; select public.t2_probe(); reset role $q$,
  '42501', 'permission denied for function t2_probe', 'T3: authenticated calling public.t2_probe() is denied');
select throws_ok($q$ set local role authenticated; select public.t2_probe_definer(); reset role $q$,
  '42501', 'permission denied for function t2_probe_definer', 'T3: authenticated calling public.t2_probe_definer() is denied');
select is(current_user::text, 'postgres', 'T3: still running as postgres');

-- T6 (security's Q1 decision): no per-schema postgres function default outside storage grants EXECUTE
-- to PUBLIC or an API role (guards against a later IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS).
select ok(not exists (select 1 from pg_default_acl d
                        join pg_namespace n on n.oid = d.defaclnamespace,
                        aclexplode(d.defaclacl) a
                      where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
                        and d.defaclnamespace <> 0 and n.nspname <> 'storage'
                        and a.privilege_type = 'EXECUTE'
                        and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)),
  'T6: no per-schema postgres function default (except storage) grants EXECUTE to PUBLIC or API roles');

-- Idempotence (AC5): running the migration's statements again changes no postgres default ACL row.
create temp table t2_acl_before on commit drop as
  select defaclnamespace, defaclobjtype, defaclacl::text as acl
  from pg_default_acl where defaclrole = 'postgres'::regrole;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "authenticated";
select is((select count(*) from pg_default_acl where defaclrole = 'postgres'::regrole),
          (select count(*) from t2_acl_before),
  'Idempotence: same number of postgres default ACL rows after a second run');
select ok(not exists (
            (select defaclnamespace, defaclobjtype, defaclacl::text from pg_default_acl
             where defaclrole = 'postgres'::regrole
             except select * from t2_acl_before)
            union all
            (select * from t2_acl_before
             except select defaclnamespace, defaclobjtype, defaclacl::text from pg_default_acl
             where defaclrole = 'postgres'::regrole)),
  'Idempotence: postgres default ACL rows unchanged after a second run');

-- T4 (AC3): an explicit grant still works, and only for the role it names.
grant execute on function public.t2_probe() to authenticated;
select lives_ok($q$ set local role authenticated; select public.t2_probe(); reset role $q$,
  'T4: authenticated can call public.t2_probe() after an explicit grant');
select ok(not has_function_privilege('anon', 'public.t2_probe()', 'EXECUTE'),
  'T4: anon still cannot execute public.t2_probe()');
select is(current_user::text, 'postgres', 'T4: still running as postgres');

select * from finish();
rollback;

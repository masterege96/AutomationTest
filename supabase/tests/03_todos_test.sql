-- Task 3: public.todos (specs/3/schema.md section 7: S1-S5, G1-G5, R1-R5, M1-M5, N1, C1-C3, K1).
-- pgTAP runs as postgres; assertions always run as postgres. Role switches happen only inside throws_ok
-- strings (each ending with "; reset role", lesson L20) or in short blocks that write to the temp table
-- t3_out and end with "reset role". The 00_bootstrap_test.sql RLS check covers this table too (S3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(163);

set local role postgres;

-- ===================== Structure =====================

-- S1: table, column types, not null, defaults.
select has_table('public', 'todos', 'S1: public.todos exists');
select columns_are('public', 'todos', array['id', 'user_id', 'title', 'done', 'created_at', 'updated_at'],
  'S1: public.todos has exactly the six columns');
select col_type_is('public', 'todos', 'id', 'uuid', 'S1: id is uuid');
select col_type_is('public', 'todos', 'user_id', 'uuid', 'S1: user_id is uuid');
select col_type_is('public', 'todos', 'title', 'text', 'S1: title is text');
select col_type_is('public', 'todos', 'done', 'boolean', 'S1: done is boolean');
select col_type_is('public', 'todos', 'created_at', 'timestamp with time zone', 'S1: created_at is timestamptz');
select col_type_is('public', 'todos', 'updated_at', 'timestamp with time zone', 'S1: updated_at is timestamptz');
select col_not_null('public', 'todos', 'id', 'S1: id is not null');
select col_not_null('public', 'todos', 'user_id', 'S1: user_id is not null');
select col_not_null('public', 'todos', 'title', 'S1: title is not null');
select col_not_null('public', 'todos', 'done', 'S1: done is not null');
select col_not_null('public', 'todos', 'created_at', 'S1: created_at is not null');
select col_not_null('public', 'todos', 'updated_at', 'S1: updated_at is not null');
select col_default_is('public', 'todos', 'id', 'gen_random_uuid()', 'S1: id defaults to gen_random_uuid()');
select col_default_is('public', 'todos', 'user_id', 'auth.uid()', 'S1: user_id defaults to auth.uid()');
select col_hasnt_default('public', 'todos', 'title', 'S1: title has no default');
select col_default_is('public', 'todos', 'done', 'false', 'S1: done defaults to false');
select col_default_is('public', 'todos', 'created_at', 'now()', 'S1: created_at defaults to now()');
select col_default_is('public', 'todos', 'updated_at', 'now()', 'S1: updated_at defaults to now()');

-- S2: primary key, foreign key with on delete cascade.
select col_is_pk('public', 'todos', 'id', 'S2: id is the primary key');
select fk_ok('public', 'todos', 'user_id', 'auth', 'users', 'id', 'S2: user_id references auth.users (id)');
select is((select confdeltype::text from pg_constraint
           where conrelid = 'public.todos'::regclass and contype = 'f'),
  'c', 'S2: the foreign key deletes on cascade');

-- S3: RLS enabled, not forced.
select ok((select relrowsecurity from pg_class where oid = 'public.todos'::regclass), 'S3: RLS is enabled');
select ok((select not relforcerowsecurity from pg_class where oid = 'public.todos'::regclass),
  'S3: RLS is not forced (owner postgres bypasses RLS anyway, schema.md section 3)');

-- S4: exactly four policies, commands, roles and expressions.
select policies_are('public', 'todos',
  array['todos_select_own', 'todos_insert_own', 'todos_update_own', 'todos_delete_own'],
  'S4: public.todos has exactly the four owner policies');
select policy_cmd_is('public', 'todos', 'todos_select_own', 'select', 'S4: todos_select_own is for select');
select policy_cmd_is('public', 'todos', 'todos_insert_own', 'insert', 'S4: todos_insert_own is for insert');
select policy_cmd_is('public', 'todos', 'todos_update_own', 'update', 'S4: todos_update_own is for update');
select policy_cmd_is('public', 'todos', 'todos_delete_own', 'delete', 'S4: todos_delete_own is for delete');
select policy_roles_are('public', 'todos', 'todos_select_own', array['authenticated'], 'S4: todos_select_own is for authenticated only');
select policy_roles_are('public', 'todos', 'todos_insert_own', array['authenticated'], 'S4: todos_insert_own is for authenticated only');
select policy_roles_are('public', 'todos', 'todos_update_own', array['authenticated'], 'S4: todos_update_own is for authenticated only');
select policy_roles_are('public', 'todos', 'todos_delete_own', array['authenticated'], 'S4: todos_delete_own is for authenticated only');
select is((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_select_own'),
  '(( SELECT auth.uid() AS uid) = user_id)', 'S4: todos_select_own using is the owner check');
select is((select pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_select_own'),
  null, 'S4: todos_select_own has no with check');
select is((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_insert_own'),
  null, 'S4: todos_insert_own has no using');
select is((select pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_insert_own'),
  '(( SELECT auth.uid() AS uid) = user_id)', 'S4: todos_insert_own with check is the owner check');
select is((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_update_own'),
  '(( SELECT auth.uid() AS uid) = user_id)', 'S4: todos_update_own using is the owner check');
select is((select pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_update_own'),
  '(( SELECT auth.uid() AS uid) = user_id)', 'S4: todos_update_own with check is the owner check');
select is((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_delete_own'),
  '(( SELECT auth.uid() AS uid) = user_id)', 'S4: todos_delete_own using is the owner check');
select is((select pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.todos'::regclass and polname = 'todos_delete_own'),
  null, 'S4: todos_delete_own has no with check');

-- S5: the composite index.
select has_index('public', 'todos', 'todos_user_id_created_at_idx', 'S5: index todos_user_id_created_at_idx exists');
select is(pg_get_indexdef('public.todos_user_id_created_at_idx'::regclass),
  'CREATE INDEX todos_user_id_created_at_idx ON public.todos USING btree (user_id, created_at DESC, id DESC)',
  'S5: index is on (user_id, created_at desc, id desc)');

-- ===================== Grants (AC40, L14) =====================

-- G1: table level for authenticated.
select table_privs_are('public', 'todos', 'authenticated', array['SELECT', 'DELETE'],
  'G1: authenticated has exactly SELECT and DELETE on the table');

-- G2: column level for authenticated.
select column_privs_are('public', 'todos', 'title', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'G2: authenticated: title = SELECT, INSERT, UPDATE');
select column_privs_are('public', 'todos', 'done', 'authenticated', array['SELECT', 'UPDATE'],
  'G2: authenticated: done = SELECT, UPDATE');
select column_privs_are('public', 'todos', 'id', 'authenticated', array['SELECT'],
  'G2: authenticated: id = SELECT only');
select column_privs_are('public', 'todos', 'user_id', 'authenticated', array['SELECT'],
  'G2: authenticated: user_id = SELECT only');
select column_privs_are('public', 'todos', 'created_at', 'authenticated', array['SELECT'],
  'G2: authenticated: created_at = SELECT only');
select column_privs_are('public', 'todos', 'updated_at', 'authenticated', array['SELECT'],
  'G2: authenticated: updated_at = SELECT only');

-- G3: anon gets nothing.
select table_privs_are('public', 'todos', 'anon', array[]::text[], 'G3: anon has no table privileges');
select ok(not has_any_column_privilege('anon', 'public.todos', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'G3: anon has no column privileges');

-- G4: service_role keeps task 1's defaults and no data access.
select table_privs_are('public', 'todos', 'service_role', array['TRUNCATE', 'REFERENCES', 'TRIGGER'],
  'G4: service_role has exactly TRUNCATE, REFERENCES, TRIGGER (pgTAP list without MAINTAIN)');
select ok(has_table_privilege('service_role', 'public.todos', 'MAINTAIN'), 'G4: service_role has MAINTAIN');
select ok(not has_table_privilege('service_role', 'public.todos', 'SELECT')
      and not has_table_privilege('service_role', 'public.todos', 'INSERT')
      and not has_table_privilege('service_role', 'public.todos', 'UPDATE')
      and not has_table_privilege('service_role', 'public.todos', 'DELETE'),
  'G4: service_role has no SELECT/INSERT/UPDATE/DELETE');
select ok(not has_any_column_privilege('service_role', 'public.todos', 'SELECT, INSERT, UPDATE'),
  'G4: service_role has no column SELECT/INSERT/UPDATE');

-- G5: the trigger function is callable by nobody but the owner.
select ok(not has_function_privilege('anon', 'public.todos_set_updated_at()', 'EXECUTE'),
  'G5: anon cannot execute todos_set_updated_at()');
select ok(not has_function_privilege('authenticated', 'public.todos_set_updated_at()', 'EXECUTE'),
  'G5: authenticated cannot execute todos_set_updated_at()');
select ok(not has_function_privilege('service_role', 'public.todos_set_updated_at()', 'EXECUTE'),
  'G5: service_role cannot execute todos_set_updated_at()');
select throws_ok($q$ set local role authenticated; select public.todos_set_updated_at(); reset role $q$,
  '42501', 'permission denied for function todos_set_updated_at',
  'G5: authenticated calling todos_set_updated_at() is denied');
select is(current_user::text, 'postgres', 'G5: still running as postgres');

-- ===================== Fixtures =====================
-- Users A and B (fake addresses), to-dos A1-A3 and B1-B2, backdated one day so updated_at changes are visible.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 't3-user-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 't3-user-b@test.local');
insert into public.todos (id, user_id, title, done, created_at, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A1 title', false, now() - interval '1 day', now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A2 title', false, now() - interval '1 day', now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'A3 title', true,  now() - interval '1 day', now() - interval '1 day'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B1 title', false, now() - interval '1 day', now() - interval '1 day'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B2 title', false, now() - interval '1 day', now() - interval '1 day');

-- Results of allowed statements run as an API role.
create temp table t3_out (label text primary key, n bigint);
grant select, insert on t3_out to authenticated;

-- Snapshot of B1 to prove it is unchanged later.
create temp table t3_b1_before as select * from public.todos where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ===================== RLS with two users =====================

-- R1 (select). As B first, then A (A stays the active user for R2-R4).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
insert into t3_out select 'b_select_all', count(*) from public.todos;
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into t3_out select 'a_select_all', count(*) from public.todos;
insert into t3_out select 'a_select_not_a', count(*) from public.todos where user_id <> '11111111-1111-1111-1111-111111111111';
insert into t3_out select 'a_select_b1', count(*) from public.todos where id = 'bbbbbbbb-0000-0000-0000-000000000001';
reset role;
select is(current_user::text, 'postgres', 'R1: back to postgres');
select is((select n from t3_out where label = 'a_select_all'), 3::bigint, 'R1: A sees exactly 3 to-dos');
select is((select n from t3_out where label = 'a_select_not_a'), 0::bigint, 'R1: A sees only rows with user_id = A');
select is((select n from t3_out where label = 'b_select_all'), 2::bigint, 'R1: B sees exactly 2 to-dos');
select is((select n from t3_out where label = 'a_select_b1'), 0::bigint, 'R1: A selecting B1 by id gets 0 rows');

-- R2 (insert title only).
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values ('Buy milk'); reset role $q$,
  'R2: A can insert a to-do with only a title');
select is(current_user::text, 'postgres', 'R2: still running as postgres');
select is((select count(*) from public.todos where title = 'Buy milk'), 1::bigint, 'R2: the new to-do exists');
select is((select user_id from public.todos where title = 'Buy milk'), '11111111-1111-1111-1111-111111111111'::uuid,
  'R2: the new to-do is owned by A');
select is((select done from public.todos where title = 'Buy milk'), false, 'R2: the new to-do is not done');

-- R3 (update own vs other's), R4 (delete own vs other's).
set local role authenticated;
with u as (update public.todos set title = 'A1 changed', done = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  insert into t3_out select 'a_update_a1', count(*) from u;
with u as (update public.todos set title = 'hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
  insert into t3_out select 'a_update_b1_title', count(*) from u;
with u as (update public.todos set done = true where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
  insert into t3_out select 'a_update_b1_done', count(*) from u;
with d as (delete from public.todos where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
  insert into t3_out select 'a_delete_b1', count(*) from d;
with d as (delete from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1)
  insert into t3_out select 'a_delete_a3', count(*) from d;
reset role;
select is(current_user::text, 'postgres', 'R3/R4: back to postgres');
select is((select n from t3_out where label = 'a_update_a1'), 1::bigint, 'R3: A updating A1 title and done changes 1 row');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A1 changed', 'R3: A1 title changed');
select is((select done from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001'), true, 'R3: A1 done changed');
select is((select n from t3_out where label = 'a_update_b1_title'), 0::bigint, 'R3: A updating B1 title changes 0 rows');
select is((select n from t3_out where label = 'a_update_b1_done'), 0::bigint, 'R3: A updating B1 done changes 0 rows');
select ok((select (t.title, t.done, t.user_id, t.updated_at) = (b.title, b.done, b.user_id, b.updated_at)
           from public.todos t, t3_b1_before b where t.id = b.id),
  'R3: B1 unchanged (title, done, user_id, updated_at)');
select is((select n from t3_out where label = 'a_delete_b1'), 0::bigint, 'R4: A deleting B1 deletes 0 rows');
select is((select count(*) from public.todos where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1::bigint, 'R4: B1 still exists');
select is((select n from t3_out where label = 'a_delete_a3'), 1::bigint, 'R4: A deleting A3 deletes 1 row');
select is((select count(*) from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000003'), 0::bigint, 'R4: A3 is gone');

-- R5 (updated_at set by the trigger; created_at unchanged).
select is((select updated_at from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001'), now(),
  'R5: A1 updated_at = now() after the update');
select ok((select updated_at > created_at from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'R5: A1 updated_at > created_at');
select is((select created_at from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  now() - interval '1 day', 'R5:A1 created_at unchanged (still the backdated seed value)');

-- ===================== user_id / mass assignment =====================

-- Snapshot of A1 after R3, to prove M3 and C2 change nothing.
create temp table t3_a1_before as select * from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- M1: A naming user_id = B.
select throws_ok($q$ set local role authenticated; insert into public.todos (user_id, title) values ('22222222-2222-2222-2222-222222222222', 'planted'); reset role $q$,
  '42501', 'permission denied for table todos', 'M1: A inserting with user_id = B is denied');
select is(current_user::text, 'postgres', 'M1: still running as postgres');
select is((select count(*) from public.todos where user_id = '22222222-2222-2222-2222-222222222222'), 2::bigint,
  'M1: no row owned by B was added');

-- M2: other server-computed columns on insert.
select throws_ok($q$ set local role authenticated; insert into public.todos (title, done) values ('m2', true); reset role $q$,
  '42501', 'permission denied for table todos', 'M2: insert naming done is denied');
select throws_ok($q$ set local role authenticated; insert into public.todos (id, title) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'm2'); reset role $q$,
  '42501', 'permission denied for table todos', 'M2: insert naming id is denied');
select throws_ok($q$ set local role authenticated; insert into public.todos (title, created_at) values ('m2', now() - interval '1 year'); reset role $q$,
  '42501', 'permission denied for table todos', 'M2: insert naming created_at is denied');
select throws_ok($q$ set local role authenticated; insert into public.todos (title, updated_at) values ('m2', now() - interval '1 year'); reset role $q$,
  '42501', 'permission denied for table todos', 'M2: insert naming updated_at is denied');
select is(current_user::text, 'postgres', 'M2: still running as postgres');
select is((select count(*) from public.todos where title = 'm2'), 0::bigint, 'M2: no row was added');

-- M3: changing server-computed columns on update.
select throws_ok($q$ set local role authenticated; update public.todos set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '42501', 'permission denied for table todos', 'M3: update setting user_id = B is denied');
select throws_ok($q$ set local role authenticated; update public.todos set id = gen_random_uuid() where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '42501', 'permission denied for table todos', 'M3: update setting id is denied');
select throws_ok($q$ set local role authenticated; update public.todos set created_at = now() - interval '1 year' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '42501', 'permission denied for table todos', 'M3: update setting created_at is denied');
select throws_ok($q$ set local role authenticated; update public.todos set updated_at = now() - interval '1 year' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '42501', 'permission denied for table todos', 'M3: update setting updated_at is denied');
select is(current_user::text, 'postgres', 'M3: still running as postgres');
select ok((select row(t.*) = row(b.*) from public.todos t, t3_a1_before b where t.id = b.id),
  'M3: A1 unchanged and still owned by A');

-- M5: the user_id default follows the JWT.
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values ('m5 as A'); reset role $q$,
  'M5: A inserts with only a title');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values ('m5 as B'); reset role $q$,
  'M5: B inserts with only a title');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(current_user::text, 'postgres', 'M5: still running as postgres');
select is((select user_id from public.todos where title = 'm5 as A'), '11111111-1111-1111-1111-111111111111'::uuid,
  'M5: the row inserted with A''s claims is owned by A');
select is((select user_id from public.todos where title = 'm5 as B'), '22222222-2222-2222-2222-222222222222'::uuid,
  'M5: the row inserted with B''s claims is owned by B');

-- ===================== anon (AC39) =====================

create temp table t3_count_before as select count(*) as n from public.todos;
select set_config('request.jwt.claims', '', true);
select throws_ok($q$ set local role anon; select * from public.todos; reset role $q$,
  '42501', 'permission denied for table todos', 'N1: anon select is denied');
select throws_ok($q$ set local role anon; insert into public.todos (title) values ('anon'); reset role $q$,
  '42501', 'permission denied for table todos', 'N1: anon insert is denied');
select throws_ok($q$ set local role anon; update public.todos set done = true; reset role $q$,
  '42501', 'permission denied for table todos', 'N1: anon update is denied');
select throws_ok($q$ set local role anon; delete from public.todos; reset role $q$,
  '42501', 'permission denied for table todos', 'N1: anon delete is denied');
select is(current_user::text, 'postgres', 'N1: still running as postgres');
select is((select count(*) from public.todos), (select n from t3_count_before), 'N1: row count unchanged');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ===================== CHECK boundaries (AC16, AC17, AC19) =====================

-- C1: accepted values, on insert and on update.
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values ('z'); reset role $q$,
  'C1: insert of a 1-character title is accepted');
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values (repeat('a', 200)); reset role $q$,
  'C1: insert of a 200-character title is accepted');
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values (repeat(U&'\+01F600', 200)); reset role $q$,
  'C1: insert of 200 x U+1F600 is accepted');
select lives_ok($q$ set local role authenticated; insert into public.todos (title) values
  ('<script>window.__xss=1</script>'), ('<img src=x onerror="window.__xss=1">'),
  ('"><svg onload="window.__xss=1">'), ('javascript:window.__xss=1'); reset role $q$,
  'C1: insert of the AC34 XSS strings is accepted');
select is(current_user::text, 'postgres', 'C1: still running as postgres');
select is((select char_length(title) from public.todos where title = repeat(U&'\+01F600', 200)), 200,
  'C1: 200 x U+1F600 is stored with char_length 200');
select is((select count(*) from public.todos
           where user_id = '11111111-1111-1111-1111-111111111111'
             and title in ('<script>window.__xss=1</script>', '<img src=x onerror="window.__xss=1">',
                           '"><svg onload="window.__xss=1">', 'javascript:window.__xss=1')),
  4::bigint, 'C1: the AC34 XSS strings are stored byte-identical');

select lives_ok($q$ set local role authenticated; update public.todos set title = 'z' where id = 'aaaaaaaa-0000-0000-0000-000000000002'; reset role $q$,
  'C1: update to a 1-character title is accepted');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'z', 'C1: A2 title is now z');
select lives_ok($q$ set local role authenticated; update public.todos set title = repeat('a', 200) where id = 'aaaaaaaa-0000-0000-0000-000000000002'; reset role $q$,
  'C1: update to a 200-character title is accepted');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000002'), repeat('a', 200), 'C1: A2 title is now 200 x a');
select lives_ok($q$ set local role authenticated; update public.todos set title = repeat(U&'\+01F600', 200) where id = 'aaaaaaaa-0000-0000-0000-000000000002'; reset role $q$,
  'C1: update to 200 x U+1F600 is accepted');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000002'), repeat(U&'\+01F600', 200), 'C1: A2 title is now 200 x U+1F600');
select lives_ok($q$ set local role authenticated; update public.todos set title = '<img src=x onerror="window.__xss=1">' where id = 'aaaaaaaa-0000-0000-0000-000000000002'; reset role $q$,
  'C1: update to an AC34 XSS string is accepted');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000002'), '<img src=x onerror="window.__xss=1">',
  'C1: A2 title stored byte-identical');
select lives_ok($q$ set local role authenticated; update public.todos set title = 'Buy milk' where id = 'aaaaaaaa-0000-0000-0000-000000000002'; reset role $q$,
  'C1: update to Buy milk is accepted');
select is((select title from public.todos where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'Buy milk', 'C1: A2 title is now Buy milk');
select is(current_user::text, 'postgres', 'C1: still running as postgres after updates');

-- C2: rejected values on insert (23514).
create temp table t3_count_c2 as select count(*) as n from public.todos;
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (''); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_length"', 'C2: insert of empty title is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (repeat('a', 201)); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_length"', 'C2: insert of 201 characters is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values ('   '); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of spaces only is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (E'\t'); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of a tab only is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (E'\n'); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of a newline only is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (E' \t\n'); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of mixed whitespace is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values ('  Buy milk  '); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of an untrimmed title is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (E'x '); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert with a trailing space is rejected');
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (repeat('a', 199) || ' '); reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: insert of 199 characters plus a space is rejected');
select is(current_user::text, 'postgres', 'C2: still running as postgres after inserts');
select is((select count(*) from public.todos), (select n from t3_count_c2), 'C2: no row was added');

-- C2: rejected values on update of A1 (23514); A1 unchanged after each.
select throws_ok($q$ set local role authenticated; update public.todos set title = '' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_length"', 'C2: update to empty title is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = repeat('a', 201) where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_length"', 'C2: update to 201 characters is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = '   ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to spaces only is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = E'\t' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to a tab only is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = E'\n' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to a newline only is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = E' \t\n' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to mixed whitespace is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = '  Buy milk  ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to an untrimmed title is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = E'x ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update with a trailing space is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = repeat('a', 199) || ' ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23514', 'new row for relation "todos" violates check constraint "todos_title_trimmed"', 'C2: update to 199 characters plus a space is rejected');
select is(current_user::text, 'postgres', 'C2: still running as postgres after updates');
select ok((select row(t.*) = row(b.*) from public.todos t, t3_a1_before b where t.id = b.id),
  'C2: A1 unchanged after the rejected updates');

-- C3: null title (23502).
select throws_ok($q$ set local role authenticated; insert into public.todos (title) values (null); reset role $q$,
  '23502', 'null value in column "title" of relation "todos" violates not-null constraint', 'C3: insert of a null title is rejected');
select throws_ok($q$ set local role authenticated; update public.todos set title = null where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '23502', 'null value in column "title" of relation "todos" violates not-null constraint', 'C3: update to a null title is rejected');
select is(current_user::text, 'postgres', 'C3: still running as postgres');
select ok((select row(t.*) = row(b.*) from public.todos t, t3_a1_before b where t.id = b.id),
  'C3: A1 unchanged');

-- ===================== M4: the RLS layer on its own =====================
-- Widen the column grants inside this transaction only, so with check is what stops a foreign user_id.
-- Revoked right after; the final rollback removes it anyway.
grant insert (user_id), update (user_id) on public.todos to authenticated;
select throws_ok($q$ set local role authenticated; insert into public.todos (user_id, title) values ('22222222-2222-2222-2222-222222222222', 'planted'); reset role $q$,
  '42501', 'new row violates row-level security policy for table "todos"', 'M4: RLS rejects an insert with user_id = B');
select throws_ok($q$ set local role authenticated; update public.todos set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role $q$,
  '42501', 'new row violates row-level security policy for table "todos"', 'M4: RLS rejects an update to user_id = B');
revoke insert (user_id), update (user_id) on public.todos from authenticated;
select is(current_user::text, 'postgres', 'M4: still running as postgres');
select column_privs_are('public', 'todos', 'user_id', 'authenticated', array['SELECT'],
  'M4: user_id grants back to SELECT only');
select ok((select row(t.*) = row(b.*) from public.todos t, t3_a1_before b where t.id = b.id),
  'M4: A1 unchanged and still owned by A');

-- ===================== K1: cascade =====================
create temp table t3_a_before as select count(*) as n from public.todos where user_id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is((select count(*) from public.todos where user_id = '22222222-2222-2222-2222-222222222222'), 0::bigint,
  'K1: deleting user B removes all of B''s to-dos');
select is((select count(*) from public.todos where user_id = '11111111-1111-1111-1111-111111111111'),
  (select n from t3_a_before), 'K1: A''s to-dos are untouched');

select * from finish();
rollback;

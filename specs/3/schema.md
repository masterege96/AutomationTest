# Task 3 schema spec: `public.todos`

Author: db-architect, 2026-11-25. Inputs: `tasks/3/TASK_BRIEF.md` (ACs, answered questions, backend-dev's
Design proposal in the Handoff), `tasks/decisions.md`, `tasks/lessons.md` (L14, L15, L20), `specs/1/schema.md`
and `specs/2a/schema.md` (binding conventions), `supabase/migrations/*.sql`, `supabase/tests/*.sql`,
`scripts/verify.sh` (destructive scan, static RLS check), `npx supabase gen types --help` (CLI 3.2.0).
`specs/3/threat-model.md` did not exist yet when this was written: **security has the final say on the access
rules below** and signs off in the threat model.

**How this was checked:** the SQL in section 9 was run on the local stack (`supabase_db_AutomationTest`)
inside `begin; ... rollback;` transactions only (nothing kept, no reset), as `postgres`, then as
`authenticated` with A's claims, as `anon`, and (for the cascade) as `supabase_auth_admin` via
`supabase_admin`. Results quoted below are from those runs. No production or Supabase cloud access was used.

## Scope

One new table `public.todos`, its RLS policies, grants, one index, and one trigger function + trigger that keeps
`updated_at` current. No other object changes. Template sections that don't apply: 7 (storage: no uploads, row
12 N/A), 8 (destructive plan: nothing is dropped or renamed). Row 7 (unique constraints for single-use items) is
N/A: nothing in a to-do is single use.

## 1. Table and columns

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | primary key. uuid, not bigint identity: ids aren't guessable or countable (row 2), no sequence grant needed (task 1 revoked all on sequences), and backend-dev's `z.uuid()` id check (AC18) matches. `gen_random_uuid()` is a core Postgres function (pg_catalog), so 2a's EXECUTE default doesn't touch it. |
| `user_id` | `uuid` | not null | `auth.uid()` | FK `auth.users (id) on delete cascade`. Not client-settable (section 5). |
| `title` | `text` | not null | none | `todos_title_trimmed`, `todos_title_length` (below). |
| `done` | `boolean` | not null | `false` | |
| `created_at` | `timestamptz` | not null | `now()` | Not client-settable (no INSERT/UPDATE grant on it). |
| `updated_at` | `timestamptz` | not null | `now()` | Set by trigger `todos_set_updated_at` on every update. Not client-settable. |

`auth.uid()` is owned by `supabase_auth_admin` with `EXECUTE` for `PUBLIC` (checked locally), so the default
and the policies work for `authenticated`; 2a's revoke covers only functions **postgres** creates.

### Title rule (row 5, AC16, AC17, AC19)

The brief: trim leading/trailing whitespace, then 1 to 200 characters counted as code points (`char_length`),
and the trimmed title is what is stored. The DB enforces the **stored** value:

```sql
constraint todos_title_trimmed check (title = btrim(title, <ws>)),
constraint todos_title_length  check (char_length(title) between 1 and 200)
```

where `<ws>` is exactly the set JavaScript's `String.prototype.trim()` removes (ECMAScript WhiteSpace +
LineTerminator): U+0009, U+000A, U+000B, U+000C, U+000D, U+0020, U+00A0, U+1680, U+2000-U+200A, U+2028,
U+2029, U+202F, U+205F, U+3000, U+FEFF.

**Why not the single `char_length(btrim(title)) between 1 and 200` the orchestrator suggested** (a deliberate
deviation, same intent, stricter):

1. That check accepts an **untrimmed** value: `'x' || repeat(' ', 100000)` has `char_length(btrim(...)) = 1`
   and passes, so a direct PostgREST insert (bypassing the API) could store a 100 000-character title. The
   brief says the trimmed title is what is stored; the pair above enforces that, and caps the stored length.
2. `btrim(title)` with one argument strips **only spaces**, so a tab-only or newline-only title (`E'\t'`,
   AC17) would pass it. With the explicit set it fails.
3. The DB set equals JS `trim()`'s set, so the API (which trims with `trim()` / zod `.trim()`) and the DB agree
   exactly: anything the API stores passes the DB check, and the DB rejects nothing the API would accept.

Result: `''` fails `todos_title_length`; `'   '`, `E'\t'`, `E'\n'`, `'  Buy milk  '` and `E'x '` fail
`todos_title_trimmed`; `repeat('a', 201)` fails `todos_title_length`; `'z'`, `repeat('a', 200)` and
200 x U+1F600 pass (`char_length` = 200). All observed in the local trial run. The DB **rejects** an untrimmed
title rather than trimming it: trimming is the API's job (backend-dev), the DB is the last line of defense.

Not constrained (by design, the brief stores text unchanged, AC34): HTML/script characters, inner whitespace,
control characters inside the title. Postgres `text` can't hold U+0000 anyway.

## 2. Keys and uniqueness

- Primary key `todos_pkey (id)`.
- Foreign key `user_id -> auth.users (id) on delete cascade`: deleting a user deletes their to-dos. Proven
  locally: a `delete from auth.users` run as `supabase_auth_admin` (the role GoTrue uses) removed that user's
  to-do although `supabase_auth_admin` has no privilege on `public.todos` (FK actions run as the table owner and
  bypass RLS). Account deletion isn't in scope, but the cascade means it can't leave orphans later.
- No unique constraints: duplicate titles are allowed (AC45 creates 20 distinct titles; nothing forbids two
  equal ones).

## 3. RLS

`alter table public.todos enable row level security;`

**Not forced** (`force row level security` is not used): FORCE only affects the table owner, and the owner
`postgres` has `BYPASSRLS` on Supabase (checked locally: `rolbypassrls = t`), which FORCE does not override.
So it would be a no-op today and only add a line reviewers have to reason about. No `security definer` function
touches this table. If security wants it anyway, it is harmless: FK cascades still work (RI actions ignore
FORCE).

One permissive policy per operation, for `authenticated` only. `anon` has no policy (and no grant, section 4).
`(select auth.uid())` instead of `auth.uid()` so Postgres evaluates it once per statement (initPlan), not per
row (Supabase advisor `auth_rls_initplan`).

- **Select:** a signed-in user sees only their own to-dos.
  `create policy todos_select_own on public.todos for select to authenticated using ((select auth.uid()) = user_id);`
- **Insert:** a signed-in user can only create to-dos owned by themselves. (Second layer: the column grant
  already stops a client from naming `user_id` at all.)
  `create policy todos_insert_own on public.todos for insert to authenticated with check ((select auth.uid()) = user_id);`
- **Update:** a signed-in user can only change their own to-dos, and the row must still be theirs afterwards.
  `create policy todos_update_own on public.todos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);`
- **Delete:** a signed-in user can only delete their own to-dos.
  `create policy todos_delete_own on public.todos for delete to authenticated using ((select auth.uid()) = user_id);`

Another user's row is invisible, so update/delete of it affect 0 rows (no error). Backend maps 0 rows to 404,
the same as a missing id (AC22).

## 4. Grants (L14, AC40: exactly what the API needs)

```sql
revoke all on table public.todos from anon, authenticated;
grant select, delete on table public.todos to authenticated;
grant insert (title) on table public.todos to authenticated;
grant update (title, done) on table public.todos to authenticated;
```

- The `revoke` line first makes the end state independent of default privileges (L14: production's defaults
  differed from local once). Today it's a no-op (task 1's defaults give both roles nothing on new tables).
- `select` on all columns: the list and every `returning` need `id, title, done, created_at` (and `updated_at`
  is harmless to read). UPDATE/DELETE with a `where` also need SELECT.
- `insert (title)` only: create accepts only the title (AC28). `id`, `user_id`, `done`, `created_at`,
  `updated_at` come from defaults. PostgREST names only the JSON body's keys in its INSERT, so
  `{"title": "..."}` works and any other key fails with `42501`.
- `update (title, done)` only: a change may set only the title and/or done (AC29). `user_id`, `id`,
  `created_at`, `updated_at` can't be changed by a client at all.
- `delete` on the table (row-level; RLS limits it to own rows).
- **anon: nothing.** **service_role:** no explicit grant; it keeps task 1's default `MAINTAIN, REFERENCES,
  TRIGGER` and the table-emptying privilege (production state, decided in task 1), and **no** SELECT/INSERT/
  UPDATE/DELETE, so the service key can't read or write to-dos through the Data API (matches AC24: no
  service-role code path). If security later approves a service-role use, that is a new migration.
- Resulting ACLs (local trial): `relacl = {postgres=arwdDxtm/postgres, service_role=Dxtm/postgres,
  authenticated=rd/postgres}`; column ACLs `title {authenticated=aw/postgres}`, `done {authenticated=w/postgres}`.

## 5. Server-computed values and `user_id` (row 8)

| Value | Set by | How the client is stopped |
|---|---|---|
| `user_id` | column default `auth.uid()` | (1) no INSERT/UPDATE privilege on the column: naming it gives `42501 permission denied for table todos`; (2) RLS `with check` on insert and update (proven separately by widening the grant inside a test transaction: `new row violates row-level security policy for table "todos"`). **No trigger**: layer 1 already makes it unsettable for every API role, and a trigger forcing `user_id := auth.uid()` would break inserts by `postgres` (seed data, tests, future admin migrations) where `auth.uid()` is null. |
| `id` | default `gen_random_uuid()` | no INSERT/UPDATE privilege on the column |
| `done` on create | default `false` | no INSERT privilege on the column (create accepts only the title) |
| `created_at` | default `now()` | no INSERT/UPDATE privilege |
| `updated_at` | default `now()`, then trigger on every update | no INSERT/UPDATE privilege; the trigger overwrites it anyway |

### Trigger function (2a convention rule 5)

```sql
create function public.todos_set_updated_at() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.todos_set_updated_at() from public, anon, authenticated;
```

- **No grant to anyone, on purpose.** 2a's global default already gives new `postgres` functions owner-only
  EXECUTE; the explicit revoke is 2a's belt-and-braces rule 5.1. Postgres checks EXECUTE on a trigger function
  only at `create trigger` (run by the owner `postgres`), never when the trigger fires, so updates by
  `authenticated` still fire it (proven locally: an update as A set `updated_at = now()`). 2a section 4: "Don't
  grant trigger functions to API roles."
- `security invoker`, `set search_path = ''`: no definer rights; `now()` resolves from `pg_catalog`, which is
  always searched. Satisfies the advisor `function_search_path_mutable`.
- Lives in `public` (exposed) but isn't callable as an RPC: no EXECUTE for API roles (local: calling it as
  `authenticated` gives `permission denied for function todos_set_updated_at`), and a `returns trigger` function
  can't be called directly anyway. A `private` schema would add a schema and its own grants for no gain here.
- `now()` is the transaction start time: inside one transaction `updated_at` equals `created_at`. Tests must
  backdate rows first (section 7).

```sql
create trigger todos_set_updated_at before update on public.todos
  for each row execute function public.todos_set_updated_at();
```

## 6. Indexes

| Index | Serves |
|---|---|
| `todos_pkey (id)` (from the PK) | by-id read/update/delete (`.eq('id', id)`) |
| `todos_user_id_created_at_idx on public.todos (user_id, created_at desc, id desc)` | the RLS predicate `user_id = auth.uid()` (every query), the newest-first list `order by created_at desc, id desc` (AC11) without a sort, and the FK cascade lookup by `user_id` (leading column). |

No separate `(user_id)` index: the composite one leads with `user_id` and covers the FK and RLS (role
contract: one per FK and per RLS predicate column). `id desc` is the tie-breaker: parallel creates (AC45) can
share a `created_at` microsecond, so the backend should order by `created_at desc, id desc` for a stable order
(the order between two same-instant to-dos is arbitrary but fixed).

## 7. Test list for db-builder (`supabase/tests/03_todos_test.sql`)

Same frame as `02_function_privileges_test.sql`: `begin; create extension if not exists pgtap with schema
extensions; select plan(N); ... select * from finish(); rollback;`.

**Patterns (binding, all proven in the local trial):**

- pgTAP functions are created by `postgres` inside the test, so 2a gives API roles no EXECUTE on them:
  **assertions always run as `postgres`**. Never call `is()`/`ok()` while `authenticated`/`anon` is active.
- **Error cases:** `throws_ok($q$ set local role authenticated; <statement>; reset role $q$, '<sqlstate>',
  '<message>', '<description>')`. The trailing `; reset role` is required (L20): if the statement wrongly
  succeeds, the role would otherwise leak into the rest of the file.
- **Allowed / row-count cases:** a temp table owned by `postgres` collects results:
  `create temp table t3_out (label text primary key, n bigint); grant select, insert on t3_out to authenticated;`
  then `set local role authenticated;` and e.g.
  `with u as (update public.todos set done = true where id = '<B1>' returning 1) insert into t3_out select 'a_update_b', count(*) from u;`
  then `reset role;` and assert on `t3_out` as `postgres`. Assert `current_user = 'postgres'` after each block.
- **Acting as a user:** `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);`
  at top level before switching role. While claims are set, every insert by `postgres` must name `user_id`
  explicitly (the default `auth.uid()` would pick up the claims).
- **Fixtures:** as `postgres`, two users A and B: `insert into auth.users (id, email) values (...)` with fixed
  uuids and `@test.local`-style addresses (works locally with only those two columns); seed to-dos with
  explicit `id`, `user_id`, and `created_at`/`updated_at` set to `now() - interval '1 day'`. No secrets, no real
  emails.
- Don't write the table-emptying privilege's name in migrations (L15). In this test file it may appear
  (verify.sh scans only migrations), for example in `has_table_privilege`.

**Assertions** (names may change; none may be dropped):

Structure
- S1 `has_table('public','todos')`; `col_type_is` / `col_not_null` / `col_default_is` for every column in
  section 1 (`user_id` default `auth.uid()`, `done` default `false`).
- S2 `col_is_pk('public','todos','id')`; `fk_ok('public','todos','user_id','auth','users','id')`, and the FK's
  delete action is cascade (`pg_constraint.confdeltype = 'c'` for the FK).
- S3 RLS enabled (`relrowsecurity`), not forced (`not relforcerowsecurity`, documents the section 3 decision);
  `00_bootstrap_test.sql` still passes.
- S4 `policies_are('public','todos', array['todos_select_own','todos_insert_own','todos_update_own','todos_delete_own'])`;
  for each, `policy_cmd_is('public','todos','<name>','<cmd>','<description>')` (**5-argument form**: the
  4-argument form is read as `(table, policy, cmd, description)` and fails) and
  `policy_roles_are('public','todos','<name>', array['authenticated'])`; and the exact `qual`/`with_check`
  via `pg_get_expr(polqual, polrelid)` / `pg_get_expr(polwithcheck, polrelid)` equal
  `(( SELECT auth.uid() AS uid) = user_id)` (literal text seen locally): `using` on select/update/delete,
  `with check` on insert/update, and null where the operation has none.
- S5 index `todos_user_id_created_at_idx` exists on `(user_id, created_at desc, id desc)` (`has_index` plus
  `pg_get_indexdef` text).

Grants (AC40, L14)
- G1 `table_privs_are('public','todos','authenticated', array['SELECT','DELETE'])` (table level).
- G2 `column_privs_are` for `authenticated`: `title` = `SELECT, INSERT, UPDATE`; `done` = `SELECT, UPDATE`;
  `id`, `user_id`, `created_at`, `updated_at` = `SELECT` only.
- G3 `table_privs_are('public','todos','anon', array[]::text[])` and
  `not has_any_column_privilege('anon','public.todos','SELECT, INSERT, UPDATE, REFERENCES')`.
- G4 `service_role`: `table_privs_are(..., array['TRUNCATE','REFERENCES','TRIGGER'])` plus
  `has_table_privilege('service_role','public.todos','MAINTAIN')` separately (pgTAP 1.3.3's privilege list
  doesn't know PG17's MAINTAIN, so `table_privs_are` silently ignores it), and no SELECT/INSERT/UPDATE/DELETE.
- G5 trigger function: `has_function_privilege` false for `anon`, `authenticated`, `service_role` on
  `public.todos_set_updated_at()`; calling it as `authenticated` throws `42501`.

RLS with two users (AC22, AC23, AC30, AC38, AC11). Seed A: A1, A2, A3; B: B1, B2.
- R1 select: A sees exactly 3 rows and only `user_id = A`; B sees exactly 2. A selecting B1 by id gets 0 rows.
- R2 insert: A `insert (title) values ('Buy milk')` lives; the new row has `user_id = A`, `done = false`.
- R3 update: A updates A1's title and done: 1 row; A updates B1 (title or done): 0 rows, B1 unchanged
  (title, done, user_id, updated_at).
- R4 delete: A deletes B1: 0 rows, B1 still there; A deletes A3: 1 row, gone.
- R5 updated_at: after R3, A1's `updated_at = now()` and `> created_at` (seed backdated); `created_at`
  unchanged.

user_id / mass assignment (AC28, AC29, AC30)
- M1 as A, `insert (user_id, title)` with B's id: `42501`, message `permission denied for table todos`; no row
  owned by B was added.
- M2 as A, `insert (title, done)`, `insert (id, title)`, `insert (title, created_at)`, `insert (title,
  updated_at)`: each `42501`.
- M3 as A, `update ... set user_id = B` on A1; `set id = gen_random_uuid()`; `set created_at = ...`;
  `set updated_at = ...`: each `42501`; A1 unchanged and still A's.
- M4 RLS layer on its own: as `postgres`, `grant insert (user_id), update (user_id) on public.todos to
  authenticated;` inside the test transaction, then as A insert with `user_id = B` and update A1 to
  `user_id = B`: each throws `42501` with `new row violates row-level security policy for table "todos"`.
  Place M4 **last** (or revoke the extra grant right after), so G1/G2 still see the real grants. The rollback
  removes it.
- M5 default: as A (claims `sub` = A), `insert (title)` only stores `user_id = A`; switch the claims to B and
  insert again: that row has `user_id = B` (the default follows the JWT, not a fixed value).

anon (AC39)
- N1 as `anon` (no claims): `select`, `insert (title)`, `update ... set done = true`, `delete` on
  `public.todos`: each `42501 permission denied for table todos`; row count unchanged.

CHECK boundaries (AC16, AC17, AC19) as A through `insert (title)` and `update set title`:
- C1 accepted: `'z'` (1), `repeat('a', 200)`, 200 x U+1F600 (`char_length` 200), `'Buy milk'`, the AC34 XSS
  strings stored byte-identical.
- C2 rejected with `23514`: `''` (`todos_title_length`), `repeat('a', 201)` (`todos_title_length`),
  `'   '`, `E'\t'`, `E'\n'`, `E' \t\n'`, `'  Buy milk  '`, `E'x '`, `repeat('a', 199) || ' '`
  (`todos_title_trimmed`). Match the message `new row for relation "todos" violates check constraint
  "<name>"`. Same set on update of A1; A1 unchanged after each.
- C3 `title = null` on insert and update: `23502` (not null).

Cascade
- K1 as `postgres`, `delete from auth.users where id = B`: B's to-dos are gone, A's untouched. (`postgres`
  can't `set role supabase_auth_admin` in the test; the GoTrue-role case was checked once by db-architect, see
  section 2.)

Negative control (run once locally, record in the Handoff, don't commit as passing): in a transaction,
`grant insert, update on public.todos to authenticated;` (table-wide) must make M1/M3 stop throwing `42501`
(then M4's RLS errors take over), and `alter table public.todos disable row level security;` must make R1/R3/R4
fail. Shows the tests can fail.

## 8. Migration

Create with `npx supabase migration new create_todos` (db-builder may pick another `<what>`). Exact content in
section 9. Checked against `scripts/verify.sh`: no `drop ...`, `rename ...`, `delete from` or the
table-emptying word anywhere (comments included); `on delete cascade` / `for delete` / `grant ... delete on`
don't match the destructive pattern; the static RLS check finds `create table public.todos` and
`alter table public.todos enable row level security`. LF line endings.

**Not destructive:** it only adds objects. No existing object or data changes.

## 9. Exact migration SQL

```sql
-- Task 3: to-do table (specs/3/schema.md). Each signed-in user can create, list, change (title, done) and
-- remove only their own to-dos. Adds objects only; changes no existing object or data.

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stored title is already trimmed (same character set as JavaScript's String.prototype.trim())
  -- and 1 to 200 code points long (specs/3/schema.md section 1).
  constraint todos_title_trimmed check (title = btrim(title, E' \t\n\u000B\f\r                 　﻿')),
  constraint todos_title_length check (char_length(title) between 1 and 200)
);

-- RLS predicate, newest-first list, and the foreign key lookup.
create index todos_user_id_created_at_idx on public.todos (user_id, created_at desc, id desc);

-- updated_at is server-computed. Trigger functions need no EXECUTE grant to fire; none is given (task 2a).
create function public.todos_set_updated_at() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.todos_set_updated_at() from public, anon, authenticated;

create trigger todos_set_updated_at before update on public.todos
  for each row execute function public.todos_set_updated_at();

-- Row level security: only the owner, only signed in. No policy for anon.
alter table public.todos enable row level security;

create policy todos_select_own on public.todos for select to authenticated
  using ((select auth.uid()) = user_id);
create policy todos_insert_own on public.todos for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy todos_update_own on public.todos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy todos_delete_own on public.todos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants (default privileges grant nothing in production, lesson L14). Clients may insert only the
-- title and change only title and done; id, user_id, created_at and updated_at come from the server.
revoke all on table public.todos from anon, authenticated;
grant select, delete on table public.todos to authenticated;
grant insert (title) on table public.todos to authenticated;
grant update (title, done) on table public.todos to authenticated;
```

`E'...\uXXXX...'` needs a UTF8 database (local: `server_encoding = UTF8`; Supabase hosted is UTF8). Postgres
stores the constraint with the characters themselves (`pg_get_constraintdef` shows them as literal, mostly
invisible characters), so a drift diff or `db dump` shows `btrim(title, ' <invisible chars>'::text)`; that is
expected, not corruption.

The section 9 block was extracted from this file and run as-is in a rolled-back local transaction (all
statements succeed; the destructive pattern finds nothing).

## 10. Production, drift and rollback

- **First real table** (rule 14 satisfied: integration connected, drift check exists). Merging to `main`
  makes the Supabase GitHub integration apply this migration to production; the table starts empty (AC46: no
  real users yet). The person's S14 acceptance covers this merge (decisions.md, task 3).
- **Drift:** everything is in `public`, which the drift check diffs. Expect one transient red between merge and
  the integration applying the migration; green after. Not verified: whether the pinned pg-delta engine models
  **column-level** grants and the FK into `auth` exactly as Postgres stores them. If the first post-deploy drift
  run shows lines about `todos` grants or the FK, judge them by content (rule 7): if production's catalog
  matches the queries below, it's tool noise for devops-cicd/db-builder to record, not drift.
- **Read-only post-deploy check** (git-release or the person; `select` only):
  ```sql
  select relrowsecurity, relforcerowsecurity, relacl::text from pg_class where oid = 'public.todos'::regclass;
  -- expected: t | f | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=rd/postgres}
  select attname, attacl::text from pg_attribute
   where attrelid = 'public.todos'::regclass and attacl is not null order by attname;
  -- expected: done {authenticated=w/postgres} ; title {authenticated=aw/postgres}
  select polname, polcmd, polroles::regrole[] from pg_policy where polrelid = 'public.todos'::regclass order by 1;
  -- expected: 4 rows, cmds d/a/r/w, roles {authenticated}
  select proacl::text from pg_proc where oid = 'public.todos_set_updated_at()'::regprocedure;
  -- expected: {postgres=X/postgres}
  ```
  If production's `service_role` entry differs from `Dxtm` (task 1's default), record it; it doesn't affect the
  app (no service-role code path).
- **Rollback:** a new migration, never an edit of this one. Before any real data exists:
  `drop table public.todos;` then `drop function public.todos_set_updated_at();` (the trigger and policies go
  with the table). That is destructive (verify.sh flags it, needs `destructive-approved` and a backup step per
  rule 11), so only with the person's approval. Partial rollbacks (e.g. a wrong grant) are a new migration with
  the corrected `revoke`/`grant` and need no label.

## 11. `types/database.ts` (backend-dev)

- Command: the person approved `npx supabase gen types typescript --local > types/database.ts`
  (tasks/decisions.md, PROJECT_CONTEXT Commands table). Use it as approved, after `npx supabase db reset` has
  applied this migration. Checked with the pinned CLI 3.2.0 against the local stack: it works (exit 0), and
  prints to stderr "Warning: --local isn't needed (local is the default) and will be removed in v4". So it
  breaks on a v4 upgrade; the equivalent form without the flag is
  `npx supabase gen types --lang typescript --schema public > types/database.ts` (local is the default). Changing
  the approved command is the person's call; this is only flagged. Without `--schema public` the file also
  contains an empty `graphql_public` section (harmless). Never `--remote` (production, needs a token).
- Run it from **Git Bash** (or a POSIX shell): the CLI's notices go to stderr, so `>` captures only the types;
  PowerShell 5.1's `>` would write UTF-16. The output had no CR locally. The CLI says the output is
  unformatted and suggests `npx oxfmt`; oxfmt isn't an approved dependency, so don't run it (if ESLint or a
  formatter complains about the generated file, devops-cicd decides on an ignore entry).
- Expected shape: `Database['public']['Tables']['todos']` with `Row` (all six columns, non-null), `Insert`
  (only `title` required, the rest optional), `Update` (all optional), `Relationships` (the FK to `users`).
  If `Functions` lists `todos_set_updated_at`, ignore it: nobody can call it (section 5). The
  generated `Insert`/`Update` types **do not reflect the column grants**: they allow `user_id`, `id`, `done`,
  `created_at`. The API's zod `strictObject` whitelist (title only on create; title/done on change) is what
  must match section 4, never the generated types.

## Handoff notes

- **For db-builder:** write section 9 verbatim (comments may be reworded, but never add the table-emptying word
  or `drop`/`rename`/`delete from`). Tests per section 7. Run `npx supabase db lint` (expect no errors; the
  function has a fixed `search_path`).
- **For backend-dev:**
  - Trim with JS `trim()` (zod `.trim()` does the same), then count code points (`[...s].length`), as you
    proposed. Any title you store passes the DB; a DB `23514` therefore means an API bug: map it to 500
    `internal_error`, not 400, and log it (without the body).
  - Create sends only `{ title }`; change sends only `{ title?, done? }`. Sending any other column gets `42501`
    from the DB (PostgREST: 403), which would also be a bug behind your 400 whitelist.
  - List: `.select('id, title, done, created_at').order('created_at', { ascending: false }).order('id', {
    ascending: false })`. Don't filter by `user_id` in code for security (RLS does it); adding it is harmless.
  - Not-yours and not-found are both 0 rows for select/update/delete under RLS: use `.select()` on
    update/delete and treat an empty result as 404 (AC22, AC44).
  - Types: section 11.
- **For security (threat model):** please confirm or overturn: (1) the two-constraint title rule instead of the
  single `char_length(btrim(title))` check (section 1); (2) RLS enabled but not forced (section 3);
  (3) column-level grants as the primary `user_id` guard, RLS `with check` second, no trigger (section 5);
  (4) no table grants to `service_role` (it keeps task 1's default four).
- **For qa-test / product-spec (wording):** AC30 says the DB rejects a foreign `user_id` via "RLS `with
  check`". With this design the first rejection is the column privilege (`42501 permission denied for table
  todos`; PostgREST returns 403 to a signed-in user), and RLS `with check` is the second layer (pgTAP M4 proves
  it on its own). The AC's outcome holds (rejected, no row owned by B); only the named mechanism differs.
  AC39 (anon): PostgREST returns 401 for `anon` on a `42501`, with no data.
- **For devops-cicd / git-release:** first real table; the post-deploy read-only queries are in section 10.
- **Guessed / not verified:** pg-delta's handling of column-level grants in the drift diff (section 10); that
  production's `service_role` default on new tables is `Dxtm` like local (task 1 says so, not re-checked);
  that a hosted `delete from auth.users` by GoTrue cascades exactly as the local `supabase_auth_admin` run did.

# Task 2a threat model: revoke EXECUTE on future functions created by `postgres`

Author: security (Design), 2026-11-25. Fresh context. Inputs: `tasks/2a/TASK_BRIEF.md` (with the person's
answers), `tasks/decisions.md` (Task 2 entry), `specs/1/schema.md`, `specs/1/security-gate.md` (follow-ups 1 and 3),
`supabase/migrations/*.sql`, `supabase/tests/01_default_privileges_test.sql`, `rules/security-baseline.md`.
`specs/2a/schema.md` does not exist yet; the sign-off below states what it must contain.
No Supabase cloud or production access was used.

## Scope decided by the person (Q1, Q2)

One migration with a **global** default-privilege change (no `IN SCHEMA`) for **role `postgres` only**:
future functions and procedures that `postgres` creates in **any schema** don't get `EXECUTE` for `PUBLIC`,
`anon` or `authenticated`. Every later function migration grants `EXECUTE` explicitly.

Expected shape (db-architect confirms the exact SQL in schema.md):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "authenticated";
```

The `anon` and `authenticated` lines are no-ops against Postgres' built-in global default (those roles only got
EXECUTE through `PUBLIC`), but they are required anyway: they make the intent explicit and stay correct if a
global grant to them exists or appears in production.

## Assets

| Asset | Who may access it |
|-------|-------------------|
| Every function/procedure a migration (role `postgres`) creates later, in `public` (exposed as `/rest/v1/rpc/<name>`) or any other schema | Only the roles its migration grants `EXECUTE` to explicitly. The owner (`postgres`) always. |
| Future `SECURITY DEFINER` functions (run with the owner's rights, bypass RLS) | Only the role(s) named in the brief of the task that adds them; never `anon` by accident |
| Data behind those functions (future `todos` rows, auth-linked data) | Per RLS and per-function checks; this task adds none |

No tables, rows, routes, env vars, client code, uploads or AI tools are touched.

## Threats this task closes

1. **Accidental RPC exposure:** a function created in `public` is callable by `anon` and `authenticated` through
   PostgREST as soon as it exists, because Postgres grants `EXECUTE` to `PUBLIC` by default (confirmed in task 1's
   gate: `proacl = NULL`, `has_function_privilege('anon', ..., 'EXECUTE') = true`). A per-schema default can't remove it.
2. **Privilege escalation through `SECURITY DEFINER`:** an admin or helper function that bypasses RLS becomes
   world-callable by default (rows 1 and 14).
3. **Same gap outside `public`:** a function in a non-exposed schema (for example a future `private` schema) is
   still callable by any SQL session of an API role, e.g. from an RLS policy, a view or another function.

## What the global revoke must NOT break (and why it doesn't)

| Concern | Effect | Why / what to do |
|---------|--------|------------------|
| Existing Supabase functions (`auth.uid()`, `auth.jwt()`, `storage.*`, `realtime.*`, `graphql_public.graphql`, `extensions.*`, `vault.*`) | **None** | Default privileges apply only to objects created **after** the change, and only to objects whose creator is `postgres`. Those functions already exist and are owned by Supabase roles (`supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, ...). RLS policies that call `auth.uid()` keep working. |
| Functions in production today | **None** | Migrations define no functions (`grep` of `supabase/migrations/` finds none). No existing object's ACL changes. |
| `service_role` | Loses implicit `EXECUTE` on **future** `postgres` functions in other schemas too (it only had it via `PUBLIC`; task 1 already revoked it per-schema in `public`) | Server code calling a future RPC with the service key needs an explicit `grant execute ... to service_role`. Intended (least privilege). |
| Other internal roles (`supabase_auth_admin`, `authenticator`, `supabase_storage_admin`, ...) | Lose implicit `EXECUTE` on **future** `postgres` functions | Any future function they must call needs an explicit grant. Known case: an Auth hook (`[auth.hook.custom_access_token]`, `[auth.hook.before_user_created]` in config.toml) needs `grant execute on function <hook> to supabase_auth_admin;` and stays revoked from `PUBLIC`, `anon`, `authenticated`. |
| Extensions added later by a migration (`create extension ...` run as `postgres`) | Functions the extension script creates as `postgres` get **no** `EXECUTE` for `PUBLIC` or API roles | The migration that adds the extension grants `EXECUTE` on exactly the functions the app needs, and its pgTAP test checks them. If an extension's objects end up owned by a Supabase-managed role instead, this default doesn't apply to them; the task states who owns the created functions (check `pg_proc.proowner`) and their ACLs. Keep extensions in schema `extensions`, never `public` (task 1 gate follow-up 3). |
| Functions used inside RLS policies, column defaults, views or check constraints (non-`SECURITY DEFINER`) | Run with the **caller's** rights, so the caller needs `EXECUTE` | Without a grant, every query by `authenticated` on that table fails with `permission denied for function`. The migration that adds such a helper grants `EXECUTE` to exactly the roles that query the table. |
| Trigger functions | **None at fire time** | `EXECUTE` on a trigger function is checked when `CREATE TRIGGER` runs (as `postgres`, the owner), not when the trigger fires. Don't grant trigger functions to API roles. |
| `pg_cron` jobs or other code running as `postgres` | **None** | The owner keeps `EXECUTE`. |
| pgTAP in tests | Possible false result | If pgTAP's functions are created by `postgres` after the revoke (`create extension if not exists pgtap` in a test), API roles can't call pgTAP functions. Assertions must run as `postgres` (see T3). |
| Drift check | Unknown | The drift check compares schema `public`; a global default ACL row has `defaclnamespace = 0`. See Questions. |

Residual risk (accepted by the person's Q2, recorded here): functions created by roles other than `postgres`
(e.g. `supabase_admin` through the platform or an extension) still get the built-in `PUBLIC` `EXECUTE`. The task 1
gate also saw `supabase_admin` default ACLs in `public` that grant the API roles `X` on functions it creates.
Mitigation: keep extensions out of `public`; every task that adds an extension checks the resulting function ACLs.

## SECURITY DEFINER rules for every future function migration (binding; code-reviewer and the gate check them)

1. Prefer `SECURITY INVOKER` (the default). Use `SECURITY DEFINER` only when the brief says why RLS must be bypassed.
2. A `SECURITY DEFINER` function sets a fixed search path in its definition: `set search_path = ''`, and
   schema-qualifies every object (`public.todos`, `auth.uid()`, `pg_catalog.now()`). Never rely on the caller's
   `search_path` (prevents object shadowing through `pg_temp` or a planted object). Supabase's advisor flags
   `function_search_path_mutable`.
3. A `SECURITY DEFINER` function that is not meant to be an RPC lives in a schema that is **not** in `[api] schemas`
   (e.g. a `private` schema whose migration revokes all on it from `PUBLIC`, `anon`, `authenticated`), so PostgREST
   never exposes it.
4. Grants are explicit in the same migration, even though the default now revokes them (belt and braces against
   drift or a later default change):
   `revoke execute on function <schema>.<fn>(<args>) from public, anon, authenticated;`
   then `grant execute on function <schema>.<fn>(<args>) to <the one intended role>;`
5. Inside the function: authorize from `auth.uid()` / `auth.jwt()`, never from an argument (no trusted `user_id`
   parameter); no dynamic SQL built from arguments (use `format()` with `%I`/`%L` if dynamic SQL is unavoidable);
   return only rows the caller may see.
6. The owner is `postgres` (the migration role). Never `alter function ... owner to` a more privileged role.
7. Each function migration ships a pgTAP test asserting `has_function_privilege` for `anon`, `authenticated` and
   `service_role` (true only where granted) and one call as a non-granted role failing with `42501`.

## Baseline rows

| # | Applies? | Required control | Owner | Abuse test (who writes it) |
|---|----------|------------------|-------|---------------------------|
| 14 Query your database | **Yes** | The migration above: the global default for role `postgres` revokes `EXECUTE` on functions from `PUBLIC`, `anon`, `authenticated`. Idempotent, creates no objects. | db-architect (spec), db-builder (migration) | db-builder, pgTAP, new file in `supabase/tests/` (e.g. `02_function_privileges_test.sql`): T1-T5 and idempotence below |
| 1 `/admin` | **Yes** (preventive) | Same control: a future admin or `SECURITY DEFINER` function isn't callable by `anon`/`authenticated` unless a migration grants it; plus the SECURITY DEFINER rules above for later tasks | security (rules), db-builder (migration) | T2 and T3 (including the `SECURITY DEFINER` probe), T4 |
| 2 IDOR | Not changed by this task | No table or function is exposed. Rule 5 above applies to future functions. | db-architect | none in this task |
| 8 Admin at signup | Not changed | No roles or metadata touched | db-architect, security | none in this task |
| 3, 5, 9, 11, 13 | Not changed by this task | The rows apply to the project; this diff touches no client code, inputs, auth config, headers or secrets (9 and 11 are task 2b) | per baseline | none in this task |
| 4, 6, 7, 10, 12 | **N/A (confirmed)** | Project-level N/A in `PROJECT_CONTEXT.md`: no prices (4), no payments (6), no single-use items (7), no AI/LLM (10), no uploads (12). Security confirms these for the pilot scope; a brief that adds one of them reopens the row. | security | none |

## Abuse tests (db-builder writes; pgTAP; one transaction, rolled back)

Create probes **as `postgres`** inside the transaction, with **no** grant:
`public.t2_probe()` (`language sql`, `select 1`), `public.t2_probe_definer()` (`security definer`,
`set search_path = ''`), and a function in a second schema created in the test (e.g. `create schema t2_other;`,
`t2_other.t2_probe()`), to prove the change is global.

- **T1 (AC1):** `pg_default_acl` has a row with `defaclrole = 'postgres'::regrole`, `defaclnamespace = 0`,
  `defaclobjtype = 'f'`, and `aclexplode(defaclacl)` shows no grantee `0` (`PUBLIC`), `anon` or `authenticated`
  with `EXECUTE`.
- **T2 (AC2, the abuse case):** `has_function_privilege` for `anon` and for `authenticated` with `'EXECUTE'` is
  `false` on `public.t2_probe()`, `public.t2_probe_definer()` and `t2_other.t2_probe()`. Also `false` for
  `service_role` (documents the intended effect). `true` for `postgres`.
- **T3 (AC2, behavioral):** as `anon`, then as `authenticated`, calling `public.t2_probe()` and
  `public.t2_probe_definer()` fails with SQLSTATE **`42501`** and a message naming the probe function. Write it so
  the pgTAP function itself runs as `postgres`, for example
  `select throws_ok($q$ set local role anon; select public.t2_probe() $q$, '42501', 'permission denied for function t2_probe', '<description>');`
  (the role change is undone when the failed subtransaction rolls back). Asserting the code **and** the message is
  required: a bare "throws" could pass only because pgTAP isn't executable by `anon`, which would hide a broken
  control. After these assertions, assert `current_user = 'postgres'`, so a leaked role switch can't make later
  tests lie.
- **T4 (AC3, explicit grants still work):** `grant execute on function public.t2_probe() to authenticated;` then
  `authenticated` can call it (`lives_ok`, same pattern as T3) and `has_function_privilege('anon', ..., 'EXECUTE')`
  is still `false`.
- **T5 (AC4):** `supabase/tests/01_default_privileges_test.sql` passes unchanged; the gap documented in
  `specs/1/schema.md` test item 6 is now asserted by T2.
- **Idempotence (AC5):** running the migration's statements a second time inside the transaction leaves the
  `pg_default_acl` rows for `postgres` unchanged (ACL text before = after).

The gate will run a negative control: with the global revoke undone inside a transaction, T1, T2 and T3 must fail.
A test that passes without the migration is a gate FAIL.

## Auth rules

No routes, pages or sessions in this task. Database rule from now on: an API role can call a function only if a
migration grants it explicitly; PostgREST returns a permission error for `/rest/v1/rpc/<name>` on any ungranted function.

## Sign-off note for db-architect: `specs/2a/schema.md` must contain

1. The exact SQL statements (global, `FOR ROLE "postgres"`, no `IN SCHEMA`), and that `ON FUNCTIONS` covers
   procedures too.
2. The affected creator role (`postgres` only) and schemas (all, through `defaclnamespace = 0`), and the explicit
   statement that no existing function changes (none exist in migrations; Supabase's functions are owned by other roles).
3. The interaction with task 1's per-schema row for `public` (`{postgres=X/postgres}`): per-schema defaults are
   added on top of the global one, so the effective default for new functions in `public` is owner-only.
4. The "must not break" table above in db-architect's words, at least: `service_role` and internal roles
   (`supabase_auth_admin` for Auth hooks) now need explicit grants; helper functions used in RLS policies, defaults
   or views need a grant to the querying role; trigger functions need none; extensions added later need explicit
   grants and an owner check.
5. The updated binding convention (extends task 1's): every function migration revokes from `PUBLIC, anon,
   authenticated` and grants to the intended role explicitly, with a pgTAP test; plus the SECURITY DEFINER rules above.
6. Production effect: on apply, the global default ACL for `postgres` functions changes and nothing else; rollback is
   a new migration re-granting `EXECUTE` to `PUBLIC`. Not destructive.
7. The answer to the drift question below.
8. The test list T1-T5 + idempotence above (db-architect may rename tests, not drop assertions).

Sign-off on db-architect's privileges spec: once schema.md has items 1-8 consistent with this model, **matches**.
Today: **changes needed: schema.md not written yet**.

## Questions (db-architect answers in schema.md; to the person only if it can't be determined)

1. **Drift visibility:** does the drift check (schema `public`) report a global default ACL row
   (`defaclnamespace = 0`)? If not, a production missing this change would not show as drift; then the post-deploy
   check (AC8) must read `pg_default_acl` where `defaclnamespace = 0` in production read-only, and the person should
   know the drift check doesn't cover it.
2. **Production starting state:** production's current global default for `postgres` functions isn't known from
   the repo. The migration is idempotent either way; the AC8 read-only check confirms the end state.

# Task 2a schema spec: revoke EXECUTE on future functions created by `postgres` (global default)

Author: db-architect, 2026-11-25. Fresh context. Inputs: `tasks/2a/TASK_BRIEF.md` (with the person's answers
Q1: global, Q2: role `postgres` only), `specs/2a/threat-model.md` (security; final say on access rules),
`specs/1/schema.md`, `supabase/migrations/*.sql`, `supabase/tests/01_default_privileges_test.sql`,
`.github/workflows/drift.yml`, `tasks/incidents/2026-11-25-drift.md`, `npx --no-install supabase db diff --help`
(CLI 3.2.0) and the CLI 3.2.0 bundle in `node_modules/@supabase/cli-windows-x64`. Local DB read only with
`SELECT` (no reset, no writes). No Supabase cloud or production access was used.

## Scope

Default privileges only: what roles get on **functions and procedures that role `postgres` creates later, in
any schema**. No table, column, sequence, function, policy, trigger, index, bucket or data is created or changed.

Template sections that don't apply:

1. Tables and columns: N/A, no tables.
2. Keys and uniqueness: N/A, no tables.
3. RLS: N/A, no tables (the rule for future function helpers used in RLS is in "Must not break").
4. Roles and permissions: N/A for role storage (no user roles touched); privilege design is the whole spec below.
5. Server-computed values: N/A.
6. Indexes: N/A.
7. Storage: N/A, no buckets (the schema `storage` matters only as an exception, see "Scope limits").
8. Destructive plan: N/A, not destructive (only future objects are affected; rollback below).

## 1. The exact SQL (sign-off item 1)

One new migration, created with `npx supabase migration new revoke_function_execute_defaults` (db-builder may
pick another `<what>`), containing exactly these three statements and comments only:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "authenticated";
```

- **No `IN SCHEMA`**: this writes the *global* default row for role `postgres` (`pg_default_acl` row with
  `defaclnamespace = 0`, `defaclobjtype = 'f'`).
- **`ON FUNCTIONS` covers procedures too.** In Postgres default privileges, `FUNCTIONS` and `ROUTINES` are the
  same object class (`defaclobjtype = 'f'`); it applies to functions, procedures and aggregates.
- **Resulting global row:** `{postgres=X/postgres}` (owner only). Postgres' built-in default for functions is
  `{=X/postgres, postgres=X/postgres}`; line 1 removes the `PUBLIC` entry (`=X`), so the row differs from the
  built-in one and is stored.
- **Lines 2 and 3 are no-ops today** (anon and authenticated have no global entry; they only got EXECUTE through
  `PUBLIC`). Kept on security's instruction: they state the intent and stay correct if a global grant to them
  exists in production or appears later.
- **Idempotent:** a second run finds no `PUBLIC`, `anon` or `authenticated` entry to remove and leaves the row
  as `{postgres=X/postgres}`. No `IF EXISTS` is needed.
- **`service_role` is deliberately not named:** it never had a global entry of its own, so after line 1 it has
  no default EXECUTE on `postgres` functions in any schema except where a per-schema row grants it (see below).
- **Don't write the word for the table-emptying privilege in the migration, not even in a comment** (verify.sh's
  destructive scan, lessons L15). The three statements above don't contain it.
- Who may run it: the role running migrations must be `postgres` or a member of it (`FOR ROLE "postgres"`). Same
  requirement as task 1's migration, which uses the same form.

## 2. Affected creator role and schemas; existing functions (sign-off item 2, AC6)

- **Creator role:** `postgres` only (the person's Q2). Functions created by any other role (`supabase_admin`,
  `supabase_auth_admin`, `supabase_storage_admin`, ...) keep the built-in `PUBLIC` EXECUTE. Residual risk
  accepted by the person and recorded in the threat model.
- **Schemas:** every schema, through `defaclnamespace = 0` (the person's Q1), with the per-schema exceptions in
  "Scope limits" below.
- **Existing functions: none change.** Default privileges are applied only when a function is created, never
  retroactively. The migrations define no functions (`grep` finds none). The local DB has **0 functions owned
  by `postgres`** outside `pg_catalog`/`information_schema` (read-only query, per schema: auth 4, extensions 55,
  graphql_public 1, pgbouncer 1, realtime 19, storage 24, supabase_functions 1, vault 5, all owned by other
  roles). So `auth.uid()`, `auth.jwt()`, `storage.*`, `realtime.*`, `graphql_public.graphql`, `extensions.*` and
  `vault.*` keep their ACLs, and RLS policies calling `auth.uid()` keep working.

## 3. How it combines with task 1's `IN SCHEMA public` rows (sign-off item 3)

How Postgres computes the ACL of a new function (`CREATE FUNCTION`, creator R, schema S):

1. Start from the **global** row for (R, functions) in `pg_default_acl` (`defaclnamespace = 0`). If there is
   none, use the built-in default `acldefault('f', R)` = `{=X/R, R=X/R}` (owner and `PUBLIC`).
2. If a **per-schema** row for (R, S, functions) exists, **add** its entries to the result (merge). A per-schema
   row can only add privileges; it can never remove one the global row gives. That is why task 1's
   `IN SCHEMA public REVOKE ... FROM anon/authenticated/service_role` could not remove `PUBLIC`'s EXECUTE.
3. If the result equals the built-in default, `pg_proc.proacl` is stored as `NULL` (which means the built-in
   default, i.e. `PUBLIC` can execute). This is what task 1's gate saw (`proacl = NULL`).

The CLI 3.2.0 diff engine (pg-delta, bundled) encodes the same model in its comments: "PER-SCHEMA row: Postgres
ALWAYS re-adds the owner's acldefault entry at object-creation time" and "GLOBAL row ... Postgres uses the stored
acl VERBATIM at creation".

Local state today (read-only `SELECT` on `pg_default_acl`, role `postgres`, functions): no global row;
`public` = `{postgres=X/postgres}` (task 1); `storage` = `{postgres=X, anon=X, authenticated=X, service_role=X}`
(Supabase image).

Effective ACL of a new function created by `postgres`:

| Schema | Before this task | After this task |
|---|---|---|
| `public` | built-in `{=X, postgres=X}` + task 1 row `{postgres=X}` = **`PUBLIC` can execute** (so anon, authenticated, service_role can) | global `{postgres=X}` + task 1 row `{postgres=X}` = **owner only** |
| another schema with no per-schema row for `postgres` (e.g. a future `private`, or `t2_other` in the test) | built-in `{=X, postgres=X}` = `PUBLIC` can execute | global `{postgres=X}` = **owner only** |
| `storage` (has a `postgres` per-schema row granting X) | `PUBLIC` + anon, authenticated, service_role | global `{postgres=X}` + storage row = **anon, authenticated, service_role still get X** (exception, see below) |

### Scope limits (what the global revoke does not cover)

- **Per-schema rows that grant.** Any per-schema row for `postgres` that grants EXECUTE (today: `storage`
  locally) still adds it, because per-schema rows are merged on top. Production's per-schema rows outside
  `public` aren't visible to the drift check (it diffs `public` only), so whether production has the same
  `storage` row isn't known from the repo. Migrations never create functions in `storage` (a Supabase-managed
  schema), so this has no effect today. See Question 1 for security.
- **Other creator roles** (Q2, accepted residual risk).
- **Existing functions** (by design).

## 4. Must not break (sign-off item 4)

| Concern | Effect | What a later migration must do |
|---|---|---|
| Supabase's own functions (`auth.*`, `storage.*`, `realtime.*`, `graphql_public.*`, `extensions.*`, `vault.*`) | None | Nothing. They exist already and are owned by other roles. |
| Functions in production today | None | Nothing. Migrations define none. |
| `service_role` | Loses implicit EXECUTE on future `postgres` functions in **every** schema (in `public` it already had none since task 1) | Server code calling a future RPC with the service key needs `grant execute on function <schema>.<fn>(<args>) to service_role;` |
| Internal roles (`supabase_auth_admin`, `authenticator`, `supabase_storage_admin`, ...) | Lose implicit EXECUTE on future `postgres` functions | Grant explicitly. Known case: an Auth hook needs `grant execute on function <hook>(<args>) to supabase_auth_admin;` and stays revoked from `PUBLIC`, `anon`, `authenticated`. |
| Helper functions called inside RLS policies, column defaults, views or `CHECK` constraints (`SECURITY INVOKER`) | They run with the caller's rights, so the caller needs EXECUTE; without a grant every query by that role on the table fails with `permission denied for function` | The same migration grants EXECUTE on the helper to exactly the roles that query the table (usually `authenticated`), and its pgTAP test runs one query as that role. |
| Trigger functions | None at fire time (EXECUTE is checked at `CREATE TRIGGER`, run by the owner `postgres`) | Don't grant trigger functions to API roles. |
| `pg_cron` jobs and other code running as `postgres` | None (owner keeps EXECUTE) | Nothing. |
| Extensions added later (`create extension` run as `postgres`) | Functions the extension creates **as `postgres`** get owner-only EXECUTE; if the platform creates them as another role (local: every extension is owned by `supabase_admin`), this default doesn't apply | The migration that adds the extension states who owns the created functions (`pg_proc.proowner`), checks their ACLs, grants EXECUTE on exactly the functions the app needs, and its pgTAP test checks them. Extensions go in schema `extensions`, never `public`. |
| pgTAP in tests (`create extension if not exists pgtap with schema extensions` inside each test) | If its functions end up owned by `postgres`, API roles can't call pgTAP functions | Assertions run as `postgres`; role switches happen only inside the SQL string passed to `throws_ok`/`lives_ok` (T3, T4). |
| Task 1 assertions (`01_default_privileges_test.sql`) | None: they check tables, sequences and the `public` default rows, all unchanged; the test runs as `postgres` | Must pass unchanged (T5). |
| Drift check | One expected transient red between merge and the integration applying the migration (the repo has the row, production not yet) | Section 7. |

## 5. Grant convention for every later function migration (sign-off item 5; binding, extends task 1's)

Every migration that creates a function or procedure, in any schema:

1. Revokes and grants explicitly, in the same migration, right after `create function` (belt and braces, even
   though the default now revokes):
   ```sql
   revoke execute on function <schema>.<fn>(<arg types>) from public, anon, authenticated;
   grant execute on function <schema>.<fn>(<arg types>) to <the one intended role>;
   ```
   Nothing to `anon` unless the brief says anonymous access is intended; `service_role` and internal roles
   (e.g. `supabase_auth_admin` for hooks) only when named in the brief.
2. Ships a pgTAP test asserting `has_function_privilege` for `anon`, `authenticated` and `service_role` (true only
   where granted) and one call as a non-granted role failing with SQLSTATE `42501`.
3. Follows security's SECURITY DEFINER rules (threat model, rules 1-7): `SECURITY INVOKER` by default;
   `SECURITY DEFINER` only with a written reason, `set search_path = ''` and schema-qualified names; non-RPC
   definer functions in a schema not listed in `[api] schemas` (e.g. `private`, whose migration revokes all on the
   schema from `PUBLIC`, `anon`, `authenticated`); authorize from `auth.uid()`/`auth.jwt()`, never from an
   argument; no dynamic SQL from arguments (`format()` with `%I`/`%L` if unavoidable); owner stays `postgres`.
4. Helper functions used by RLS policies, defaults, views or constraints: grant to the roles that query the table
   (section 4).
5. Never creates functions in Supabase-managed schemas (`auth`, `storage`, `realtime`, `extensions`, `vault`,
   `graphql`, `graphql_public`, `supabase_functions`), and never adds an
   `ALTER DEFAULT PRIVILEGES ... IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS`. Code-reviewer and the gate reject a
   migration that does either (security's sign-off, Q1 decision; T6 guards the second part).

Task 1's convention for tables and sequences (explicit grants plus pgTAP) is unchanged.

## 6. Production effect and rollback (sign-off item 6)

- **On apply** (Supabase integration, from `main`): production gets the global default row for `postgres`
  functions, `{postgres=X/postgres}`. Nothing else changes: no existing object's ACL, no data, no per-schema row.
- **Production starting state:** not directly known from the repo (threat model Q2). Indirect evidence: the first
  drift diff (incident report) contained only `IN SCHEMA "public"` statements, and the CLI's diff engine
  extracts global rows for `postgres` (section 7), so production most likely has no global `postgres` function
  row today, like local. The migration is idempotent either way; the post-deploy check confirms the end state.
- **Not destructive.** No `DROP`, `RENAME`, data change or table-emptying statement.
- **Rollback:** a new migration (never edit this one):
  ```sql
  ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
  ```
  That makes the global row equal to the built-in default, so Postgres deletes it. No re-grant to `anon`/
  `authenticated` is needed (they never had a global entry). Functions created while the revoke was active keep
  their ACLs; changing those needs per-function grants.

## 7. Drift answer (sign-off item 7; threat model Q1, brief handoff note)

**Question:** does `supabase db diff --remote --schema public` (drift.yml, `DRIFT_SCHEMAS: public`) report a
global default ACL row (`defaclnamespace = 0`)?

**Answer: very likely yes, from the CLI's code; not proven by a run.** Evidence (CLI 3.2.0, as pinned):

- `supabase/config.toml` has `[experimental.pgdelta] enabled = true`, and the CLI says `--use-pg-schema` is
  "Removed: use the default pg-delta engine or --use-migra instead", so `db diff` without an engine flag
  (drift.yml passes none) uses the bundled pg-delta engine.
- pg-delta's default-privileges query in the bundle selects
  `WHERE d.defaclnamespace = 0 OR (<schema filter>)`, with the comment "keep only the GLOBAL rows and those on
  schemas the schema family extracts". So global rows are extracted regardless of `--schema`.
- When it builds the diff, a default-privilege fact is skipped for schema filtering only if it has a schema
  (`if (schema != null) { ...skip if the schema isn't included... }`); a global row has schema `null` and stays.
- Its Supabase filter excludes default privileges whose **creating role** is a platform role (`supabase_admin`,
  `supabase_auth_admin`, `anon`, `authenticated`, `service_role`, ...). `postgres` is not in that list, so
  `postgres`'s global row is kept. (The `postgres` *role itself* is excluded as an object, not its default ACLs.)

What this means:

- If production lacks the change, drift would show an unscoped
  `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" ...` statement and go red. Expected once, between merge and the
  integration applying the migration; green after.
- Not established: an actual run of the diff with a differing global row (that would need a write to a
  database, which this role doesn't do). So the AC8 post-deploy check does **not** rely on the drift check alone.

**Required read-only post-deploy check (AC8; git-release in post-deploy verification, or the person; `SELECT`
only, no writes):**

```sql
select defaclrole::regrole, defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 0 and defaclrole = 'postgres'::regrole;
-- expected: exactly one row: postgres | f | {postgres=X/postgres}

select defaclnamespace::regnamespace, defaclacl
from pg_default_acl
where defaclrole = 'postgres'::regrole and defaclobjtype = 'f' and defaclnamespace <> 0
order by 1;
-- expected: public | {postgres=X/postgres}; record every row in the handoff
```

Security's rule for the second query: any production per-schema `postgres` function row other than `public` and
`storage`, or a `storage` row that differs from local (`{postgres=X, anon=X, authenticated=X, service_role=X}`),
goes to security before the task is marked done.

Plus: production migration history lists the new migration, and a default drift run is green.

## 8. Test list for db-builder (sign-off item 8)

New file, e.g. `supabase/tests/02_function_privileges_test.sql`; same pattern as `01_default_privileges_test.sql`
(`begin; create extension if not exists pgtap with schema extensions; ... rollback;`). Create the probes **as
`postgres`**, inside the transaction, with **no** grant:

- `public.t2_probe()` returns int, `language sql`, `select 1`
- `public.t2_probe_definer()` returns int, `language sql`, `security definer`, `set search_path = ''`, `select 1`
- `create schema t2_other;` and `t2_other.t2_probe()` (same body), to prove the change is global
- `public.t2_probe_proc()`: `create procedure public.t2_probe_proc() language sql as $$ select 1 $$`, to prove
  `ON FUNCTIONS` covers procedures

Assertions (names may change; none may be dropped):

- **T1 (AC1):** `pg_default_acl` has a row with `defaclrole = 'postgres'::regrole`, `defaclnamespace = 0`,
  `defaclobjtype = 'f'`; `aclexplode(defaclacl)` has no entry with EXECUTE for grantee `0` (`PUBLIC`), `anon` or
  `authenticated`. **And** the row's ACL is exactly `{postgres=X/postgres}` (`defaclacl::text =
  '{postgres=X/postgres}'`, or the `aclexplode` equivalent: exactly one entry, grantee `postgres`, privilege
  EXECUTE, grantor `postgres`). This fails if the owner loses EXECUTE or any other role gets a global grant; same
  expected value as the AC8 production check.
- **T2 (AC2):** `has_function_privilege(<role>, <fn>, 'EXECUTE')` is `false` for `anon`, `authenticated` and
  `service_role` on `public.t2_probe()`, `public.t2_probe_definer()`, `t2_other.t2_probe()` and the procedure
  `public.t2_probe_proc()`, and `true` for `postgres` on all four. (This replaces task 1's test item 6, which only
  documented the gap. No `call` as `anon` is needed for the procedure; T3 covers the behavioral case.)
- **T3 (AC2, behavioral):** as `anon`, then as `authenticated`, calling `public.t2_probe()` and
  `public.t2_probe_definer()` fails with SQLSTATE `42501` **and** the message
  `permission denied for function t2_probe` / `... t2_probe_definer`, using
  `throws_ok($q$ set local role anon; select public.t2_probe() $q$, '42501', '<message>', '<description>')`
  so pgTAP itself runs as `postgres`. Then assert `current_user = 'postgres'`.
- **T4 (AC3):** `grant execute on function public.t2_probe() to authenticated;` then
  `lives_ok($q$ set local role authenticated; select public.t2_probe() $q$, ...)`, and
  `has_function_privilege('anon', 'public.t2_probe()', 'EXECUTE')` is still `false`. Assert
  `current_user = 'postgres'` afterwards.
- **T5 (AC4):** `supabase/tests/01_default_privileges_test.sql` passes unchanged (no edit to that file).
- **Idempotence (AC5):** save `defaclacl::text` of every `pg_default_acl` row for `postgres`, run the migration's
  three statements again inside the transaction, assert the saved values equal the new ones (same row count).
- **Negative control (security's gate):** with the global revoke undone inside a transaction
  (`ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;`), T1, T2 and T3 must fail.
  db-builder runs it once locally and records the result in the handoff; it isn't committed as a passing test.
- **T6 (required; security's Q1 decision):** no `pg_default_acl` row with `defaclrole = 'postgres'::regrole`,
  `defaclobjtype = 'f'`, `defaclnamespace <> 0` and a schema other than `storage` (exact name match, not
  "Supabase-managed schemas" in general) has an `aclexplode(defaclacl)` entry with EXECUTE for grantee `0`
  (`PUBLIC`), `anon`, `authenticated` or `service_role`. This catches a later migration that re-opens the gap with
  an `IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS`. T6 is a per-schema guard: in the negative control it is expected
  to still pass.

Also: AC5 checks that the migration creates no objects (the probes exist only in the test transaction).

## Questions for security (security has the final say)

**Answered** in `specs/2a/threat-model.md`, "Sign-off on schema.md (2026-11-25)": Q1 option (a), with T6
required (grantees including `service_role`, exception exactly `storage`) and convention rule 5 extended; Q2 yes,
with T1 checking the exact row. Both are applied above, plus the procedure probe in T2. Original questions kept
for the record:

1. **`storage` exception to "any schema".** Locally, role `postgres` has a per-schema default in `storage` that
   grants EXECUTE on functions to `anon`, `authenticated` and `service_role`. Per-schema rows are merged on top of
   the global one, so the global revoke does not stop a `postgres`-created function in `storage` from being
   callable by API roles. Options: (a) accept it, rely on convention rule 5 (no function migrations in
   Supabase-managed schemas) and add the proposed T6 guard; (b) also add
   `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" REVOKE EXECUTE ON FUNCTIONS FROM "anon", "authenticated", "service_role";`
   which changes a Supabase-managed default, is outside the brief's scope as written, and isn't covered by the
   drift check (schema `public` only). db-architect recommends (a). Security decides; if (b), the person must
   widen the scope.
2. **T1 owner assertion.** The spec adds "the `postgres` entry has EXECUTE" to T1, so a row that also removed
   the owner would fail. Confirm that's wanted.

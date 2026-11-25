# Task 2a: Revoke EXECUTE on future functions (all schemas, functions created by postgres) from PUBLIC, anon and authenticated

| Field | Value |
|-------|-------|
| State | IN_REVIEW |
| Owner role | db-architect (spec), db-builder (migration, pgTAP test) |
| Branch | `db/2a-function-privileges` |
| Worktree | `../wt-2a-db-builder` |
| Depends on | 1 (default privileges baseline, `specs/1/schema.md` follow-up "revoke EXECUTE from PUBLIC") |

The person's request (relayed by the orchestrator; task 2 was split into 2a = part (a) and 2b = parts (b), (c)):

> "TASK 2: security groundwork, before any login feature. (a) a migration revoking EXECUTE on future functions in public from PUBLIC, anon and authenticated (alter default privileges), with a pgTAP test; (b) security headers in next.config (CSP, X-Frame-Options/frame-ancestors, Referrer-Policy, X-Content-Type-Options, Permissions-Policy), plus a test that checks them; (c) auth defaults in supabase/config.toml for local and CI: minimum password length 10+, email confirmations on, rate limits, OTP expiry. Also a written checklist (in the brief's handoff) of the matching settings the person must set in the Supabase dashboard for production, because the dashboard isn't managed by migrations (custom SMTP, rate limits, CAPTCHA)."

## Goal

A function that a migration creates in schema `public` later on can't be called by `anon` or `authenticated`
(through the Data API / RPC or SQL) unless that migration grants `EXECUTE` explicitly. The database built from
`supabase/migrations` and production behave the same way.

## Acceptance criteria

- [ ] AC1: Given the migrations applied to an empty database (`npx supabase db reset`), when the default privileges for functions created by role `postgres` are inspected (`pg_default_acl`), then they give no `EXECUTE` on new functions in `public` to `PUBLIC`, `anon` or `authenticated`.
- [ ] AC2 (unhappy path): Given a function created in `public` by `postgres` inside a pgTAP test transaction, with no explicit grant, when `has_function_privilege` is checked for `anon` and for `authenticated`, then both are `false`; and when the test switches to role `anon` (and then `authenticated`) and calls the function, the call fails with a permission-denied error.
- [ ] AC3: Given the same probe function, when the migration owner grants `EXECUTE` on it to `authenticated` explicitly, then `authenticated` can call it and `anon` still can't (explicit grants still work; the convention from `specs/1/schema.md` holds).
- [ ] AC4: The task 1 assertions still pass unchanged (`supabase/tests/01_default_privileges_test.sql`), and the function-EXECUTE gap noted in task 1 (AC4 / schema.md test item 6) is now asserted instead of documented.
- [ ] AC5: The change is one new migration created with `npx supabase migration new <what>`; no migration that exists on `main` is edited; applying it twice changes nothing (idempotent); it creates no tables, functions or data.
- [ ] AC6: `schema.md` states which schemas and which creator role(s) the change affects, and whether any existing function (in `public` or elsewhere) changes (expected: none in `public`; migrations define no functions today). If the effect reaches beyond `public` (see Questions), schema.md lists what else is affected and security signs it off in the threat model.
- [ ] AC7: `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md` passes (DB reset, `npx supabase test db`, `npx supabase db lint`); security gate PASS; review APPROVE; CI green.
- [ ] AC8 (after the person merges): the Supabase integration applies the migration; production migration history shows it (read-only check) and a default drift run is green.

## Security rows that apply

Security confirms and fills in the abuse tests during Design.

- [ ] Row 14 (query your database): least privilege for API roles; abuse test: (security fills in; expected AC2)
- [ ] Row 1 (`/admin`): flagged for security to confirm: a later `security definer` or admin function must not be callable by `anon`/`authenticated` by accident; abuse test: (security fills in, or marks it not applicable to this task)

## Scope

**Allowed paths**

```
supabase/migrations/**
supabase/tests/**
specs/2a/**     # schema.md (db-architect), threat-model.md + security-gate.md (security), review.md (code-reviewer)
```

**Out of scope:**
- Any table, sequence, RLS policy, function body or seed data (no objects created outside the test transaction).
- Grants on existing objects, and default privileges for tables and sequences (task 1 covers them).
- Security headers, `next.config.*`, `supabase/config.toml` and auth settings (task 2b).
- Login UI, API routes, app code.
- Production: no dashboard, SQL editor or `execute_sql`/`apply_migration` by agents (AGENT_RULES §4); production changes only via the merged migration.

## Inputs

- Spec files: `specs/2a/schema.md` (db-architect), `specs/2a/threat-model.md` (security)
- Other: `specs/1/schema.md` ("Note" under resulting default privileges, test item 6, Follow-ups); `supabase/migrations/20261125135502_default_privileges_baseline.sql`; `supabase/tests/01_default_privileges_test.sql`; `tasks/1/TASK_BRIEF.md` AC4; `tasks/lessons.md` L14, L15; `rules/security-baseline.md` row 14.

## Destructive change?

- [x] No. `REVOKE ... EXECUTE` in default privileges only affects functions created later; no data, no drop, rename or truncate, and no existing object changes. Rollback is a new migration re-granting it. Note: verify.sh's destructive scan may flag privilege keywords (L15).
- [ ] Yes: step 1 (stop using it) is task ___; step 2 (drop) is this task. Backup step: ___. Person approved on: ___

## Questions for the person

1. **"In public" vs. all schemas.** task 1's AC4 records that Postgres grants `EXECUTE` on functions to `PUBLIC` through the global defaults, which per-schema (`IN SCHEMA public`) default privileges can't remove. If that holds, revoking it from `PUBLIC` likely means a default-privilege change for role `postgres` that applies to functions it creates in **every** schema, not only `public`. Is that acceptable? Or should it stay limited to `public` (which may mean an explicit per-function revoke convention instead)? db-architect confirms the technical facts in schema.md; the person decides the scope. Until then, AC1 to AC3 are written for `public` only.
2. **Which creator roles.** The request names no role. Task 1 changed defaults only for role `postgres` (the migration owner). Is `postgres` alone enough, or must functions created by other roles (for example ones Supabase uses for extensions) be covered too?

---


### Answers from the person (2026-11-25, recorded in tasks/decisions.md on the 2a branch)

- Q1: global revoke of EXECUTE on functions created by role `postgres` in **any schema**, from `PUBLIC`, `anon` and `authenticated` (no `IN SCHEMA`). Every function migration grants explicitly. ACs 1-3 apply to `public` and, through the global default, to every schema.
- Q2: role `postgres` only.
- Q3: a fixed CSP in `next.config` now; a nonce CSP with middleware in task 3.
- Q4: CAPTCHA off locally and in CI; Cloudflare Turnstile and the person's SMTP choice go on the production dashboard checklist (the person applies them).
- Auth checks in 2b: a static vitest test that parses `supabase/config.toml`, plus one manual live check on the local stack recorded in the Handoff (verify.sh runs tests before the DB starts; fixed separately in task 2c).

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/2a/TASK_BRIEF.md`, `tasks/board.md` (row 2a added).
- **Verified:** read `specs/1/schema.md`, the task 1 migration and test, `rules/security-baseline.md` rows 9, 11, 14. `grep` finds no function definitions in `supabase/migrations/`.
- **Left to do:** person answers the Questions; db-architect writes `specs/2a/schema.md`; security writes `specs/2a/threat-model.md`; orchestrator sets SPEC_READY.
- **Next role must know:** the drift check compares schema `public` only; db-architect should state whether a default-privilege change that isn't tied to a schema shows up in the drift diff and in production as expected.

### db-architect, 2026-11-25

- **Changed:** `specs/2a/schema.md` (commit 2fa3dd4), then edited for security's sign-off in `specs/2a/threat-model.md` (commit c084dc3):
  - T6 is now required: no per-schema `postgres` function default row outside schema `storage` grants EXECUTE to PUBLIC, anon, authenticated or service_role.
  - Convention rule 5 is extended: no functions in Supabase-managed schemas, and no `IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS`.
  - T1 asserts the global row is exactly `{postgres=X/postgres}`.
  - T2 adds the procedure probe `public.t2_probe_proc()`.
  - AC8 note: any production per-schema `postgres` function row other than `public`/`storage`, or a `storage` row that differs from local, goes to security.
- **Verified:** read-only SELECTs on the local DB (`pg_default_acl`, `pg_proc` owners, `pg_extension`); CLI 3.2.0 `db diff --help` and the bundled pg-delta code for the drift answer. No DB writes, no reset, no cloud access.
- **Left to do:** db-builder writes the migration and `supabase/tests/02_function_privileges_test.sql` per schema.md section 8 (T1-T6 and idempotence; the negative control is run once locally).
- **Next role must know:** answer to the drift question above: very likely yes. pg-delta (the default engine in CLI 3.2.0) reads `defaclnamespace = 0` rows whatever `--schema` is, but no run has proven it. So AC8 also needs the read-only `pg_default_acl` check in schema.md section 7. Per security's sign-off, schema.md now matches without another security review.

### db-builder, 2026-11-25

- **Changed:**
  - `supabase/migrations/20261125150215_function_privileges.sql` (new, from `npx --no-install supabase migration new function_privileges`): exactly schema.md section 1's three statements (`ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC / "anon" / "authenticated"`, no `IN SCHEMA`) plus comments. No existing migration edited. Creates no objects, no data.
  - `supabase/tests/02_function_privileges_test.sql` (new, `plan(30)`): T1 (3: global row exists; no EXECUTE for PUBLIC/anon/authenticated; `defaclacl::text = '{postgres=X/postgres}'`), T2 (16: anon/authenticated/service_role false and postgres true on `public.t2_probe()`, `public.t2_probe_definer()`, `t2_other.t2_probe()`, procedure `public.t2_probe_proc()`), T3 (5: four `throws_ok` 42501 with the exact `permission denied for function ...` messages, then `current_user = 'postgres'`), T6 (1: no per-schema postgres function row except `storage` grants EXECUTE to PUBLIC/anon/authenticated/service_role), idempotence (2: same row count and same `defaclacl` text for every postgres default ACL row after re-running the three statements), T4 (3: explicit grant, `lives_ok` as authenticated, anon still false, `current_user = 'postgres'`). T5 = `01_default_privileges_test.sql`, unchanged, passes.
  - One deviation in form, not in meaning: each T3 SQL string ends with `; reset role` (after the call). It only runs if a call wrongly succeeds; without it, a successful call leaves `set local role` in effect and the rest of the file runs as `anon`/`authenticated` (seen in the first negative-control run: T6 onward aborted with "permission denied to change default privileges", bad plan 25/30). See lessons L20.
- **Verified (under the shared lock):**
  - `npx --no-install supabase db reset`: all 3 migrations apply.
  - `npx --no-install supabase test db`: `Files=3, Tests=45`, Result PASS (00: 3, 01: 12, 02: 30).
  - `npx --no-install supabase db lint --level error --fail-on error`: no schema errors, exit 0.
  - `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md`: **`verify.sh: PASS 17/17 (1 skipped)`** (skip: `test:e2e`, no script). The destructive scan passed (no L15 false positive; the migration has no table-emptying privilege word).
  - **Negative control (run once, not committed):** a copy of the test in the session scratchpad with `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;` inserted right after `create extension` (inside the test's `begin ... rollback`, so nothing persists), run with `npx --no-install supabase test db <copy>`. Result FAIL, 21/30: **T1** tests 1 and 3 failed (row gone, `have: NULL`); **T2** all 12 API-role assertions failed; **T3** all 4 `throws_ok` failed ("caught: no exception"); idempotence (26, 27) and T4's anon check (29) failed too (expected: the re-run revoke recreates the row; anon gets EXECUTE through PUBLIC). **T6 (25) passed**, as schema.md expects. Test 2 (T1 "no forbidden entry") passes trivially when the row is missing; test 1 catches that case. Afterwards `supabase test db` again: 45/45 PASS (DB clean).
  - Line endings: no CR in either new file.
- **Left to do:** security gate (`specs/2a/security-gate.md`), code review (`specs/2a/review.md`), PR (git-release; not pushed by db-builder), CI green. After the person merges, AC8 (git-release post-deploy verification or the person, read-only): production migration history lists `20261125150215`; the two `SELECT`s on `pg_default_acl` in schema.md section 7 (expected: one global row `postgres | f | {postgres=X/postgres}`; per-schema rows recorded, anything other than `public` `{postgres=X/postgres}` and a `storage` row matching local goes to security); a default drift run is green (one red between merge and the integration applying the migration is expected).
- **Next role must know:** no types to regenerate (no tables or functions). The migration name is `function_privileges` (schema.md allowed another `<what>`).

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25

- Merged main (PR #8, PR #9) into this branch: it brought main's tasks/ docs, `scripts/verify.sh` and `specs/2c/**`; none are in this PR's net diff. This branch's lesson renumbered L17 → L20 (lesson-number collision, see L19).
- Review nit 6 (schema.md's T3/T4 pattern without `; reset role`) is left for the next function migration's db-architect, to keep this task's gates fresh; L20 records the safe pattern.

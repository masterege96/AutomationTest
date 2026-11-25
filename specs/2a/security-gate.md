Result: PASS

# Task 2a security gate: revoke EXECUTE on future functions created by `postgres`

Reviewer: security (Gate), 2026-11-25, fresh context, no builder context. Branch `db/2a-function-privileges`,
diff `git diff origin/main...HEAD` (after `git fetch origin`). Inputs: `tasks/2a/TASK_BRIEF.md` (incl. answers and
handoffs), `specs/2a/threat-model.md` (incl. sign-off), `specs/2a/schema.md`, `tasks/decisions.md` (Task 2 entry),
`rules/security-baseline.md`, `roles/security.md`. Local stack only; no Supabase cloud, no production access.
All DB runs under the shared `.verify-lock`, released afterwards.

## Diff scope

Code files in the diff: only the new migration
`supabase/migrations/20261125150215_function_privileges.sql` and the new test
`supabase/tests/02_function_privileges_test.sql`. No existing migration edited. Rest of the diff is specs/tasks text.

## Migration vs. signed-off SQL

`supabase/migrations/20261125150215_function_privileges.sql:7-9` are exactly the three statements of
`specs/2a/schema.md` section 1 / threat model "Expected shape" (`ALTER DEFAULT PRIVILEGES FOR ROLE "postgres"
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC / "anon" / "authenticated"`), no `IN SCHEMA`; lines 1-6 are comments.
No other statements: creates no objects, touches no data, changes no existing object's ACL (default privileges
apply only to objects created later). After `db reset` the `postgres` rows in `pg_default_acl` are: global `f`
`{postgres=X/postgres}` (new), plus the unchanged task-1 `public` rows and the Supabase `storage` rows (the
accepted exception from the sign-off, guarded by T6).

## Row 14 (query your database)

| Item | Evidence | Result |
|------|----------|--------|
| Control | `supabase/migrations/20261125150215_function_privileges.sql:7-9` | present, matches sign-off |
| T1 exact global ACL | `02_function_privileges_test.sql:19-30` "T1: global default ACL row for functions (postgres) exists", "T1: ... no EXECUTE to PUBLIC, anon or authenticated", "T1: global default ACL is exactly {postgres=X/postgres}" | PASS |
| T2 (4 probes incl. procedure; anon/authenticated/service_role false, postgres true) | `:33-51`, 16 assertions on `public.t2_probe()`, `public.t2_probe_definer()`, `t2_other.t2_probe()`, procedure `public.t2_probe_proc()` | PASS |
| T6 per-schema guard (grantees PUBLIC, anon, authenticated, service_role; exception exactly `storage`) | `:67-74` "T6: no per-schema postgres function default (except storage) ..." | PASS |
| Idempotence | `:77-94` "Idempotence: same number ..." / "... unchanged after a second run" (re-runs the three statements, compares row count and ACL text) | PASS |
| T5 (task 1 unchanged) | `supabase/tests/01_default_privileges_test.sql` not in the diff; 12/12 pass | PASS |

## Row 1 (`/admin`, preventive)

| Item | Evidence | Result |
|------|----------|--------|
| Control | same migration, `:7-9`; SECURITY DEFINER rules in threat model / schema.md for later tasks | present |
| T3 behavioral 42501 | `:55-62` four `throws_ok` (anon and authenticated calling `t2_probe` and the `security definer` `t2_probe_definer`), each asserting SQLSTATE `42501` **and** the exact message `permission denied for function <name>`; `:63` "T3: still running as postgres" | PASS |
| T4 explicit grant still works | `:97-102` "T4: authenticated can call public.t2_probe() after an explicit grant" (`lives_ok`), "T4: anon still cannot execute ...", "T4: still running as postgres" | PASS |

### Judgment on the `; reset role` suffix in T3/T4

Does not weaken the test. On the expected path the call raises 42501, the pgTAP subtransaction rolls back and
`set local role` is undone; `reset role` never runs. On the failure path (call wrongly succeeds) `throws_ok`
still reports "no exception" and fails; `reset role` only stops the rest of the file from running as
`anon`/`authenticated` (which would otherwise abort later tests and hide results). `reset role` cannot itself
produce a matching pass: it is permitted for any role (checked against the session user) and its error text could
not match `permission denied for function t2_probe...`. The `current_user = 'postgres'` assertions (`:63`, `:102`)
still catch any leaked role switch. Confirmed by the negative control below (T3 fails with "caught: no
exception", and every later test still ran).

## Negative control (reproduced by security)

Scratch copy of the test (outside the repo) with
`ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;` inserted after
`create extension`, inside the test's `begin ... rollback`, run with `npx --no-install supabase test db <copy>`:
**Result FAIL, 21/30 failed**: T1 tests 1 and 3 (`have: NULL`), all 12 API-role T2 assertions, all 4 T3
`throws_ok` ("caught: no exception, wanted: 42501"), idempotence 26 and 27, T4 anon check 29. T6 (25) passed, as
the sign-off expects. Matches the db-builder's handoff exactly; the tests do not pass without the control.
`supabase test db` afterwards: 45/45 PASS; `pg_default_acl` unchanged (DB clean).

## Live abuse check (security, rolled-back transaction via `psql -U postgres` in the local DB container)

Created as `postgres` with no grant: `public.sec_abuse_probe()` (`security definer`, `search_path = ''`) and
`sec_abuse_other.p()`. Both got `proacl = {postgres=X/postgres}`, owner `postgres`.
- `set local role anon; select public.sec_abuse_probe();` -> `ERROR: 42501: permission denied for function sec_abuse_probe`
- `set local role authenticated; ...` -> same `42501`
- `set local role service_role; ...` -> same `42501` (intended least privilege)
- other schema as anon/authenticated -> `42501` (stopped first by schema USAGE; the function ACL itself is the
  owner-only `proacl` above, and T2 asserts it via `has_function_privilege`)
- `rollback`; afterwards 0 leftover functions and 0 leftover schemas.

## Automated checks

| Check | Result |
|-------|--------|
| `npx --no-install supabase db reset` (under lock) | exit 0, all 3 migrations apply |
| `npx --no-install supabase test db` | `Files=3, Tests=45`, Result PASS |
| `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md` | `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, no script); includes destructive scan, RLS static check, secret pattern scan, client bundle secret scan, `db lint` |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Secret scan | verify.sh basic scan PASS (gitleaks not installed locally; CI runs the full scan) |
| Supabase security advisors | not run: no cloud access in this gate by instruction; this diff adds no objects an advisor could flag |

## Manual diff review

No routes, client code, env vars, raw SQL from strings, `dangerouslySetInnerHTML`, uploads or LLM use. No function
created in a Supabase-managed schema and no `IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS` (convention rule 5 holds).
Rows 2, 3, 5, 8, 9, 11, 13 unchanged by this diff; rows 4, 6, 7, 10, 12 N/A per threat model.

## Re-gate after main merge (2026-11-25, fresh context)

Trigger: code review 97f37e2 (APPROVE), then merge commit 7b136ab (origin/main 69c6151 = PR #8 tasks/ docs,
PR #9 verify.sh reorder) after the gate above (c55f0e4). Re-checked after `git fetch origin`:

- **Net PR scope:** `git diff origin/main...HEAD` = the 2a migration, the 2a test, `specs/2a/**` (schema,
  threat model, this gate, review) and `tasks/**` (2a brief, board row, decisions entry, lesson L20). Nothing else.
- **Gated code unchanged:** `git diff c55f0e4 HEAD -- supabase/` is empty; migration and test are byte-identical
  to what was gated above (no CR in either).
- **Merge resolution in `tasks/`:** no conflict markers anywhere in `tasks/`, `specs/`, `supabase/`, `scripts/`.
  `tasks/board.md` keeps main's rows (0, 1, 2c) and adds 2a. `tasks/lessons.md` headings L16-L20 are unique;
  main's L17 (post-deploy staleness) is kept and this branch's `throws_ok` role-leak lesson is now L20, text
  unchanged. The brief's db-builder handoff says "See lessons L20"; the orchestrator note records the renumbering
  and leaves review nit 6 open. `specs/2a/review.md` still says L17 in its findings; that is the pre-merge
  historical reference the renumbering answers, not a security issue.
- **PR #9 (`scripts/verify.sh`):** `git diff c55f0e4 HEAD -- scripts/verify.sh` is a pure block move (database
  section now 5, project checks now 6, plus a 2-line comment); no check added, removed or changed, and
  `HEAD:scripts/` equals `origin/main:scripts/`. Scope, migration, destructive, secret, RLS and client-bundle
  checks run as before. No effect on this task's security controls or tests.
- **verify.sh (under the shared lock, released afterwards):** `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md`
  -> `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, no script). The `[database]` section now runs first:
  all migrations apply to an empty DB, `supabase test db` PASS, SQL lint no errors; then typecheck, lint, test,
  build PASS.

Re-gate result: PASS. Findings above carried forward unchanged.

## Findings

None blocking. Notes:
1. AC8 remains open after merge: the read-only production `pg_default_acl` check from schema.md section 7; any
   per-schema `postgres` function row other than `public`/`storage`, or a `storage` row differing from local,
   comes back to security.
2. Residual risk accepted by the person (Q2): functions created by roles other than `postgres` still get the
   built-in `PUBLIC` EXECUTE.

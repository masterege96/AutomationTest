Result: APPROVE

# Task 1 code review: default privileges baseline + revoke TRUNCATE/TRIGGER/REFERENCES/MAINTAIN

Author: code-reviewer, 2026-11-25. Fresh context (no builder context). This is not the security role.
I judged only from the repo, the local stack and `git diff origin/main...HEAD` on branch
`db/1-default-privileges` (commits 535539d, 19bf90d). I did not touch Supabase cloud or production.

## Summary

The migration matches `specs/1/schema.md` exactly. Part A matches the incident report's 12 statements byte for
byte, in the same order. I diffed migration lines 6-17 against `tasks/incidents/2026-11-25-drift.md` lines
25-36 from commit 41f57db (PR #6): identical. Part B (lines 21-22) matches schema.md B1/B2. The migration is
one logical change, creates no objects, touches no data, and is idempotent. The pgTAP test covers schema.md
test list items 1-5, the plan count is correct, and it rolls back. The only verify.sh failure is the L15 false
positive. No blockers. Two should-fix items concern docs and merge order. Neither changes the SQL.

## Acceptance criteria

| AC | Evidence | Status |
|----|----------|--------|
| AC1 | `supabase/migrations/20261125135502_default_privileges_baseline.sql:6-17`, identical to the incident report | met |
| AC2 | same file `:21-22`. service_role keeps `Dxtm` (`:17`, not revoked) | met |
| AC3 | Only `ALTER DEFAULT PRIVILEGES`, no CREATE. I re-applied the whole migration in a rolled-back transaction on the reset local DB and the `pg_default_acl` rows for postgres/public did not change (0 differing rows). | met |
| AC4 | `supabase/tests/01_default_privileges_test.sql`: table and sequence assertions present. The function is created but not asserted (see F1). | met for table/sequence; function part deferred by schema.md item 6 |
| AC5 | verify.sh 17/18 (only the L15 false positive). Security gate PASS. This review APPROVE. CI is not visible from here. | pending the person's L15 decision and CI |

## Checks run (local, CLI 3.2.0)

- `npx --no-install supabase db reset`: OK, both migrations applied from scratch.
- `npx --no-install supabase test db`: `Files=2, Tests=15, Result: PASS`.
- `npx --no-install supabase db lint --level error --fail-on error`: "No schema errors found", exit 0.
- `bash scripts/verify.sh --brief tasks/1/TASK_BRIEF.md`: `verify.sh: FAIL 1/18 failed: destructive statements need approval (1 skipped)`.
  The only FAIL flags migration lines 15, 16, 17, 21 and 22, where `TRUNCATE` appears as a privilege name in GRANT/REVOKE lists, and line 20, a comment.
  None of them is a `TRUNCATE` statement. This is the false positive described in L15. Scope, migration naming, no edited migrations, no CR, RLS, secrets,
  typecheck/lint/test/build and all three DB checks PASS.
- Resulting default ACL (postgres, public): tables `{postgres=arwdDxtm,service_role=Dxtm}`, sequences
  `{postgres=rwU}`, functions `{postgres=X}`. This matches schema.md's "Resulting default privileges" table.
- Migration naming: `<14-digit timestamp>_default_privileges_baseline.sql` is the name `supabase migration new
  default_privileges_baseline` produces (verify.sh name check PASS). The repo cannot prove which command created the file.
- Scope: all changed files are in `supabase/migrations/**`, `supabase/tests/**`, `specs/1/**` or `tasks/**`.
- Test mechanics: `plan(12)` matches the 12 `ok()` calls (4 anon/authenticated table, 2 service_role table,
  3 sequence, 3 pg_default_acl). The probe objects are created inside `begin` ... `rollback`, as postgres.
  `has_table_privilege(role, t, 'A, B')` is true if any listed privilege is held, so `not has_table_privilege(...)`
  correctly means none is held.

## Findings

1. **F1** `tasks/1/TASK_BRIEF.md:22` (AC4) vs `specs/1/schema.md` test list item 6 and `supabase/tests/01_default_privileges_test.sql:11`.
   **should-fix**. Owner: db-architect, to amend AC4 in the brief, or db-builder, to add an assertion.
   AC4 says anon and authenticated have "no privileges on them" (table, sequence and function), and service_role has "nothing on the sequence or function". The test creates `public.t1_probe_fn()` but asserts nothing about it.
   That matches schema.md item 6, but the brief's AC4 still promises it. I confirmed locally that a new function gets `proacl = NULL`
   (the built-in default, PUBLIC has EXECUTE), so `has_function_privilege(<any of the three roles>, ..., 'EXECUTE')` is true.
   AC4 as written cannot pass with `has_function_privilege`. There are two ways to fix it:
   (a) reword AC4 to "no explicit grant to anon/authenticated/service_role on the function (PUBLIC EXECUTE is a known follow-up)"; or
   (b) add a test asserting that `aclexplode(coalesce(proacl, acldefault('f', proowner)))` has no grantee among the three roles.
   Either way the brief and the test should agree. Otherwise the creation on line 11 is a dead probe.
2. **F2** `tasks/lessons.md:191`, `specs/1/schema.md:3,98`, the migration header (`:1`) and the brief's Inputs.
   **should-fix**. Owner: git-release or the orchestrator, for merge order.
   This branch references `tasks/incidents/2026-11-25-drift.md` and lessons L14. Neither exists on `origin/main` or on this branch.
   Both are only in PR #6 (`chore/0-drift-incident`, commit 41f57db). This branch also appends L15 right after L13,
   in the same spot where PR #6 appends L14, so the second PR to merge will get a `tasks/lessons.md` conflict.
   Merge PR #6 first, then rebase this branch so that L15 follows L14. Don't merge this PR alone, or its traceability references point at nothing.
3. **F3** `supabase/tests/01_default_privileges_test.sql:41-49`. **nit**. Owner: db-builder.
   Tests 10-12 only check that the `pg_default_acl` rows exist, not what they contain. Tests 1-9 cover the behavior, so this is fine.
   An `is(defaclacl::text, ...)` check for the table row would pin the exact baseline.
4. **F4** `supabase/migrations/20261125135502_default_privileges_baseline.sql:20`. **nit**. Owner: db-builder.
   The word "TRUNCATE" in the comment adds one more L15 hit. It is harmless, and rewording the comment
   would not help, because the scan is case-insensitive and also flags the GRANT/REVOKE lines. Leave it. Listed only so the person knows line 20 is a comment.
5. **F5** `tasks/1/TASK_BRIEF.md:5`, `tasks/board.md:6`. **nit**. Owner: orchestrator.
   The state is `IN_PROGRESS` while the task is in the gate phase. Update it when the gate result is recorded. The AC checkboxes are still unchecked.

## Not findings (checked)

- Safe on production: Part A is a no-op there, because production already has it. Part B only affects objects created later. Nothing is dropped,
  no data is touched, and no existing object's grants change. The brief says rollback is a new re-grant migration.
- Security second look: I found nothing that the gate missed. The PUBLIC EXECUTE on functions and the supabase_admin default ACLs are
  already recorded as follow-ups in `specs/1/security-gate.md`.
- No `types/database.ts` regeneration is needed, because no tables were added.
- `tasks/decisions.md:14` records the person's decision that the brief cites.

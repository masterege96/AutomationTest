Result: APPROVE

# Task 2a code review: revoke EXECUTE on future functions created by `postgres` (after main merge)

Reviewer: code-reviewer, 2026-11-25, fresh context (no builder context). Re-run because the orchestrator merged
`origin/main` into the branch after my first review (`97f37e2`, APPROVE). Branch `db/2a-function-privileges`
at `9587ac8` (merge `7b136ab` + security re-gate `9587ac8`, PASS); `origin/main` at `69c6151` after
`git fetch origin`, which is now the merge-base (branch is up to date with main; `git merge-tree` reports no
conflicts). Local stack only, no cloud access.

## What changed since my first review

- `git diff 97f37e2 HEAD -- supabase/` is **empty**: the migration
  `supabase/migrations/20261125150215_function_privileges.sql` and `supabase/tests/02_function_privileges_test.sql`
  are unchanged, so the first review's code analysis (below, carried forward) still holds.
- Merge `7b136ab` brought in main's PR #8 (tasks docs: tasks 0/1 DONE, task 2c brief, lessons L17-L19, incident
  update, specs/2c) and PR #9 (`scripts/verify.sh` reorder: database section before project checks). None of that
  is in this PR's net diff, since it is already on main.
- Branch-side edits in the merge: `tasks/board.md` 2a row (state `IN_REVIEW`, title now "all schemas"),
  `tasks/lessons.md` this task's lesson renumbered L17 -> **L20**, `tasks/2a/TASK_BRIEF.md` reference updated to
  "See lessons L20" (`:108`) plus an orchestrator note (`:124-127`).

## Merge resolution checks

| Check | Result |
|-------|--------|
| Net diff `git diff --name-only origin/main...HEAD` | only `specs/2a/**` (4 files), `supabase/migrations/20261125150215_function_privileges.sql`, `supabase/tests/02_function_privileges_test.sql`, `tasks/2a/TASK_BRIEF.md`, `tasks/board.md`, `tasks/decisions.md`, `tasks/lessons.md`: all allowed paths |
| Conflict markers (`^<<<<<<<`, `^=======`, `^>>>>>>>`) in `tasks/ specs/ supabase/ scripts/` | none |
| `tasks/board.md` vs main | main's rows 0 (DONE), 1 (DONE), 2c (IN_REVIEW) kept verbatim; only the 2a row is added |
| `tasks/lessons.md` vs main | L1-L19 identical to main; only L20 appended; headings L1..L20 each appear once |
| `tasks/decisions.md` vs main | only this task's 2026-11-25 decision row appended |
| Brief reference | `tasks/2a/TASK_BRIEF.md:108` says "See lessons L20"; no stale "L17" reference left for this lesson |

## Checks run (under the shared `.verify-lock`, released afterwards)

| Check | Result |
|-------|--------|
| `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md` (base `origin/main`) | `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, no script); scope, migration names, no edited migration, no CR, destructive scan, all migrations apply, `supabase test db`, SQL lint all PASS; the database section now runs before the project checks (PR #9) |

## Against the acceptance criteria and role contracts (carried forward; code unchanged)

- **AC1** -> T1, `02_function_privileges_test.sql:19-30` (row exists, no EXECUTE for PUBLIC/anon/authenticated,
  ACL exactly `{postgres=X/postgres}`).
- **AC2** -> T2 `:33-51` (16 `has_function_privilege` checks over 4 probes incl. the other schema and the procedure)
  and T3 `:55-63` (four `throws_ok` with SQLSTATE 42501 and exact message, then `current_user = 'postgres'`).
- **AC3** -> T4 `:97-102`.
- **AC4** -> `01_default_privileges_test.sql` not in the diff, passes; task 1's "documented gap" is now asserted by T2.
- **AC5** -> migration `:7-9`: exactly the three statements of schema.md section 1, no `IN SCHEMA`, comments only
  otherwise; one logical change; no existing migration edited; creates no objects or data; `migration new` file
  name format. Idempotence asserted at `:77-94`.
- **AC6** -> schema.md sections 2-3; security signed off in threat-model.md "Sign-off on schema.md".
- **AC7** -> verify.sh PASS (above); security gate PASS (re-gated `9587ac8`); the branch no longer conflicts with
  main, so the `pull_request` CI run can happen (L19); CI result itself is for git-release to confirm.
- **AC8** -> post-merge, read-only; the queries are in schema.md section 7.
- **Production safety:** default privileges only apply to objects created later; nothing existing changes; no
  destructive statement; rollback documented (schema.md section 6). Safe on a populated DB.
- **Test vs schema.md section 8:** T1, T2, T3, T4, T6, idempotence present; T5 is the unchanged 01 file;
  `plan(30)` matches (3 + 16 + 5 + 1 + 2 + 3). Probes created inside `begin ... rollback`; temp table
  `on commit drop`.
- **`; reset role` pattern:** sound (analysis in the first review unchanged): on the expected path the 42501 rolls
  back the subtransaction and `reset role` never runs; if a call wrongly succeeds, `throws_ok` still fails and the
  session returns to `postgres`; `current_user = 'postgres'` checks (`:63`, `:102`) catch any leak. Recorded in L20.
- **Scope:** no function in a Supabase-managed schema and no `IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS`.

## Findings

Resolved since the first review:

1. ~~should-fix: branch conflicts with `origin/main` (`tasks/board.md`, `tasks/lessons.md`)~~ **Resolved** by merge
   `7b136ab`: no conflict markers, main's content kept, `git merge-tree` against current `origin/main` is clean.
2. ~~should-fix: lesson-number collision (this branch's L17)~~ **Resolved**: renumbered to L20, after main's L17-L19;
   L1-L20 unique; brief reference updated (`tasks/2a/TASK_BRIEF.md:108`).
3. ~~nit: board said 2a `BACKLOG` while the brief said `IN_REVIEW`~~ **Resolved**: `tasks/board.md:8` now `IN_REVIEW`.

Remaining (all nits, none blocking):

4. **nit** (partly resolved): the board row now says "all schemas", but `tasks/2a/TASK_BRIEF.md:1` (title) and the
   Goal line still say "in `public`"; after the person's Q1 answer the change is global (every schema, role
   `postgres`). Owner: product-spec / orchestrator.
5. **nit**: `tasks/2a/TASK_BRIEF.md:113` records `verify.sh: PASS 17/17 (1 skipped)`; current runs show `18/18`.
   Historical line, fine to leave. Owner: db-builder (optional).
6. **nit**: `specs/2a/schema.md:245` and `:248` still show the T3/T4 SQL strings without the trailing
   `; reset role`. The orchestrator note (`tasks/2a/TASK_BRIEF.md:127`) defers this to the next function
   migration's db-architect to keep the gates fresh, with L20 recording the safe pattern. Acceptable; keep L20
   open until the convention text is updated. Owner: db-architect, security.
7. **nit** (new): the orchestrator note (`tasks/2a/TASK_BRIEF.md:126`) says the merge touched "tasks/ files only";
   the merge commit also brought main's `scripts/verify.sh` and `specs/2c/**`. Harmless (they are identical to
   main and not in the PR's net diff), but the note is imprecise. Owner: orchestrator (optional).

No blockers. The migration and test are unchanged from the approved version, the merge resolution is correct,
and verify.sh passes on the merged branch.

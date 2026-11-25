Result: APPROVE

# Task 2a code review: revoke EXECUTE on future functions created by `postgres`

Reviewer: code-reviewer, 2026-11-25, fresh context (no builder context). Branch `db/2a-function-privileges`,
diff `git diff origin/main...HEAD` after `git fetch origin` (merge-base `5fcb5ba`; `origin/main` is at `de0cfb9`).
Read: `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `roles/db-architect.md`, `roles/db-builder.md`,
`rules/database-and-deploy.md`, `tasks/2a/TASK_BRIEF.md`, `specs/2a/schema.md`, `specs/2a/threat-model.md`,
`specs/2a/security-gate.md`, `supabase/tests/01_default_privileges_test.sql`. Local stack only, no cloud access.

## Checks run (under the shared `.verify-lock`, released afterwards)

| Check | Result |
|-------|--------|
| `npx --no-install supabase db reset` | exit 0, all 3 migrations apply |
| `npx --no-install supabase test db` | `Files=3, Tests=45`, `Result: PASS` (02: 30/30) |
| `npx --no-install supabase db lint --level error --fail-on error` | "No schema errors found", exit 0 |
| `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md` | `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, no script); scope, migration names, no edited migration, no CR, destructive scan all PASS |

## Against the acceptance criteria and role contracts

- **AC1** -> T1, `02_function_privileges_test.sql:19-30` (row exists, no EXECUTE for PUBLIC/anon/authenticated,
  ACL exactly `{postgres=X/postgres}`).
- **AC2** -> T2 `:33-51` (16 `has_function_privilege` checks over 4 probes incl. the other schema and the procedure)
  and T3 `:55-63` (four `throws_ok` with SQLSTATE 42501 and exact message, then `current_user = 'postgres'`).
- **AC3** -> T4 `:97-102`.
- **AC4** -> `01_default_privileges_test.sql` not in the diff, 12/12 pass; task 1's "documented gap" is now asserted by T2.
- **AC5** -> migration `supabase/migrations/20261125150215_function_privileges.sql:7-9`: exactly the three statements
  of schema.md section 1, no `IN SCHEMA`, comments only otherwise; one logical change; no existing migration
  edited; creates no objects or data; file name has the `migration new` format (timestamp + snake_case). Idempotence
  asserted at `:77-94` (re-runs the three statements, compares row count and every `postgres` row's ACL text both ways).
- **AC6** -> schema.md sections 2-3 (creator role, every schema, `storage` exception, no existing function changes);
  security signed off in threat-model.md "Sign-off on schema.md".
- **AC7** -> verify.sh PASS (above); security gate PASS; CI pending (see finding 1).
- **AC8** -> post-merge, read-only; the queries are in schema.md section 7.
- **Production safety:** default privileges only apply to objects created later; nothing existing changes; no
  destructive statement; rollback documented (schema.md section 6). Safe on a populated DB.
- **Test vs schema.md section 8:** T1 (incl. exact ACL), T2 (4 probes incl. `t2_other` and the procedure, all four
  roles), T3, T4, T6 (grantees incl. `service_role`, exception exactly `storage`), idempotence all present; T5 is the
  unchanged 01 file; negative control was run once and recorded (builder) and reproduced (security), not committed,
  as schema.md asks. `plan(30)` matches the count (T1 3 + T2 16 + T3 5 + T6 1 + idempotence 2 + T4 3 = 30).
  All probes and `t2_other` are created inside `begin ... rollback`; the temp table is `on commit drop`; style
  matches the 01 test.
- **`; reset role` pattern:** sound. On the expected path the call raises 42501, the pgTAP subtransaction rolls
  back and undoes `set local role`; `reset role` never runs. If a call wrongly succeeds, `throws_ok` still fails
  ("no exception") and `reset role` only returns the session to `postgres` so later assertions still run; it can't
  produce a matching 42501 with the expected message. In T4 (`lives_ok`) it is needed on the normal path, since the
  successful subtransaction would otherwise keep `authenticated`. The `current_user = 'postgres'` checks (`:63`,
  `:102`) catch any leak. Deviation from schema.md's literal string is recorded in the brief handoff and L17.
- **Scope:** changed files are `supabase/migrations/**`, `supabase/tests/**`, `specs/2a/**`, `tasks/**` only.
  No function in a Supabase-managed schema and no `IN SCHEMA ... GRANT EXECUTE ON FUNCTIONS` (convention rule 5).

## Findings

1. **should-fix**: `tasks/board.md:7` and `tasks/lessons.md:225`: the branch **conflicts with `origin/main`**
   (`git merge-tree` reports content conflicts in both files). `origin/main` (`de0cfb9`, PR #8) set tasks 0 and 1
   to DONE and added its own **L17** ("A post-deploy record under specs/<id>/ makes the task's gates stale").
   A PR with conflicts gets no `pull_request` CI run (L19 on `ci/2c-verify-db-first`), so AC7's "CI green" can't
   be met until this is resolved. Fix: merge `origin/main` into the branch, keep main's rows 0/1 = DONE and main's
   L17, and renumber this task's lesson. Docs-only: a merge commit touching only `tasks/**` does not make the gate
   files stale under `gate-check.sh` (it excludes `tasks/**` from the code-change check). Owner: git-release
   (merge), orchestrator (lessons/board).
2. **should-fix**: `tasks/lessons.md:225` lesson-number collision across branches: this branch's L17 (`throws_ok`
   role leak), `main`'s L17 (post-deploy gate staleness), `sec/2b-headers-auth-defaults`'s L17 (local auth rate
   limits), and `ci/2c-verify-db-first` already uses L18 and L19. Renumber at merge time in merge order (2a's
   becomes L18 or later depending on whether 2c lands first), and update the reference in
   `tasks/2a/TASK_BRIEF.md:108` ("See lessons L17"). Owner: orchestrator (or git-release when merging).
3. **nit**: `tasks/board.md:7` says 2a is `BACKLOG`, while `tasks/2a/TASK_BRIEF.md:5` says `IN_REVIEW`. The
   board should match the brief state. Owner: orchestrator.
4. **nit**: `tasks/2a/TASK_BRIEF.md:1` and `tasks/board.md:7` still describe the scope as "in `public`"; after the
   person's Q1 answer the change is global (every schema, role `postgres`). The Goal line is likewise
   `public`-only. Answers section is correct; title and board text are stale. Owner: product-spec / orchestrator.
5. **nit**: `tasks/2a/TASK_BRIEF.md:113` records `verify.sh: PASS 17/17 (1 skipped)`; current runs (security's
   and mine) show `18/18`. Not a problem in itself (likely a different base/check set at the time), but the
   pasted summary line (AGENT_RULES rule 20) is out of date. Owner: db-builder (or leave as historical).
6. **nit**: `specs/2a/schema.md:245` and `:248` still show the T3/T4 SQL strings without the trailing
   `; reset role`; schema.md section 5 rule 2 is the convention later function migrations will copy. L17's
   suggested framework fix covers it; worth applying in schema.md / the threat-model template in a follow-up so
   the next function migration copies the safe form. Owner: db-architect, security.

No blockers. The migration and test are correct, match the signed-off spec, and pass locally.

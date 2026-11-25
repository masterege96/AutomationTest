Result: APPROVE

# Code review: task 2c (verify.sh runs the database section before the project checks)

- **Role:** code-reviewer, 2026-11-25, fresh context, judged from the repo only.
- **Branch:** `ci/2c-verify-db-first`, base `origin/main`. Commits reviewed: `a59c96f`, `b1d00d6`, `e2d68fe`, `d16c253`.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `roles/devops-cicd.md`, `tasks/2c/TASK_BRIEF.md`
  (incl. Handoff), `specs/2c/security-gate.md` (PASS), `git diff origin/main...HEAD`,
  `git diff --color-moved=zebra origin/main...HEAD -- scripts/verify.sh`.
- No `test-plan.md` / qa-test report exists for 2c; the AC checks below were run by this review instead.

## Scope

Changed files: `scripts/verify.sh`, `tasks/2c/TASK_BRIEF.md`, `tasks/board.md`, `tasks/lessons.md`,
`specs/2c/security-gate.md` (+ this file). All inside `scripts/verify.sh`, `tasks/**`, `specs/2c/**`. No workflow,
other script, `package.json`, test or app code touched. verify.sh's own scope check: PASS.

## Acceptance criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1 order | OK | Full run: `[scope]`, `[migrations]`, `[secrets]`, `[code safety]`, `[database]` (+3 result lines), `[project]`. |
| AC2 same checks | OK | `--no-db`: old (`git show origin/main:scripts/verify.sh`) and new give the same sorted PASS/FAIL/SKIP set and `PASS 15/15 (2 skipped)`. Full run new: `PASS 18/18 (1 skipped)`, matching the builder's old-script result. Code: both moved bodies byte-identical. |
| AC3 same pass/fail | OK | `scripts/verify.sh:200-233` (DB) and `:235-257` (project) are unchanged code: same `run_script ... yes/no`, same `db reset` / `test db` / `db lint --level error --fail-on error`, same `[ -d supabase ]` / `[ -f package.json ]` guards and `skip "project checks (no package.json)"`. No variable or function is shared between the two sections, so the reorder cannot change behavior (DB uses `SB`, `DB_LOG`, `db_step`, `DB_UP`; project uses `PM`, `has_script`, `run_script`). |
| AC4 summary/exit | OK | `scripts/verify.sh:259-267` unchanged. Observed exit 0 on PASS, 1 on FAIL; FAIL line lists names in run order. |
| AC5 `--no-db` local | OK | `[database]` shows only `SKIP  database build from scratch (--no-db)`; `[project]` runs; exit 0. |
| AC6 `--no-db` CI | OK | `CI=true`: `FAIL  database build from scratch (--no-db) (skipped, but required in CI)`, summary FAIL, exit 1. (The other FAIL, `secret scan (gitleaks not installed in CI)`, is this machine lacking gitleaks; same on old script.) |
| AC7 Docker stopped | OK by inspection | Not re-run (shared Docker). Builder's PATH-stub run in Handoff is credible; code path: `bad "local database could not start"` + hint, then `skip "migrations, database tests and SQL lint ..."`, no `exit` in the DB section, so `[project]` still runs. |
| AC8 no CLI | OK by inspection | Same: unchanged `skip ... (Supabase CLI not installed) required` branch, now before `[project]`; builder's stub run in Handoff. |
| AC9 stack left up | OK | DB log steps: only `db reset`, `test db`, `db lint ...`; no `stop` anywhere in the file; `supabase status` exit 0 right after the run. |
| AC10 headings/comment | OK | `scripts/verify.sh:199` "5. Database from scratch", `:235` "6. Project checks (typecheck, lint, tests, build)"; sections 1-4 unchanged, so 1-6 in file order. Comment at `:200-201` is accurate: section runs before project checks for tests needing the local stack; "left running" is true (no stop). |
| AC11 diff is only the move | OK | `--color-moved=zebra`: the 23-line project block shows as moved (git picked that block rather than the DB block; equivalent). Only plain -/+ lines: two old headings, two new headings, two comment lines. |
| AC12 gate | Local OK, CI pending | Under the shared lock: `bash scripts/verify.sh --brief tasks/2c/TASK_BRIEF.md` -> `verify.sh: PASS 18/18 (1 skipped)`, exit 0. CI `verify` / `db-check` not observable (nothing pushed); must be green on the PR before merge. |

Other checks: `bash -n scripts/verify.sh` OK; no CR characters (LF only); file mode unchanged (100755).

## Findings

- **tasks/board.md:7, nit, owner: devops-cicd (or orchestrator).** Row 2c says `BACKLOG` while the brief's State
  is `IN_REVIEW`. Update the board state when the PR is opened.
- **specs/2c/ (no test-plan.md / qa-test report), nit, owner: qa-test / orchestrator.** The brief says "qa-test writes
  at least one test per line", and the code-reviewer contract expects qa-test's report as input. None exists for
  2c. For a pure reorder of the gate script the AC runs above cover it; orchestrator decides whether qa-test is
  waived for this task and notes it.
- **Security F1 (pre-existing), acknowledged, owner: devops-cicd.** "client bundle has no server secrets" runs only if a
  build already exists and prints nothing otherwise (18 vs 17 total). Not caused or worsened by this PR; agree with
  security that it is a follow-up task, not part of 2c's scope.

No blockers, no should-fix.

## Merge notes

- `scripts/**` is a framework path: the PR needs the person's `framework-change-approved` label (AGENT_RULES 18a).
  This review does not replace it.
- `gate-check.sh` was run locally with `FRAMEWORK_CHANGE_APPROVED=1`, which only simulates that label; it is not the label.

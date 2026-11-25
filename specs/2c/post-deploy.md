# Task 2c post-deploy verification: verify.sh builds the local database before the project checks

Author: git-release, 2026-11-25. Read-only evidence only; nothing in production was changed.

## Deploy

- PR #9 squash-merged as `69c6151` at 2026-11-25 15:22 UTC.
- Required checks on the PR: `verify`, `db-check`, `secrets`, `merge-gate` all SUCCESS (gate files in `specs/2c/`).
- What "deploy" means for this task: the change is `scripts/verify.sh` only (CI and local done gate). It ships to
  production nothing: no migration, no app code. The Supabase integration check on `69c6151`: success.

## Production migration history

Unchanged by this task (it has no migration). Read-only `list_migrations` (Supabase connector, project
AutomationTests), 2026-11-25 ~16:09 UTC: `20261125104017 init`, `20261125135502 default_privileges_baseline`,
`20261125150215 function_privileges`.

## Drift after deploy

Run 45651393581 (`workflow_dispatch`, `main` at `af59b2d`, which contains `69c6151`): success, log
`diff: 0 non-comment lines, sha256 e3b0c44298fc` (the hash of an empty file), "No drift.", no artifact.

## Acceptance criteria in use

The "real user" of this task is CI and the builders who run `verify.sh`. Checked on the first PR run after the merge:

- AC1, AC9, AC12: PR #11's CI `verify` job (run 45649162423, job 139328558684, on a branch with `main` merged in)
  printed `[scope]`, `[migrations]`, `[secrets]`, `[code safety]`, `[database]`, `[project]` in that order and ended
  `verify.sh: PASS 17/17 (1 skipped)`; `db-check` green on the same PR. PR #10's run used the same script.
- AC2-AC8, AC10, AC11: proven before merge by devops-cicd and the code reviewer (`tasks/2c/TASK_BRIEF.md` Handoff,
  `specs/2c/review.md`); the merged file is the reviewed one (no later change to `scripts/verify.sh` on `main`).

## Open items

None. Result: **DONE**.

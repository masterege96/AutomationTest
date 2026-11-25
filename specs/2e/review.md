Result: APPROVE

# Code review: task 2e (close out task 2a with the person's production `pg_default_acl` check)

- **Role:** code-reviewer, 2026-11-25, fresh context, judged from the repo and read-only GitHub data only.
- **Branch:** `chore/2e-2a-close-out`, base `origin/main` (`cba2ca4`). Commits reviewed: `33fbfae`, `8076308`,
  `d11fab2`.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `tasks/2e/TASK_BRIEF.md`,
  `roles/git-release.md` (Ship outputs), `ORCHESTRATOR.md` section 3, `specs/2a/schema.md` section 7,
  `specs/2d/review.md`, `tasks/decisions.md`, `git diff origin/main...HEAD`. verify.sh not re-run (Handoff:
  `verify.sh: PASS 17/17 (1 skipped)`). No production access used.

## What was checked

- **Scope (AC4): OK.** Diff touches only `specs/2a/post-deploy.md` (allowed path), `tasks/board.md` and
  `tasks/2e/TASK_BRIEF.md` (`tasks/**` always allowed). No code, migration, test, workflow, script or rulebook.
- **No secrets / key values (AC4, row 13): OK.** Grep of added lines for JWT/`sb_`/`sk_` prefixes, connection
  strings, tokens, passwords and 20-char project refs: none. The ACL strings name only roles.
- **Recorded rows vs `specs/2a/schema.md` section 7 (AC1): OK.** Query 1: one row `postgres | f |
  {postgres=X/postgres}`, equal to the expected value (schema.md:203). Query 2: `public | {postgres=X/postgres}`
  (schema.md:209) plus `storage` with `postgres`, `anon`, `authenticated`, `service_role` each `=X/postgres`, which
  is the local set named in security's rule (schema.md:212-214); no other schema. Who (the person), when
  (2026-11-25 ~16:30 UTC), where (dashboard SQL editor, SELECT only) and the relay path (orchestrator, screenshots)
  are recorded (post-deploy.md:51-59).
- **Record internally consistent: OK.** Section heading (line 29) "PASS", AC8 (lines 65-66) "PASS", Result (line 72)
  "DONE", "rows above" points up to lines 55-56. Queries and security's rule are kept verbatim as the record of
  what was run. Migration history and both drift runs unchanged and still back AC8.
- **GitHub rendering: OK.** The two result rows are now list items, not table cells, so the `|` inside the
  backticked values can't split columns. No other table in the file was changed (lines 14-18 untouched).
- **Drift run 45647204820 (AC3): OK.** `gh run view 45647204820 --log`: `diff: 0 non-comment lines, sha256
  e3b0c44298fc` at 15:38:38Z; run is `workflow_dispatch`, `main`, `9f742a9`, success. Matches post-deploy.md:22-23.
  This folds in the 2d review nit (`specs/2d/review.md`, first finding).
- **PR #12 merged (AC2): OK.** `gh pr view 12`: MERGED 16:26:23Z as `cba2ca4`; files are docs and gate files only
  (three `post-deploy.md`, 2d brief, review, security gate, board). Nothing to deploy.
- **Board vs ORCHESTRATOR section 3 (AC2): OK.** 2a `DONE`: post-deploy.md now has migration in production history,
  drift green on the diff content, and the required read-only check; no user-facing feature (pgTAP proves the
  behavior). 2d `DONE`: orchestrator's decision (brief:58), docs-only PR merged. 2b row unchanged, still
  `VERIFYING`. New row 2e `IN_REVIEW`, matching the brief's State.
- **Handoff (AGENT_RULES 20, 24): OK.** verify.sh summary line present (brief:57); files, verification and the 2d
  decision recorded.
- **AC4 gates: pending.** `specs/2e/security-gate.md` is not on the branch yet, and there is no open PR for the branch
  (`gh pr list --head chore/2e-2a-close-out` is empty), so CI `verify`, `db-check`, `secrets`, `merge-gate` are
  not yet run. These must be green before merge; they are not review findings.

## Findings

- **tasks/2e/TASK_BRIEF.md:55, nit, owner: git-release.** "check result table" is stale: commit `8076308` turned
  the rows into a list. Say "check result list" (or "check result") so the Handoff matches the file.
- **tasks/2e/TASK_BRIEF.md:59, nit, owner: git-release.** "First gate round: security PASS, review APPROVE" can't be
  checked from the repo: no `specs/2e/` file was ever committed (`git log --all -- specs/2e` is empty). Either commit
  gate files per round or say the first round was not committed, so the next agent doesn't look for them
  (AGENT_RULES 25).
- **specs/2a/post-deploy.md:55-56, nit, owner: git-release.** The two new lines are about 125 and 250 characters;
  the rest of the file wraps near 118. Renders fine on GitHub; wrap for consistency only.
- **tasks/2e/TASK_BRIEF.md:58, nit, owner: orchestrator.** 2d moves to `DONE` without a `post-deploy.md`, which
  ORCHESTRATOR section 3 lists as the requirement for `DONE`. The reason (docs-only, nothing to deploy) is sound and
  is in the brief; consider a one-line entry in `tasks/decisions.md` so the exception is findable as precedent.

No blockers, no should-fix.

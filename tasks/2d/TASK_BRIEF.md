# Task 2d: post-deploy records for tasks 2a, 2b and 2c

| Field | Value |
|-------|-------|
| State | IN_REVIEW |
| Owner role | git-release |
| Branch | `chore/2d-post-deploy-records` |
| Worktree | `../wt-2d-git-release` |
| Depends on | 2a (PR #10), 2b (PR #11), 2c (PR #9), all merged |

## Request

Orchestrator, 2026-11-25, after the person merged PR #11 (task 2b): confirm the 2a/2b/2c migrations are in
production history, run the drift check on `main`, write `specs/<id>/post-deploy.md` for 2a, 2b and 2c per
`roles/git-release.md`, and move each task to `DONE` only if its evidence is complete. 2b stays `VERIFYING`
until the person's dashboard items (1-21) and item 22 (production OTP rate-limit check) are proven.

## Goal

Each merged task of the 2-series has a post-deploy record in the repo, and the board shows its true state.

## Acceptance criteria

- [ ] AC1: `specs/2a/post-deploy.md`, `specs/2b/post-deploy.md` and `specs/2c/post-deploy.md` exist, each with the merge commit and deploy evidence, the production migration history (read-only), the drift run after deploy (id, commit, result judged on the diff content), and each acceptance criterion checked or marked open with who must close it.
- [ ] AC2: `tasks/board.md` moves a task to `DONE` only when its record has no open item; otherwise `VERIFYING`.
- [ ] AC3: no app code, migration, test, workflow, script or rulebook changes; no secret or project key value in any file.
- [ ] AC4: `scripts/verify.sh` passes on this branch; security gate PASS; review APPROVE; CI `verify`, `db-check`, `secrets`, `merge-gate` green.

## Security rows that apply

- Row 13 (git-release): no `.env` tracked. Docs only otherwise; the records must not contain secrets or key values.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
specs/2a/post-deploy.md
specs/2b/post-deploy.md
specs/2c/post-deploy.md
```

**Out of scope:** everything else. Lesson L17's gate-check fix (exclude `post-deploy.md` from `LAST_CODE`) is a
framework change for devops-cicd and the person; this task avoids it by recording the 2-series in its own task.

## Inputs

- `roles/git-release.md` (Ship outputs), ORCHESTRATOR.md section 3 (`VERIFYING` / `DONE`)
- `tasks/2a/TASK_BRIEF.md` (AC8), `specs/2a/schema.md` section 7 (required read-only production check)
- `tasks/2b/TASK_BRIEF.md` (dashboard checklist items 1-22), `specs/2b/security-gate.md`
- `tasks/2c/TASK_BRIEF.md`

## Destructive change?

- [x] No (documentation only)
- [ ] Yes

---

## Handoff (each role appends; never delete earlier entries)

### git-release, 2026-11-25

- **Changed:** `specs/2a/post-deploy.md`, `specs/2b/post-deploy.md`, `specs/2c/post-deploy.md`, `tasks/board.md`, this brief.
- **Verified (read-only):** production migration history via the Supabase connector's `list_migrations` (no SQL);
  drift run 45651393581 on `main` (af59b2d): `diff: 0 non-comment lines`, "No drift."; GitHub check runs of the merge commits.
- **Result:** 2c `DONE`; 2a `VERIFYING` (the person runs the two read-only `pg_default_acl` SELECTs, see
  `specs/2a/post-deploy.md`); 2b `VERIFYING` (dashboard items 1-21 and item 22 are the person's).
- **verify.sh:** `bash scripts/verify.sh` (brief from branch name): `verify.sh: PASS 17/17 (1 skipped)` (skipped: test:e2e, no script).
- **Gates:** security PASS (`specs/2d/security-gate.md`), review APPROVE (`specs/2d/review.md`), each from a fresh context, each in its own commit after the records.
- **Gate nits left out of the records on purpose (fixing them would make both gates stale; they go into the 2a/2b close-out):** (review) the first 2a drift run 45647204820 also logged `diff: 0 non-comment lines, sha256 e3b0c44298fc`, "No drift."; (review) check the Supabase Preview check on `af59b2d` again when 2b closes (it was in_progress at 16:20 UTC); (security I1) the person may record in `tasks/decisions.md` that read-only verification SELECTs in the SQL editor are allowed for them; (security I2) item 22: the key stays in a shell variable only, and if there's no 429 by attempt 9, stop and tell security (see `specs/2b/security-gate.md`).
- **Left to do (done, see Gates):** security gate (`specs/2d/security-gate.md`) and code review (`specs/2d/review.md`), each in a fresh context and its own commit after the records.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

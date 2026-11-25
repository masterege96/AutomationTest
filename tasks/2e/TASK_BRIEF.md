# Task 2e: close out task 2a with the person's production `pg_default_acl` check

| Field | Value |
|-------|-------|
| State | DONE |
| Owner role | git-release |
| Branch | `chore/2e-2a-close-out` |
| Worktree | `../wt-2e-git-release` |
| Depends on | 2a (PR #10), 2d (PR #12), both merged |

## Request

Orchestrator, 2026-11-25 ~16:30 UTC: the person ran the two read-only SELECTs from `specs/2a/post-deploy.md` in the
dashboard SQL editor (screenshots shown to the orchestrator). Record the rows, move 2a to `DONE`, in a small docs PR.

## Goal

`specs/2a/post-deploy.md` holds the production evidence for AC8, and the board shows 2a and 2d as `DONE`.

## Acceptance criteria

- [ ] AC1: `specs/2a/post-deploy.md` records both query results (who ran them, when, the rows) and states that they match `specs/2a/schema.md` section 7 and security's rule (no per-schema row other than `public` and `storage`; `storage` matches local).
- [ ] AC2: `tasks/board.md`: 2a `DONE`, 2d `DONE` (PR #12 merged, docs only, nothing to deploy); 2b unchanged (`VERIFYING`).
- [ ] AC3: the 2d review nit is folded in: the first 2a drift run's line (`diff: 0 non-comment lines`) is recorded.
- [ ] AC4: docs only; no secret, key or project-ref value; `scripts/verify.sh` passes; security gate PASS; review APPROVE; CI `verify`, `db-check`, `secrets`, `merge-gate` green.

## Security rows that apply

- Row 13: no `.env` tracked; no secret in the records.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
specs/2a/post-deploy.md
```

## Inputs

- The person's results, relayed by the orchestrator (see `specs/2a/post-deploy.md`).
- `specs/2a/schema.md` section 7.

## Destructive change?

- [x] No (documentation only)
- [ ] Yes

---

## Handoff (each role appends; never delete earlier entries)

### git-release, 2026-11-25

- **Changed:** `specs/2a/post-deploy.md` (check result list, AC8 PASS, Result DONE; first drift run's diff line), `tasks/board.md` (2a DONE, 2d DONE, row 2e), this brief.
- **Verified:** the rows match the expected values in `specs/2a/schema.md` section 7 and `specs/2a/threat-model.md`; Supabase Preview on `af59b2d` (2b) is still `in_progress` at 16:32 UTC (left for 2b's close-out).
- **verify.sh:** `bash scripts/verify.sh` (brief from branch name): `verify.sh: PASS 17/17 (1 skipped)` (skipped: test:e2e, no script); the later wording-only commit touches docs only.
- **2d DONE:** the orchestrator's decision: PR #12 is merged and is docs only, so there is nothing to deploy and no post-deploy record of its own.
- **First gate round** (gate files not committed, replaced by the second round): security PASS, review APPROVE; their nits (table pipes, "below" vs "above") were fixed in commit 8076308, so both gates were run again in fresh contexts.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

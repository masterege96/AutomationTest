# Task 3c: task 3 post-deploy record, release checklist, PROJECT_CONTEXT refresh

| Field | Value |
|-------|-------|
| State | IN_REVIEW |
| Owner role | git-release |
| Branch | `chore/3c-post-deploy` |
| Worktree | `../wt-3c-git-release` |
| Depends on | 3 (PR #14, merged) |

## Request

Orchestrator, 2026-11-25 18:46 UTC, after the person merged PR #14: confirm the todos migration in production
history (read-only), run the drift check, write `specs/3/post-deploy.md` (task 3 stays `VERIFYING`), add a release
checklist for the person to the task 3 brief, and refresh `PROJECT_CONTEXT.md` for what task 3 established (e2e
command, zod, test layout and examples, `MAILPIT_URL`).

## Goal

The repo shows task 3's production state truthfully, and the person has one checklist for releasing sign-in.

## Acceptance criteria

- [ ] AC1: `specs/3/post-deploy.md` has the merge commit, the integration check, production migration history including `20261125165117 create_todos`, the drift run after deploy judged on its content, and what is proven vs open.
- [ ] AC2: task 3 is `VERIFYING` on the board and in its brief; nothing claims real-user proof that doesn't exist.
- [ ] AC3: the task 3 brief has a release checklist for the person covering hosting env, SMTP, URLs, email templates, Turnstile/3b, P1-revised, P2, P4, and the real-user run, with no secrets.
- [ ] AC4: `PROJECT_CONTEXT.md` changes only facts decided or built in task 3 (e2e command, zod, test layout, examples, `MAILPIT_URL` as a test-only name); no new decision is invented.
- [ ] AC5: `scripts/verify.sh` passes; security gate PASS; review APPROVE; CI green.

## Security rows that apply

- Row 13: no secret or key value in any file.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
specs/3/post-deploy.md
PROJECT_CONTEXT.md
```

## Inputs

- `specs/3/schema.md` section 10, `specs/3/security-gate.md` (release lock), `tasks/3/TASK_BRIEF.md`, `tasks/decisions.md`.

## Destructive change?

- [x] No (documentation only)
- [ ] Yes

---

## Handoff (each role appends; never delete earlier entries)

### git-release, 2026-11-25

- **Changed:** `specs/3/post-deploy.md`, `PROJECT_CONTEXT.md`, `tasks/3/TASK_BRIEF.md` (state, release checklist), `tasks/board.md`, this brief.
- **Verified (read-only):** `list_migrations` shows `20261125165117 create_todos`; integration check on `89b1c2e` success; drift run 45678585136 on `89b1c2e`: `diff: 0 non-comment lines`, "No drift.".
- **verify.sh:** `bash scripts/verify.sh` (brief from branch name, local stack env exported in the shell only): `verify.sh: PASS 19/19 (0 skipped)`. (A first run failed 7 e2e tests only because the local stack had loaded its email templates from a worktree I had just removed; restarting the stack from the main checkout fixed it.)
- **Gate round 1:** security FAIL (R1-R9 dropped the P1-revised Fail outcome, the P2 Fail action and the IP-forwarding / secret-key item), review CHANGES_REQUESTED (merge time 18:46 instead of 18:42:59). Fixed in 6d65d3c; round-1 gate files not committed.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

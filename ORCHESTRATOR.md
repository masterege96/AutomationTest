# Orchestrator

The orchestrator routes tasks between roles, moves them between states, and
decides when a task is done. It does not write app code, migrations or tests.
It reads files and runs checks; it never trusts a role's claim without the
check's output.

All agents follow `rules/AGENT_RULES.md`. The rulebooks in `rules/` apply to
every task.

## 1. Roles and the order they work in

| Phase | Role | Produces |
|-------|------|----------|
| 0 | git-release, devops-cicd | Repo, branch protection, CI, deploy path, drift check, pinned versions (**Phase 0 gate**) |
| Spec | product-spec | `tasks/<id>/TASK_BRIEF.md` with acceptance criteria |
| Design | db-architect | `specs/<id>/schema.md` (tables, RLS, indexes, two-step plan for destructive changes) |
| Design | security | `specs/<id>/threat-model.md` (which rows of `security-baseline.md` apply, auth rules) |
| Build | db-builder | Migrations, DB tests, seed data |
| Build | backend-dev | API routes, validation, business logic |
| Build | frontend-dev | UI, client state, accessibility |
| Build (parallel) | qa-test | Test plan and tests from the acceptance criteria, including abuse tests |
| Gate | security | Security gate report `specs/<id>/security-gate.md` |
| Gate | code-reviewer | Review report `specs/<id>/review.md` |
| Ship | git-release | PR merged, release tag, post-deploy verification `specs/<id>/post-deploy.md` |

Builders work in parallel only in separate git worktrees
(`../wt-<task-id>-<role>`), each on its own branch.

## 2. Phase 0 gate (runs before anything else)

No task leaves `BACKLOG` until `scripts/bootstrap-check.sh` exits 0.

While it fails, only git-release and devops-cicd may work, and only on Phase 0.
Phase 0 is done when:

- the git repo exists with a remote, and `main` is protected (required PR review and required checks)
- CI runs `scripts/verify.sh` on every PR, and the `db-check` job builds the DB from scratch
- the deploy path is connected (Supabase integration or CI deploy job) **before the first real table**
- the nightly drift check workflow exists
- tool versions are pinned (`.nvmrc`, `package.json#engines`, `packageManager`, lockfile, Supabase CLI version) and the local tools match
- `.gitattributes` forces LF, `.gitignore` covers `.env*`, secret scanning runs in CI
- `PROJECT_CONTEXT.md` is filled in, including which security-baseline rows are N/A and why

## 3. Task states

```
BACKLOG → SPEC_READY → IN_PROGRESS → IN_REVIEW → VERIFYING → DONE
                ↑            │             │           │
                └──── BLOCKED ←────────────┴───────────┘
```

| State | Meaning | Who moves it in | Required to move in |
|-------|---------|-----------------|---------------------|
| `BACKLOG` | Idea or request, not specified | anyone | — |
| `SPEC_READY` | Brief, schema design and threat model exist | orchestrator | Phase 0 gate green; brief has acceptance criteria; `schema.md` and `threat-model.md` exist if the task touches DB or auth |
| `IN_PROGRESS` | A builder is working | orchestrator | Builder role assigned; worktree and branch named in the brief |
| `IN_REVIEW` | Build is finished | the builder | `verify.sh` green on the branch, summary line in the brief's Handoff |
| `VERIFYING` | Merged, waiting for production proof | orchestrator | Security gate PASS, review APPROVE, required CI checks green, PR merged |
| `DONE` | Proven in production | orchestrator only | `post-deploy.md`: migrations in production history, drift check green, feature tested as a real user |
| `BLOCKED` | Can't continue without something | any role | A `Blocked` entry: what's missing, who must provide it |

## 4. Bounce-back rules

Send the task back instead of guessing:

| Problem | Goes back to | State |
|---------|--------------|-------|
| Brief ambiguous or missing acceptance criteria | product-spec | `BLOCKED` |
| Builder needs a change outside its allowed paths | owning role (new sub-task) | `BLOCKED` |
| `verify.sh` fails | the builder whose files fail | `IN_PROGRESS` |
| A test fails | the role that owns the failing code (not qa-test, unless the test is wrong, which qa-test decides) | `IN_PROGRESS` |
| Security gate FAIL | the owner listed in the failing baseline row | `IN_PROGRESS` |
| Review: changes requested | the builder | `IN_PROGRESS` |
| Post-deploy verification fails | git-release opens a fix task; original task stays `VERIFYING` | `VERIFYING` |
| A role bounces the same task 3 times | the person | `BLOCKED` |

## 5. Stop rules (everything stops until fixed)

1. **Drift check red:** no deploys and no merges of DB changes. db-builder owns the fix (`rules/database-and-deploy.md` rule 7).
2. **Secret exposed:** all work stops. The person rotates the secret; security confirms.
3. **Phase 0 check fails** (for example, someone removed branch protection): no task moves forward.
4. **Production changed by hand outside the emergency exception:** treat as a drift incident.

## 6. Escalate to the person (never decide alone)

- Destructive DB changes (drop, rename, truncate, data deletion)
- Anything that needs production write access or a secret
- Adding a new service, paid tool or major dependency
- Overriding a security gate FAIL
- Changing a rulebook in `rules/`

## 7. Files

```
tasks/
  board.md                 # one line per task: id, title, state, owner
  <id>/TASK_BRIEF.md       # from templates/TASK_BRIEF.md
  decisions.md             # decisions the person made
  lessons.md               # failures → which contract or check to fix
  incidents/               # drift and secret incidents
specs/<id>/
  schema.md  threat-model.md  test-plan.md
  security-gate.md  review.md  post-deploy.md
```

## 8. Learning loop

Every entry in `tasks/lessons.md` ends with a fix to a role contract, a
rulebook or a script. A lesson without a fix stays open. Review open lessons
before starting each new task.

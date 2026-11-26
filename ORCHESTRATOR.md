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

- the git repo exists with a remote, and `main` is protected (PR required; required checks `verify`, `db-check`, `secrets`, `merge-gate`; see "Merge approval")
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

The `| State |` row of `tasks/<id>/TASK_BRIEF.md` is the only record of a task's
state. Whoever moves a task in (column "Who moves it in") edits that row: the state
word first, optionally followed by a note, e.g. `VERIFYING (the person: ...)`.
`bash scripts/board.sh` prints the board (id, title, state, owner) from the briefs.

## 3a. Merge approval

GitHub's required review count on `main` is **0**. Approval is the required
**`merge-gate`** check from `.github/workflows/gate.yml`. It runs on
`pull_request_target`, so the workflow and `scripts/gate-check.sh` come from `main`;
the PR's commit is only fetched and read with git, never checked out or executed.
A PR therefore can't edit the gate that judges it (open residual risk: a PR-defined
job with the same check name, S14, task 4c; see `tasks/lessons.md` L11).
It always judges against `main` and fails for any other base. It passes only when, for the task
named by the branch (`<type>/<id>-<name>`):

- the **first** non-empty line of `specs/<id>/security-gate.md` is `Result: PASS`
- the **first** non-empty line of `specs/<id>/review.md` is `Result: APPROVE`
- both files were committed on the branch after the PR's last **net code change** (what
  the branch changes compared with `main`), so a review can't approve code that changed
  afterwards. A clean catch-up merge of `main` doesn't make them stale unless `main` changed a
  file this PR also changes (then they may be reported stale: fail safe); a conflict
  resolution or any other edit inside a merge commit that changes code does. Code means
  every path except the two gate files and `tasks/**`: `specs/<id>/post-deploy.md` doesn't
  count as code either, while `tasks/decisions/**` and
  the frozen archive `tasks/decisions.md` do count as code. A PR that changes only `tasks/**` still
  needs both gate files committed on the branch. Any new code change means both gates
  run again, each in its own commit. If equality can't be shown the gate is stale (fail
  safe); no merge-base with `main` is a FAIL.
- if the PR's net change touches a protected path (`.github/**`, `scripts/**`,
  `rules/**`, `roles/**`, `templates/**`, `ORCHESTRATOR.md`, `AGENTS.md`,
  `.gitleaks.toml`, `package.json`, `package-lock.json`, `supabase/config.toml`), the
  PR carries the `framework-change-approved` label. Only the person adds it
  (AGENT_RULES 18a). A protected file changed on `main` and brought in by a catch-up
  merge doesn't count as the PR's change.
- the label must be applied (GitHub server time) strictly after the last push that
  changed the PR's net change on protected paths; commit dates are never used. So
  **the person re-labels after** (a) a force-push, (b) any push that changes a
  protected file, (c) a catch-up merge where `main` changed a protected file that this
  PR also changes. A push that changes only non-protected files needs no re-label.
  When the label time or the push times can't be read, the gate fails (fail closed).

Branch protection on `main`: PR required, 0 approvals, required checks `verify`,
`db-check`, `secrets`, `merge-gate`, and **"Do not allow bypassing the above settings"
on** (admins included).

**A PR with merge conflicts gets no CI run** (`tasks/lessons.md` L19, L16). While a
PR is `CONFLICTING`, GitHub starts no `pull_request` workflow runs, so `verify`,
`db-check` and `secrets` don't run and only `merge-gate` (`pull_request_target`)
does. A label change on such a PR doesn't produce a CI run either. `gh run rerun`
re-uses the old run's event payload (the old labels), so it can't pick up a new
label. To re-evaluate, resolve the conflict by merging `main` into the branch (the
push starts a fresh run). Merging `main` before running the gates is recommended only
for PRs whose code conflicts with `main`: the conflict resolution is a code change, so
the gates would have to run again. A clean catch-up merge doesn't make the gates stale
unless `main` changed a file this PR also changes (it can still need a re-label, case (c)
above). After each merge, git-release checks
the other open PRs for conflicts.

**security** and **code-reviewer** each run in a fresh agent context, never the
builder's, and never each other's. They read the repo and the brief, not the builder's
conversation.

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
  <id>/TASK_BRIEF.md       # from templates/TASK_BRIEF.md; its | State | row is the task's state
  <id>/lessons.md          # this task's lessons (ids L<id>.<n>) and Closes: lines (section 8)
  decisions/<YYYY-MM-DD>-<task-id>-<slug>.md   # one file per decision the person made
  lessons.md               # frozen archive (L1-L27): cite entries, never add
  decisions.md             # frozen archive of earlier decisions: cite entries, never add
  incidents/               # drift and secret incidents
specs/<id>/
  schema.md  threat-model.md  test-plan.md
  security-gate.md  review.md  post-deploy.md
```

Each task writes only its own files, so parallel task branches don't conflict over
state, lessons or decisions. Read them from the repo root with `bash scripts/board.sh`
(the board) and `bash scripts/lessons.sh` (open lessons). A decision file has the
fields Date, Task, Who (the person's own words), Source and a Decision section; see
`tasks/decisions/2026-11-25-4a-step-4-go-ahead.md`.

## 8. Learning loop

Lessons go in `tasks/<id>/lessons.md` of the task that found them, as headings
`## L<id>.<n>. <title> (<status>)` with the next free `<n>` (1, 2, ...). Every lesson
ends with a fix to a role contract, a rulebook or a script. A lesson without a fix
stays open. Run `bash scripts/lessons.sh` and review the open lessons it lists before
starting each new task.

A lesson is closed when its status (the last `( ... )` at the end of the heading)
starts with `fixed`, `closed` or `info`, or when a line `Closes: <id>[, <id>...]` in
any `tasks/<id>/lessons.md` names it. Archived lessons in `tasks/lessons.md` are
closed only with a `Closes:` line in the fixing task's file; the archive isn't edited.

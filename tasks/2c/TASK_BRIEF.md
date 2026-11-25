# Task 2c: verify.sh builds the local database before the project checks

| Field | Value |
|-------|-------|
| State | BACKLOG |
| Owner role | devops-cicd |
| Branch | `ci/2c-verify-db-first` |
| Worktree | `../wt-2c-devops-cicd` |
| Depends on | none |

## Request

The person, 2026-11-25: "Task 2: go with all the recommendations, and do the verify.sh fix PR."

The recommendation they accepted (from the orchestrator): `scripts/verify.sh` runs `npm test` and
`test:e2e` (section "5. Project checks") **before** "6. Database from scratch" starts the local
Supabase stack, so tests that need the running local stack (auth, e2e) can't pass in verify.sh or CI.
Fix: move the "Database from scratch" section so it runs before the project checks
(typecheck/lint/test/test:e2e/build), renumber the section headings, and add a comment explaining why.
Nothing else in verify.sh changes; no check is removed or weakened.

## Goal

When a builder or CI runs `scripts/verify.sh`, the local Supabase stack is started and the database is
built from scratch before `typecheck`, `lint`, `test`, `test:e2e` and `build` run, so tests that need the
local stack can pass. Every existing check keeps its name and its pass/fail behavior.

## Acceptance criteria

Each one must be testable. qa-test writes at least one test per line. "Before" means `scripts/verify.sh`
on `main`; "after" means the one on this branch. Compare the outputs of the same command, on the same
machine state, before and after.

- [ ] AC1 (order): Given a repo with `supabase/` and `package.json`, when `scripts/verify.sh` runs, then the `[database]` heading and all its result lines appear in the output **before** the `[project]` heading. `[scope]`, `[migrations]`, `[secrets]` and `[code safety]` still come first, in that order.
- [ ] AC2 (same checks): Given the same machine state, when the old and the new `verify.sh` each run, then the set of result lines (`PASS`/`FAIL`/`SKIP` plus check name) is identical, only reordered. No check is added, removed or renamed; the `PASS`, `FAIL`, `SKIP` counts and the total are the same.
- [ ] AC3 (same pass/fail behavior): each check keeps its conditions: `typecheck`, `lint`, `test`, `build` still FAIL when the script is missing from `package.json`; `test:e2e` still SKIPs when missing; the DB checks are still `all migrations apply to an empty database`, `database tests (supabase test db)` and `SQL lint (no errors)` with the same commands and flags; `[database]` still runs only if `supabase/` exists, and `[project]` only if `package.json` exists (otherwise `SKIP  project checks (no package.json)`, as before).
- [ ] AC4 (summary line): the last line keeps its exact format, `verify.sh: PASS <n>/<total> (<k> skipped)` or `verify.sh: FAIL <n>/<total> failed: <names> (<k> skipped)`, and the exit code is still 0 on PASS and 1 on FAIL. `<names>` lists failed checks in the order they ran, so a DB failure is now listed before project failures; that is the only difference.
- [ ] AC5 (`--no-db` locally): Given `CI` is not `true`, when `scripts/verify.sh --no-db` runs, then the `[database]` section shows only `SKIP  database build from scratch (--no-db)`, no Supabase command runs, and every other section (including `[project]`) still runs and reports.
- [ ] AC6 (`--no-db` in CI): Given `CI=true`, when `scripts/verify.sh --no-db` runs, then the output shows `FAIL  database build from scratch (--no-db) (skipped, but required in CI)` and the summary is FAIL, exactly as before.
- [ ] AC7 (unhappy path, Docker stopped): Given Docker is not running and the local stack is not up, when `scripts/verify.sh` runs, then `FAIL  local database could not start` (with the log tail and the Docker/ports hint) and `SKIP  migrations, database tests and SQL lint (local database not running)` appear **before** `[project]`. The run doesn't stop there: `[project]` still runs and prints a result line for each of `typecheck`, `lint`, `test`, `test:e2e`, `build`; the summary is FAIL and names `local database could not start`; exit code 1.
- [ ] AC8 (unhappy path, no Supabase CLI): Given the Supabase CLI isn't available, the run shows `SKIP  database build from scratch (Supabase CLI not installed)` (with `CI=true`: the `(skipped, but required in CI)` FAIL) before `[project]`, and the project checks still run, as before.
- [ ] AC9 (stack left up for tests): Given the DB section succeeded, when the project checks run, then the local stack is still running: verify.sh runs no `supabase stop` between or after the sections (observable: no stop step in the DB log; `supabase status` succeeds right after the run).
- [ ] AC10 (headings and comment): the section headings are numbered 1 to 6 in file order ("5. Database from scratch", "6. Project checks (typecheck, lint, tests, build)"), and a comment at the database section says it runs before the project checks because tests (auth, e2e) need the running local stack.
- [ ] AC11 (diff is only the move): `git diff main -- scripts/verify.sh` shows only the moved block, the two renumbered headings and the new comment. The moved block's lines are otherwise byte-identical (`git diff --color-moved` shows them as moved).
- [ ] AC12 (gate): `scripts/verify.sh` passes on this branch (summary line pasted in Handoff); CI `verify` and `db-check` are green.

## Security rows that apply

From `rules/security-baseline.md` (security fills this in during Design).

- [ ] Row #: abuse test: (product-spec flags none: this only reorders the done gate. Security confirms no check is weakened, per AC2, AC3, AC6.)

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). Copy them
from the role's contract in `roles/`. One glob per line, `# comments` allowed,
a line starting with `!` excludes (e.g. `!app/api/**`). `tasks/**` is always allowed.

```
scripts/verify.sh
```

**Out of scope:** any other script (`scripts/gate-check.sh`, `scripts/bootstrap-check.sh`, `scripts/ci/**`); any workflow in `.github/workflows/**` (including giving the `verify` job env vars or its own Supabase setup); adding, removing or changing any check; stopping the stack at the end of verify.sh; `package.json`, tests, app code.

**Protected path:** `scripts/**` is a framework path (ORCHESTRATOR.md 3a). The PR passes `merge-gate` only with the `framework-change-approved` label, which only the person adds (AGENT_RULES 18a). No agent adds it.

## Inputs

- `scripts/verify.sh` (sections "5. Project checks" and "6. Database from scratch", currently in that order)
- `.github/workflows/ci.yml` (`verify` job runs `bash scripts/verify.sh` with `CI=true`, no `--no-db`)
- ORCHESTRATOR.md 3a (merge approval, `framework-change-approved`)
- Spec files: none (no schema or threat model needed)

## Destructive change?

- [x] No (reorders a script; no data, no drop or rename). Note: the DB section runs `supabase db reset` on the **local** stack, as it already does; now that happens before the tests, so tests start on a freshly reset local database.
- [ ] Yes

## Questions for the person

1. Tests that need the local stack also need its URL and keys as env vars. The CI `verify` job sets none today, and workflows are out of scope here. Should that be a separate task (devops-cicd, workflow) when the first such test lands, or part of this PR? Default if you don't say: separate task; this PR only changes the order.
2. Locally, `verify.sh` now resets the local database before the tests instead of after them. Local data was wiped either way; confirm that's fine (default: yes).

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/2c/TASK_BRIEF.md` (new), `tasks/board.md` (row 2c added)
- **Verified:** brief from `templates/TASK_BRIEF.md`; section order read from `scripts/verify.sh` (project checks at lines 199-221, database at 223-255, summary at 257-265).
- **Left to do:** devops-cicd makes the change; security and code-reviewer gates; the person adds `framework-change-approved`.
- **Next role must know:** keep the moved block byte-identical (AC11). The `skip ... required` helper is what makes `--no-db` FAIL in CI; don't touch it.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

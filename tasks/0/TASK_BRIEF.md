# Task 0: Phase 0 bootstrap

| Field | Value |
|-------|-------|
| State | BLOCKED |
| Owner role | git-release, devops-cicd |
| Branch | `main` (Phase 0 exception: the repo was empty, so the initial commit goes to `main` directly, before branch protection) |
| Worktree | none (repo root `C:\Users\tubae\Claude\AutomationTest`) |
| Depends on | none |

## Goal

The repo, CI, pinned tools and project context exist so that `scripts/bootstrap-check.sh`
can gate every later task. No app features.

## Acceptance criteria

- [ ] AC1: `.gitattributes` (`* text=auto eol=lf`) and `.gitignore` (`.env*`, `!.env.example`) are the first commit.
- [ ] AC2: Next.js + TypeScript (App Router) scaffold and `supabase init` are committed; framework `scripts/`, `rules/`, `roles/`, `templates/`, `ORCHESTRATOR.md` are copied in.
- [ ] AC3: `PROJECT_CONTEXT.md` is filled in (hosting type Supabase-hosted; "Deploy path" line left as in the template).
- [ ] AC4: Versions pinned: `.nvmrc`, `engines`, `packageManager`, exact Supabase CLI devDependency, committed lockfile; npm scripts `typecheck`, `lint`, `test`, `build`.
- [ ] AC5: `.github/pull_request_template.md`, `CHANGELOG.md` (0.1.0), `ci.yml` (`verify`, `db-check`, `secrets`), `gate.yml` (`merge-gate`, `pull_request_target` from main) and `drift.yml` (nightly, read-only, `environment: production`) exist; every action and tool version pinned. (Updated 2026-11-25 after the L10 decision.)
- [ ] AC6: First migration (`init`, no schema changes) and a first pgTAP test in `supabase/tests`.
- [ ] AC7: `verify.sh --brief tasks/0/TASK_BRIEF.md` passes locally with Docker.
- [ ] AC8: `main` pushed and protected (PR required, 0 approvals, required checks `verify`, `db-check`, `secrets`, `merge-gate`, bypass not allowed, no force-push); labels `destructive-approved`, `framework-change-approved`, `security`, `db`, `blocked`, `drift` exist. (Updated 2026-11-25 after the L10 decision.)

## Security rows that apply

- [ ] Row 13: `.gitignore` covers `.env*`; gitleaks runs in CI (`secrets` job) and in `verify.sh`.

## Scope

**Allowed paths** (Phase 0: git-release + devops-cicd, plus the one-off framework copy and app scaffold).

```
# git-release
.github/pull_request_template.md
CHANGELOG.md
PROJECT_CONTEXT.md
# devops-cicd
.github/workflows/*
scripts/*
.nvmrc
.npmrc
package.json
package-lock.json
.gitattributes
.gitignore
.env.example
next.config.*
eslint.config.*
tsconfig.json
# one-off Phase 0 copy of the framework (owned by the person afterwards)
ORCHESTRATOR.md
rules/*
roles/*
templates/*
# one-off Phase 0 scaffold (create-next-app, supabase init, migration new)
AGENTS.md
app/*
public/*
supabase/config.toml
supabase/.gitignore
supabase/migrations/*
supabase/tests/*
```

**Out of scope:** any app feature, any table, Supabase cloud project, GitHub integration, secrets, anything against a remote database.

## Inputs

- Framework: `C:\Users\tubae\Claude\agent-team-framework`
- Repo: https://github.com/masterege96/AutomationTest (empty at start)

## Destructive change?

- [x] No
- [ ] Yes

---

## Handoff (each role appends; never delete earlier entries)

### git-release + devops-cicd, 2026-11-25

- **Changed:** first commit `.gitattributes` + `.gitignore`; then Next.js 16.4.6 scaffold, `supabase init` (local ports 55420-55429), framework copy, `PROJECT_CONTEXT.md`, pins (`.nvmrc` 24.11.0, engines, `packageManager` npm@11.6.1, `supabase` 3.2.0, exact deps, `.npmrc`, lockfile), npm scripts, PR template, `CHANGELOG.md` 0.1.0, `ci.yml`, `drift.yml`, `scripts/ci/install-gitleaks.sh`, migration `20261125104017_init.sql`, `supabase/tests/00_bootstrap_test.sql`, `tasks/*`. GitHub: `main` protected (PR, 1 review, checks verify/db-check/secrets, strict, linear history, no force-push, no deletion); labels destructive-approved, security, db, blocked, drift.
- **Verified:** local `verify.sh: FAIL 1/17 failed: CR line endings in migrations (1 skipped)` (false FAIL, lessons L1); `bootstrap-check: FAIL 1 of 30 checks failed (0 skipped)` (only: DB deploy path connected). CI run 45598529613 on main: secrets PASS, db-check PASS, verify FAIL (scope on push, fixed L9; gitleaks `-q`, L8).
- **Left to do:** the person: connect the deploy path (Supabase project + GitHub integration), add drift secrets, run drift once, fix L1/L2/L3/L8 in verify.sh, decide L10 (review vs. single account). Then a throwaway PR proving a red run (planted CR).
- **Next role must know:** use `npx supabase` (pinned CLI). `--passWithNoTests` must go when the first unit test lands (L5). Branch `ci/0-phase0-fixes` holds the CI-trigger fix and this handoff; it needs a PR.

### git-release + devops-cicd, 2026-11-25 (PR #1 merged, PR #2 gate hardening)

- **Changed:** PR #1 (squash 35a461c): verify.sh fixes L1/L2/L3/L8, bootstrap-check npm-scripts check, `scripts/gate-check.sh` + `gate` job, CI on PRs only, framework docs (L6, L10). PR #2 (`ci/0-gate-hardening`): `gate.yml` `merge-gate` on `pull_request_target` (S1), gate-check reads the PR head with git only, first-line Result (S4), fails without a merge-base (R2), `framework-change-approved` label for pipeline/framework files; old `gate` job kept in ci.yml for PR #2 only, checking out the PR head (R1); verify.sh gitleaks `--exit-code 99` (R3); drift.yml step-level secrets, `persist-credentials: false`, `environment: production`, issue links the run instead of pasting the diff (S6, S8); AGENT_RULES 18a; ORCHESTRATOR 3a; role docs; this brief and decisions (R4-R6).
- **Verified:** PR #1: deliberate red run 45600953422 (verify + db-check FAIL on a planted CR), green run 45604400447 (verify, db-check, secrets, gate PASS). Security gate PASS, review APPROVE. PR #2: see its gate reports and CI.
- **Left to do:** the items under Blocked. After PR #2 merges: a tiny PR removing the temporary `gate` job from ci.yml. Open should-fix findings from the PR #1 gates (S3, S5, S7, S9-S13) need tasks.
- **Next role must know:** pipeline/framework changes need the person's `framework-change-approved` label; agents never add it (AGENT_RULES 18a).

## Blocked (fill in only when BLOCKED)

- **Missing (all from the person):** (1) deploy path: Supabase cloud project + GitHub integration; (2) GitHub Environment `production` restricted to `main`, holding `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, then one green drift run; (3) branch protection: required check `merge-gate`, bypass not allowed; (4) the `framework-change-approved` label on PR #2.
- **Who must provide it:** the person

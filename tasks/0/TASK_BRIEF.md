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
- [ ] AC5: `.github/pull_request_template.md`, `CHANGELOG.md` (0.1.0), `ci.yml` (`verify`, `db-check`, `secrets`) and `drift.yml` (nightly, read-only) exist; every action and tool version pinned.
- [ ] AC6: First migration (`init`, no schema changes) and a first pgTAP test in `supabase/tests`.
- [ ] AC7: `verify.sh --brief tasks/0/TASK_BRIEF.md` passes locally with Docker.
- [ ] AC8: `main` pushed and protected (PR, 1 review, required checks `verify`, `db-check`, `secrets`, no force-push); labels `destructive-approved`, `security`, `db`, `blocked` exist.

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

## Blocked (fill in only when BLOCKED)

- **Missing:** deploy path (Supabase cloud project + GitHub integration), drift secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`; verify.sh fixes L1, L8; reviewer decision L10
- **Who must provide it:** the person

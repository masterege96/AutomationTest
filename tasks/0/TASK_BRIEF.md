# Task 0: Phase 0 bootstrap

| Field | Value |
|-------|-------|
| State | IN_PROGRESS |
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

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

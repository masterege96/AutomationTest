# Database and deployment rules

Applies to every project with a database: Supabase-hosted, self-hosted Supabase,
or plain Postgres. The rules are the same everywhere; only the tools that carry
them out differ (see "How, per hosting type").

## What the system does, in one paragraph

The Git repository is the only official description of the app and the database.
Every change to the database's structure is written as a numbered file (a
migration). When a change reaches `main`, machines check it, apply it to
production and deploy the matching app code from the same commit. A separate
drift check regularly rebuilds the database from the repo alone and compares it
with production: if they differ, someone changed production outside the process,
and that gets fixed before the next deploy.

## The rules

| # | Rule | Owner | Enforced by |
|---|------|-------|-------------|
| 1 | **The repo is the source of truth.** App code, website code and database structure (tables, columns, functions, policies, triggers, scheduled jobs) live in one repository. If it isn't in the repo, it doesn't officially exist. | git-release | bootstrap-check (single repo, `supabase/` present) |
| 2 | **Every structural change is a new migration file.** `supabase/migrations/<timestamp>_<what>.sql`, created with `supabase migration new <what>`. | db-builder | verify.sh (migration filename format) |
| 3 | **Never edit a migration that has been deployed.** Fix mistakes with a new migration. Production remembers which files it has applied; editing an old one changes the repo but never production. | db-builder | verify.sh + CI: fails if any migration already on `main` is modified or deleted |
| 4 | **Nobody changes production by hand.** No table editor, no SQL editor, no "quick fix": not the owner, not a developer, not an AI agent. Agents get read-only database access to production; write tools (`execute_sql`, `apply_migration`, `db push`) are forbidden against production in every role contract. **Emergency exception:** if production must be fixed by hand, the person writes the same change as a migration the same day and marks it applied, so the drift check is green again before the next deploy. | everyone; security audits | AGENT_RULES §4 + drift check |
| 5 | **Every change is tested on an empty database before it can merge.** CI builds a database from all migrations, runs the database tests and lints the SQL. A migration that does not apply cleanly from scratch never reaches production. | devops-cicd | CI `db-check` job (required check) |
| 6 | **Production is changed only by automation, only from `main`.** Database changes and app/website deploys come from the same commit, so they cannot drift apart. Migrations run in a transaction: all or nothing. | devops-cicd | Branch protection + deploy workflow |
| 7 | **The drift check runs nightly and after every deploy.** Read-only. Red means production differs from the repo. It is judged on the content of the diff, not on the tool's exit code. **While it's red, all deploys stop** (orchestrator rule). **db-builder** investigates, writes up the cause in `tasks/incidents/`, and fixes it with a migration or a reverted manual change. | devops-cicd runs it; db-builder owns red | Scheduled workflow; ORCHESTRATOR stop rule |
| 8 | **Secrets live only in secret stores.** GitHub Secrets, the hosting provider, the password manager. Never in a file, a commit, a chat, a screenshot or an AI conversation. CI scans every push for committed keys. | security | CI secret scan (gitleaks) |
| 9 | **Tool versions are pinned.** CLI, Node, Flutter, database image. Upgrade deliberately, in one commit, and watch the next runs. ("latest" broke a pipeline twice in one afternoon.) | devops-cicd | bootstrap-check (pins present, local versions match) |
| 10 | **Text files use LF line endings.** `.gitattributes` forces it; CI rejects CR characters in migrations. (Windows line endings once made 27 unchanged functions look "different" to the drift check.) | devops-cicd | bootstrap-check (`.gitattributes`) + verify.sh (CR scan) |
| 11 | **Destructive changes go in two steps.** Dropping or renaming a column, table or function: first ship code that no longer needs it, then drop it in a later migration. Take a backup before any destructive migration. | db-architect plans; db-builder writes | verify.sh flags `DROP`/`RENAME`/`TRUNCATE`; PR needs the `destructive-approved` label and a backup step |
| 12 | **Verify, don't assume.** A change is done when production shows it (migration history, drift check green, the feature works for a real user), not when the file is written or the build is green. | git-release (post-deploy verification) | ORCHESTRATOR: `DONE` requires the post-deploy record |
| 13 | **RLS on every exposed table.** Every table in an API-exposed schema has row level security enabled and at least one policy. | db-architect | verify.sh/CI: fails on any exposed table without RLS |
| 14 | **The deploy is connected before the first real table.** No table is created until the migration deploy path (integration or CI job) is live and the drift check runs. | devops-cicd | bootstrap-check (Phase 0) |

## How, per hosting type

| | Supabase-hosted | Self-hosted Supabase or plain Postgres |
|---|---|---|
| Applies migrations | Supabase GitHub integration ("Deploy to production" ON, branch `main`) | A CI job on push to `main`: `supabase db push --remote="$DATABASE_URL" --yes` (run with `--dry-run` first, in the logs) |
| Database credentials in CI | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | `DATABASE_URL` (a dedicated migration user, not the superuser if avoidable) |
| CI reaching the database | Handled by Supabase | Your job: firewall allowlist for CI, a self-hosted GitHub runner inside your network, or an SSH tunnel. Never open the database to the whole internet |
| Drift check | `supabase db diff --remote --schema <schemas>` | `supabase db diff --remote="$DATABASE_URL" --schema <schemas>` |
| Test databases | Optional Supabase branching (preview DB per pull request, paid) | A staging server, or the CI-built database from rule 5 |
| Backups before risky changes | Supabase backups / point-in-time recovery | Your job: `pg_dump` in the deploy job before `db push`, kept off the server |
| Approval before production | Branch protection on `main` (required reviews and checks) | Same, plus a GitHub Environment with required approval on the deploy job |
| Auth emails, rate limits, CAPTCHA | Supabase dashboard (custom SMTP is mandatory for real users) | Your config: SMTP server, reverse-proxy rate limits, CAPTCHA |

> The CLI commands above are for Supabase CLI 3.2.0. Check `--help` after any
> upgrade (rule 9), and don't copy commands from docs for another CLI version.

## Starting a new project (Phase 0)

No bootstrap script exists yet. git-release and devops-cicd do Phase 0 by hand from
their contracts (`roles/git-release.md`, `roles/devops-cicd.md`): repo and branch
protection, migrations folder, migration #1, a first database test, the CI checks,
the nightly drift check, `.gitattributes` and `.gitignore`. **Connect the deployment
(integration or CI job) before creating the first real table** (rule 14).
`scripts/bootstrap-check.sh` must pass before any other role starts.

## Adopting an existing project

1. **Freeze manual changes.**
2. **Take a baseline:** one migration that captures the current production schema exactly (`supabase db pull`, or `supabase migration fetch` if the history already contains it), recorded as already applied.
3. **Prove it:** the drift check against production must be green.
4. **Only then switch on automatic deploys.** From here on, the rules above apply.

Owner: db-builder (steps 2 and 3), devops-cicd (step 4), the person (step 1).

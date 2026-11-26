# Role: devops-cicd

**Mission:** Build and maintain the pipeline that checks every change and is the only path to production.

## When it runs
- **Phase 0** (with git-release): before any other role.
- When a task needs a CI, deploy, environment or tool-version change.
- When the drift check or a pipeline breaks.

## Owns (allowed paths)
```
.github/workflows/**
scripts/**
supabase/config.toml
.nvmrc
package.json          # engines, packageManager, scripts, devDependencies only
package-lock.json | pnpm-lock.yaml | yarn.lock
.gitattributes
.gitignore
next.config.*         # security headers block only (content comes from security)
.env.example          # names only, never values
.npmrc
tsconfig.json
next-env.d.ts
eslint.config.*
vitest.config.*
postcss.config.*
# Phase 0 only: the one-off app scaffold (create-next-app, supabase init)
# app/**, public/**, AGENTS.md, supabase/migrations/<init>, supabase/tests/<first test>
```

## Never touches
- App code, migrations, tests (except the scripts that run them).
- Secret **values**. It names secrets in workflows (`${{ secrets.X }}`); the person puts values into GitHub Secrets / the hosting provider.
- Never applies migrations or deploys from its own machine. Never disables or weakens a check to get green.

## Required inputs
- `PROJECT_CONTEXT.md`: hosting type, tool versions, commands, exposed schemas.
- `rules/database-and-deploy.md` (the "How, per hosting type" table).

## Outputs (Phase 0)
1. **Pinned versions:** `.nvmrc`, `engines`, `packageManager`, lockfile, Supabase CLI exact version in devDependencies. CI setup steps read the same pins (no `latest`).
2. **`.gitattributes`** `* text=auto eol=lf`; **`.gitignore`** with `.env*`, `!.env.example`.
3. **`ci.yml`** on `pull_request`, jobs as required checks:
   - `verify`: install with the lockfile, run `scripts/verify.sh` with `CI=true`; sets `DESTRUCTIVE_APPROVED=1` only when the PR has the `destructive-approved` label.
   - `db-check`: `supabase start`, `supabase db reset`, `supabase test db`, `supabase db lint` (also run inside verify.sh; this job is the explicit required check).
   - `secrets`: gitleaks on the full history.
   - `merge-gate` (in `gate.yml`, on `pull_request_target`): runs `scripts/gate-check.sh` from `main` and only reads the PR head with git (fetched to `refs/pr/head`, checked against and passed as `--head "$HEAD_SHA"`), never checks it out or runs it. Merge approval from `specs/<id>/security-gate.md` and `review.md`, plus the `framework-change-approved` label for pipeline/framework files (ORCHESTRATOR.md "Merge approval").
4. **Deploy** on push to `main`, from the same commit:
   - Supabase-hosted: GitHub integration "Deploy to production" ON for `main`, written in `PROJECT_CONTEXT.md` as `Deploy path: Supabase GitHub integration`.
   - Self-hosted / plain Postgres: `db push --dry-run` (logged), backup (`pg_dump`, stored off-server), `db push`, then app deploy. GitHub Environment `production` with required approval.
   - App deploy runs only after migrations succeed.
5. **`drift.yml`**: nightly schedule + after each deploy; read-only `supabase db diff` against production for the exposed schemas. Fails on a non-empty diff (content, not exit code), and opens/updates an issue labeled `drift` that links to the run (never pastes the diff: the repo may be public). The job uses `environment: production`: secrets live in the `production` environment, restricted to main. Secrets go only to the steps that need them (link, diff), and checkout uses `persist-credentials: false`. A manual run with `upload_diff=true` (the person's choice) uploads the raw `diff.sql` as a 1-day artifact, but only if `supabase db diff` exited 0 (a complete diff) and gitleaks finds it clean ("possible secret in production schema, not uploaded" otherwise); whoever runs it downloads it and deletes the artifact right away. The schedule and the default dispatch never expose the diff.
6. **`.env.example`** listing every env var name.

## Rules
1. The deploy path must be live, and the drift check must run, **before the first real table** (rule 14).
2. Tool upgrades: one tool per commit, deliberately, then watch the next two runs (rule 9).
3. CI reaching a self-hosted DB: allowlist, self-hosted runner or SSH tunnel. Never open the DB to the internet.
4. Migration user in CI is a dedicated role, not the superuser, where possible.
5. Every check that can be skipped locally must be required in CI (`CI=true`).
6. **Next.js upgrades (L25, L26):** at every version change of `next` in `package.json` (major, minor or patch; `eslint-config-next` alone doesn't count), in that upgrade's own commit and PR, run the project's CSP e2e tests (here: `tests/e2e/csp.spec.ts`) and the T1 proxy-bypass header suite (here: `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts`) against a production build, and paste their result lines into the brief's Handoff. The upgrade doesn't merge until security has re-checked the threat model's CSP section and its header/proxy-bypass sections (task 3: sections 6, 3.5, 3.7). A nonce CSP needs per-request rendering (`cacheComponents` / partial prerendering off); the next Next.js major is expected to make those always-on, so that upgrade needs a CSP re-design, not only a re-run (L25).

## Security baseline rows owned
#9 (rate limits / CAPTCHA config for self-hosted), #13 (secret scan), headers delivery for #11.

## Done when (gate)
- `scripts/bootstrap-check.sh` (full) passes.
- A throwaway PR shows every required check running and blocking on failure (prove one red run, e.g. a planted CR in a migration).
- Drift check has run once against production and is green.

## Hands off to
Orchestrator (Phase 0 complete) or the task's next role.

# Project context

Fill this in during Phase 0. Agents treat this file as the source of truth for
conventions. If something isn't here or in the repo, agents must ask, not guess.

## Project

- **Name:** AutomationTest
- **What it does (2 sentences):** Pilot app for the agent team framework: a to-do app with login, built on Next.js and Supabase. Each signed-in user can create, view, complete and delete only their own to-dos.
- **Hosting type:** Supabase-hosted
- **Repo URL:** https://github.com/masterege96/AutomationTest
- **Production URL:** not decided yet (app hosting not chosen; the person decides)
- **Deploy path:** Supabase GitHub integration / CI job (`supabase db push`)

## Stack and pinned versions

| Tool | Version | Pinned in |
|------|---------|-----------|
| Node | 24.11.0 | `.nvmrc`, `package.json#engines` |
| Package manager | npm 11.6.1 | `package.json#packageManager` |
| Supabase CLI | 3.2.0 | `package.json` devDependency / CI setup step |
| Postgres image | 17 | `supabase/config.toml` (`major_version`) |
| Framework (e.g. Next.js) | Next.js 16.4.6, React 19.3.0, TypeScript 5.9.3 | lockfile |
| Test runner | Vitest 5.1.1 | lockfile |
| Lint | ESLint 9.39.5 + eslint-config-next 16.4.6 | lockfile |

Every version in `package.json` is exact (`.npmrc` has `save-exact=true` and `engine-strict=true`).

## Commands (agents use only these)

| Purpose | Command |
|---------|---------|
| Install | `npm ci` |
| Dev server | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit/integration tests | `npm test` |
| End-to-end tests | none yet (`test:e2e` script added by qa-test when Playwright is approved) |
| Build | `npm run build` |
| Start local DB | `npx supabase start` |
| Reset local DB from migrations | `npx supabase db reset` |
| DB tests | `npx supabase test db` |
| SQL lint | `npx supabase db lint` |
| New migration | `npx supabase migration new <what>` |
| Done gate | `bash scripts/verify.sh --brief tasks/<id>/TASK_BRIEF.md` |
| Phase 0 gate | `bash scripts/bootstrap-check.sh` |

Use `npx supabase` so the pinned CLI from `node_modules` runs, not a global install.

## Conventions

- **Folder layout:** Next.js App Router at the repo root (no `src/`): `app/` pages and layouts, `app/api/**` route handlers, `components/`, `lib/client/`, `lib/server/`, `supabase/migrations/`, `supabase/tests/`, `tests/{integration,e2e,abuse}/`. Import alias `@/*` maps to the repo root.
- **Naming (files, components, tables, columns):** Components PascalCase (`TodoList.tsx`), other TS files kebab-case, tables plural snake_case (`todos`), columns snake_case, migrations `<timestamp>_<snake_case>.sql` from `supabase migration new`.
- **API style (route handlers / server actions / edge functions):** not decided yet. backend-dev proposes in the first feature brief; the person decides (record in `tasks/decisions.md`).
- **Validation library:** not decided yet (security baseline row 5 suggests zod; needs approval as a new dependency).
- **Error format returned by APIs:** not decided yet (set with the API style).
- **Where an example of each lives:** migration `supabase/migrations/*_init.sql`, DB test `supabase/tests/00_bootstrap_test.sql`, page `app/page.tsx`. No API route, component or unit test yet: the first feature task sets the example.

## Role paths

Leave empty to use the defaults in `roles/README.md`. List only overrides; no
path may belong to two roles.

| Role | Allowed paths (globs) |
|------|-----------------------|
| devops-cicd | `.npmrc`, `vitest.config.*`, `eslint.config.*`, `tsconfig.json`, `next.config.*` (tooling config) |
| git-release | `PROJECT_CONTEXT.md` (Phase 0 fill-in; later edits need the person's OK) |

## Exposed DB schemas

- Schemas exposed to the API: `public` (plus `graphql_public` per `supabase/config.toml`; no tables there)
- Schemas checked by the drift check: `public`

## Environment variables (names only, never values)

| Name | Client or server | Where it's stored |
|------|------------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | hosting provider |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | hosting provider |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | hosting provider, GitHub Secrets |
| `SUPABASE_ACCESS_TOKEN` | CI only (drift check) | GitHub Secrets (not added yet) |
| `SUPABASE_DB_PASSWORD` | CI only (drift check) | GitHub Secrets (not added yet) |
| `SUPABASE_PROJECT_ID` | CI only (drift check) | GitHub Secrets or variable (not added yet) |

## Security baseline: rows that don't apply

List any row from `rules/security-baseline.md` that doesn't apply, with a reason.
Every other row applies.

Proposed by git-release/devops-cicd in Phase 0 from the pilot scope (to-do app
with login). **security** must confirm in the first threat model.

| Row | Reason it's N/A |
|-----|-----------------|
| 4 | No prices, totals or discounts in a to-do app |
| 6 | No payments |
| 7 | No coupons, invites or other single-use items in scope |
| 10 | No AI/LLM feature in scope |
| 12 | No file uploads in scope |

## Hard constraints

- No Supabase cloud project, GitHub integration or secrets until the person decides (Phase 0 stop).
- No new paid services, tools or major dependencies without the person's approval.
- Production changes only via migrations merged to `main` and applied by automation.

# Project context

Fill this in during Phase 0. Agents treat this file as the source of truth for
conventions. If something isn't here or in the repo, agents must ask, not guess.

## Project

- **Name:**
- **What it does (2 sentences):**
- **Hosting type:** Supabase-hosted / self-hosted Supabase / plain Postgres
- **Repo URL:**
- **Production URL:**
- **Deploy path:** Supabase GitHub integration / CI job (`supabase db push`)

## Stack and pinned versions

| Tool | Version | Pinned in |
|------|---------|-----------|
| Node | | `.nvmrc`, `package.json#engines` |
| Package manager | | `package.json#packageManager` |
| Supabase CLI | | `package.json` devDependency / CI setup step |
| Postgres image | | `supabase/config.toml` (`major_version`) |
| Framework (e.g. Next.js) | | lockfile |

## Commands (agents use only these)

| Purpose | Command |
|---------|---------|
| Install | |
| Dev server | |
| Typecheck | |
| Lint | |
| Unit/integration tests | |
| End-to-end tests | |
| Build | |
| Start local DB | `supabase start` |
| Reset local DB from migrations | `supabase db reset` |
| DB tests | `supabase test db` |
| SQL lint | `supabase db lint` |
| New migration | `supabase migration new <what>` |

## Conventions

- **Folder layout:**
- **Naming (files, components, tables, columns):**
- **API style (route handlers / server actions / edge functions):**
- **Validation library:**
- **Error format returned by APIs:**
- **Where an example of each lives:** (one existing file per pattern: API route, component, migration, test)

## Role paths

Leave empty to use the defaults in `roles/README.md`. List only overrides; no
path may belong to two roles.

| Role | Allowed paths (globs) |
|------|-----------------------|
| | |

## Exposed DB schemas

- Schemas exposed to the API: `public`
- Schemas checked by the drift check:

## Environment variables (names only, never values)

| Name | Client or server | Where it's stored |
|------|------------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | hosting provider |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | hosting provider |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | hosting provider, GitHub Secrets |

## Security baseline: rows that don't apply

List any row from `rules/security-baseline.md` that doesn't apply, with a reason.
Every other row applies.

| Row | Reason it's N/A |
|-----|-----------------|
| | |

## Hard constraints

- (e.g. "no new paid services without approval", "EU data residency")

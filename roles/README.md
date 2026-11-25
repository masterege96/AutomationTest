# Role contracts

Every agent reads, in order: `rules/AGENT_RULES.md`, its own contract here,
`PROJECT_CONTEXT.md`, then its task brief. A contract adds rules; it never
relaxes the rulebooks.

## Format (every contract has these sections)

1. **Mission:** one sentence
2. **When it runs:** phase and trigger
3. **Owns (allowed paths):** the only paths it may change. These become the "Allowed paths" in its task briefs, which `verify.sh` enforces.
4. **Never touches:** paths and actions that are off-limits
5. **Required inputs:** if any is missing, set the task to `BLOCKED`
6. **Outputs:** files it must produce
7. **Rules:** role-specific
8. **Security baseline rows owned:** from `rules/security-baseline.md`
9. **Done when (gate):** objective checks, not opinions
10. **Hands off to:** next role(s)

## File ownership map (defaults for Next.js + Supabase)

Each path has exactly one owner. Override paths in `PROJECT_CONTEXT.md`
("Role paths") if the project's layout differs; never give two roles the same path.

| Path | Owner |
|------|-------|
| `tasks/<id>/TASK_BRIEF.md` (goal, acceptance criteria, scope) | product-spec (every role appends to Handoff) |
| `specs/<id>/schema.md` | db-architect |
| `specs/<id>/threat-model.md`, `specs/<id>/security-gate.md`, `.gitleaks.toml` | security |
| `specs/<id>/test-plan.md` | qa-test |
| `specs/<id>/review.md` | code-reviewer |
| `specs/<id>/post-deploy.md`, `CHANGELOG.md`, `package.json` `version` field, `.github/pull_request_template.md`, `.github/CODEOWNERS` | git-release |
| `supabase/migrations/**`, `supabase/seed.sql`, `supabase/tests/**` | db-builder |
| `app/api/**`, `lib/server/**`, `supabase/functions/**`, `middleware.ts`, `types/database.ts` (generated) | backend-dev |
| `app/**` (except `app/api/**`), `components/**`, `lib/client/**`, `public/**`, `styles/**` | frontend-dev |
| `tests/integration/**`, `tests/e2e/**`, `tests/abuse/**`, `playwright.config.*` | qa-test |
| `.github/workflows/**`, `scripts/**`, `supabase/config.toml`, `.nvmrc`, `package.json` (engines, packageManager, scripts, devDependencies), lockfile, `.gitattributes`, `.gitignore`, `.npmrc`, tooling configs (`tsconfig.json`, `next-env.d.ts`, `eslint.config.*`, `vitest.config.*`, `postcss.config.*`), `next.config.*` headers block; in Phase 0 only, the one-off app scaffold (`app/**`, `public/**`, `AGENTS.md`, first migration and DB test) | devops-cicd |
| Colocated unit tests (`*.test.ts` next to the code) | the role that owns the code |
| `package.json` `dependencies` | the role that needs it, with approval in the brief (AGENT_RULES §8) |
| `rules/**`, `roles/**`, `ORCHESTRATOR.md` | the person only |

## Flow

```
Phase 0: git-release + devops-cicd  →  bootstrap-check.sh green
Spec:    product-spec               →  TASK_BRIEF (SPEC_READY needs design below)
Design:  db-architect + security    →  schema.md + threat-model.md
Build:   db-builder → backend-dev → frontend-dev   (qa-test in parallel)
Gates:   security gate → code-reviewer
Ship:    git-release merges, verifies production → DONE
```

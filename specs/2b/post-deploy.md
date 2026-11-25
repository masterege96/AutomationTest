# Task 2b post-deploy verification: security headers + local/CI auth defaults + dashboard checklist

Author: git-release, 2026-11-25. Read-only evidence only; nothing in production was changed.

## Deploy

- PR #11 squash-merged as `af59b2d` at 2026-11-25 16:06 UTC. Required checks on the PR: `verify`, `db-check`,
  `secrets`, `merge-gate` all SUCCESS.
- What ships where:
  - `next.config.ts` headers: no production app hosting exists yet (`PROJECT_CONTEXT.md`: production URL and app
    hosting not decided), so the headers are not served to real users anywhere yet. They are proven on a local
    production build (qa-test Handoff, H8/AC4).
  - `supabase/config.toml` `[auth]` values: local stack and CI only. Production auth is set in the Supabase
    dashboard by the person (checklist below); no migration in this task.
- Supabase integration check ("Supabase Preview") on `af59b2d`: still `in_progress` at 16:20 UTC (started
  16:06:52 UTC). The task has no migration, so production history is unaffected either way; recorded as seen.

## Production migration history

Unchanged by this task. Read-only `list_migrations` (Supabase connector), ~16:09 UTC: `20261125104017 init`,
`20261125135502 default_privileges_baseline`, `20261125150215 function_privileges`.

## Drift after deploy

Run 45651393581 (`workflow_dispatch`, `main` at `af59b2d`): success, `diff: 0 non-comment lines`, "No drift.",
no artifact.

## Acceptance criteria

| AC | Status | Evidence / owner |
|----|--------|------------------|
| AC1-AC4, AC11 | met | `tests/integration/security-headers.test.ts` (in CI `verify`), red run and browser check in the qa-test Handoff |
| AC5-AC9 | met for local/CI | `tests/integration/auth-config.test.ts`; live AC6/AC7 PASS on the local stack (qa-test Handoff) |
| AC10 | checklist written | items 1-21 in the devops-cicd Handoff of `tasks/2b/TASK_BRIEF.md` |
| AC12 | met | gates PASS/APPROVE, CI green on PR #11 |
| Dashboard items 1-21 | **open, the person** | not applied or confirmed yet; agents never change the dashboard (AGENT_RULES §4). Item 9 (Turnstile CAPTCHA) only together with task 3's login form; item 21 (site URL, redirect URLs) once the production URL is decided |
| Item 22 / security gate P1 (production OTP rate limit) | **open, the person; must pass before any real user signs in** | after items 1-21 (at least item 7): 10 wrong-code `POST /auth/v1/verify` from one machine; pass = 429 at or before attempt 6 and on every later attempt, never a 200; record the ten codes and the date in `tasks/decisions.md`. Loop in `specs/2b/security-gate.md` |
| Row 9 behavior in production | open | rests on item 22 (the local stack doesn't enforce `token_verifications`, lesson L21) |

Also for the first production app build: `NEXT_PUBLIC_SUPABASE_URL` must be set in the hosting **build**
environment, or the CSP's `connect-src` blocks Supabase calls (devops-cicd Handoff).

## Result

**VERIFYING.** 2b moves to `DONE` only when the person confirms dashboard items 1-21 and records item 22 as
passing. Task 3's login must not be released to real users before item 22 passes.

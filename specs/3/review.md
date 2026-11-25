Result: APPROVE

# Task 3 code review: email-code login + own to-dos

Reviewer: code-reviewer, 2026-11-25, fresh context, judged from the repo only. Branch `feat/3-todos` at `75d75fe`,
diff `git diff origin/main...HEAD` (merge base `a02e792` = origin/main after `git fetch`). **Round 2.** Round 1 was
on `e9078ba` (CHANGES_REQUESTED: one should-fix, DELETE without 415, plus nits 2-7). Inputs read:
`rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `AGENTS.md`, `tasks/3/TASK_BRIEF.md`
(AC1-AC48, answered questions, all Handoff entries incl. the accepted `z.guid()` deviation), `specs/3/schema.md`,
`specs/3/threat-model.md` (incl. 3.7), `specs/3/test-plan.md`, `rules/security-baseline.md`.
`specs/3/security-gate.md` does not exist yet (the security gate runs in parallel); this review does not depend on it,
and per the role contract merge still needs the gate's PASS and green CI.

No blockers, no should-fix. The round 1 should-fix is fixed and tested; one round 1 nit is fixed; the rest are
carried forward as nits, plus one new nit.

## Changes since round 1 (`e9078ba..75d75fe`)

| Commit | What | Verdict |
|--------|------|---------|
| `ef37275` (merged `d18104b`) | `app/api/todos/[id]/route.ts:65-67`: DELETE returns 415 `unsupported_media_type` unless `isJsonContentType(content-type)`, after `guardRequest` (403 → 401), before `invalid_id`; the body is never read | Fixes round 1 finding 1. Uses the same `isJsonContentType` as `readJsonBody` (`lib/server/body.ts:9-12`), so DELETE and POST/PATCH accept exactly the same types (`application/json`, any case, with parameters). Order matches the brief (`TASK_BRIEF.md:250`: Origin → getUser → 415 → ...) and the threat model section 5 item 2. The app client already sends the header on DELETE (`lib/client/api.ts:51`), so no UI change is needed |
| `e4e8cd3` | `tests/e2e/abuse/csrf.spec.ts:51-62`: C3 DELETE cases (`text/plain`, form-urlencoded, multipart, none; each with and without a body) → 415 on A's own to-do with A's session and the app Origin, row compared before/after. `tests/e2e/support/api.ts:40-42`: the test client sends `application/json` on every non-GET/HEAD/OPTIONS request | Real attack: the target row exists and belongs to the caller, so 415 is the only thing stopping the delete, and the DB check proves it. `null` in `headers` really drops the header (`api.ts:44-45`). The helper change mirrors the app's own client; it doesn't weaken any test, because every 415 test sets its content type explicitly (C3 POST/PATCH `csrf.spec.ts:38-46`), and 403/401 tests are decided before the 415 check |
| `cdca71a` | `app/page.tsx:16`, `app/sign-in/page.tsx:15`: `getVerifiedUser(await createClient())` | Fixes round 1 nit 3. Still `getUser()` underneath (`lib/server/supabase.ts:53-61`, threat model 3.3); an Auth outage now gives the sign-in screen, not a 500, and pages and API share one helper |
| `75d75fe` | Handoff + test-plan C3 row updated (`specs/3/test-plan.md:148`), backend Handoff order line marked as superseded (`TASK_BRIEF.md:342`) | ok |

## Checks run by the reviewer

| Check | Result |
|-------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 12 files, 211/211 pass |
| e2e / build / verify.sh | not run by the reviewer (security gate shares the folder). Latest run recorded by qa-test in the brief on this code (`TASK_BRIEF.md:433`): `npm test` 211/211, `npm run test:e2e` 135/135 (131 + 4 new C3 DELETE), `verify.sh: PASS 19/19 (0 skipped)` |
| Migration vs `schema.md` section 9 | unchanged since round 1 (equal to the section 9 block); not touched since |
| Skipped / focused tests (`.only`, `.skip`, `fixme`, `xit`) in `tests/`, `lib/`, `supabase/tests/` | none |
| `git diff --check` | only trailing whitespace in generated `types/database.ts` (CLI output; don't hand-edit) |
| Secrets in code/tests | none (unchanged since round 1; the new tests use the existing fixtures) |

## Scope

Unchanged from round 1: every changed path is inside the brief's Allowed paths (`tasks/**` always allowed). The round 2
commits touch only `app/api/**` and `app/**` pages (backend-dev / frontend-dev), `tests/e2e/**` and
`specs/3/test-plan.md` (qa-test), and `tasks/3/TASK_BRIEF.md`. `.github/workflows/ci.yml` still needs the person's
`framework-change-approved` label (only the person adds it, AGENT_RULES 18a).

## Findings

### blocker

None.

### should-fix

None. (Round 1 finding 1 is resolved by `ef37275` + `e4e8cd3`, see above.)

### nit

1. **`tasks/3/TASK_BRIEF.md:259` (orchestrator, contract table):** the `DELETE /api/todos/[id]` row lists errors
   "400 bad id, 401, 403, 404" and omits the new 415. Line 250 (order) and line 342 (superseded note) already say
   DELETE gives 415, so the code is right; add 415 to the table so the contract has one answer. New in round 2.
2. **Test location convention (qa-test, backend-dev, frontend-dev; git-release records the choice).** Carried from
   round 1 nit 2. Unit tests sit next to the code (`lib/server/*.test.ts`, `lib/client/*.test.ts`), but
   `PROJECT_CONTEXT.md:54` lists `tests/{integration,e2e,abuse}/`, and abuse tests live in `tests/e2e/abuse/` (reason in
   the test plan). Write the chosen layout down. Two pairs still duplicate each other:
   `lib/client/cookie-options.test.ts` / `tests/integration/cookie-options.test.ts` (C4) and `lib/server/csp.test.ts` /
   `tests/integration/csp.test.ts` (N1/N2); keeping one of each is not weakening.
3. **`PROJECT_CONTEXT.md:39, 57, 59` and the env table (git-release, with the person's OK).** Carried from round 1
   nit 4. Still says end-to-end tests "none yet" (`test:e2e` exists, verify.sh runs it), validation library "not
   decided yet" (zod approved, decisions.md Q1), and "No API route, component or unit test yet" (this task sets the
   examples: `app/api/todos/route.ts`, `components/TodoList.tsx`, `lib/server/*.test.ts`). The test-only
   `MAILPIT_URL` isn't listed. AGENT_RULES rule 10 makes later agents rely on this file.
4. **`supabase/migrations/20261125165117_create_todos.sql:13` (db-architect; only before merge, never after).**
   Carried from round 1 nit 5. The `btrim` set is invisible literal Unicode characters; behaviour is correct (equals the
   JS `trim()` set). If changed: `schema.md` section 9 first, then the migration, then pgTAP. Fine to leave.
5. **`lib/server/origin.ts:22-24` (backend-dev, when hosting is chosen).** Carried from round 1 nit 6. A proxy that
   sends `Host: app.example:443` with `Origin: https://app.example` would get 403; belongs with the open
   `X-Forwarded-Host` item in threat model section 5. Nothing to change now.
6. **`.github/workflows/ci.yml:22-26` (devops-cicd).** Carried from round 1 nit 7. `verify` keeps
   `timeout-minutes: 30` while it now runs the stack, Playwright install, two production builds and 135 e2e tests.
   Watch the first CI run time.

Resolved since round 1: nit 3 (pages use `getVerifiedUser`, `cdca71a`).

## Acceptance criteria

Same mapping as round 1 (all code ACs map to code and a passing test). Changes this round:

| AC / item | Code | Test / evidence | OK? |
|-----------|------|-----------------|-----|
| AC9 | `app/page.tsx:15-17`, `app/sign-in/page.tsx:14-16` via `getVerifiedUser` | `auth.spec.ts` AC9 | yes |
| AC21-AC23, AC44 (DELETE) | `[id]/route.ts:62-81`: 403 → 401 → 415 → `invalid_id` → RLS delete with `.eq("user_id")` → 0 rows 404 / 204 | `todos.spec.ts`, `api.spec.ts`, `row2-idor.spec.ts`, `row1-...spec.ts` (rsc delete) all with the JSON content type | yes |
| Threat model 5 item 2 / C3 | `[id]/route.ts:67` | `csrf.spec.ts` C3 POST/PATCH (4) + DELETE (4) | yes |
| AC1-AC20, AC24-AC43, AC45, AC48 | unchanged since round 1 | unchanged; 135/135 e2e, 211/211 unit, pgTAP via verify.sh | yes |
| AC46 | - | process: git-release, the person's P1-revised / P2 items | pending (not code) |
| AC47 | - | qa-test verify.sh PASS 19/19, e2e 135/135; reviewer typecheck, lint, vitest green | pending CI + security gate |

## Hands off to

git-release (merge and ship) once `specs/3/security-gate.md` = PASS, CI is green, and the person has added the
`framework-change-approved` label for `ci.yml`. Nits 1-6 are optional, for the roles named.

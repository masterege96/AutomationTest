# Task 3: To-do pilot: email login + own to-dos (create, list, toggle done, edit title, delete)

| Field | Value |
|-------|-------|
| State | VERIFYING |
| Owner role | db-architect (`specs/3/schema.md`), security (`specs/3/threat-model.md`, `specs/3/security-gate.md`), db-builder (DB), backend-dev (API, server auth, nonce CSP proxy), frontend-dev (UI), qa-test (tests, `specs/3/test-plan.md`), devops-cicd (scripts, devDependencies, lockfile, `next.config.*` headers block, CI), code-reviewer (`specs/3/review.md`) |
| Branch | `feat/3-todos` |
| Worktree | integration `../wt-3-todos` (`feat/3-todos`); builders: `../wt-3-db-builder` (`db/3-todos-schema`), `../wt-3-devops-cicd` (`ci/3-todos-tooling`), then `../wt-3-backend-dev`, `../wt-3-frontend-dev`, `../wt-3-qa-test`; each merged into `feat/3-todos` by the orchestrator |
| Depends on | 2a (EXECUTE revoked on future functions: any function migration grants explicitly), 2b (security headers, local auth defaults, production dashboard checklist incl. item 22) |

The person's request (relayed by the orchestrator, 2026-11-25):

> "Task 3: to-do pilot. Email login (OTP / magic link). Each user can create, list, toggle done, edit title and delete only their own todos. Title 1-200 characters. Acceptance criteria include abuse cases for security-baseline rows #1, #2, #3, #5, #8, #9, #11, #14."

Earlier decisions by the person that apply (tasks/decisions.md, task 2): **Q3** a fixed CSP in `next.config` for now, **a nonce-based CSP with middleware lands in task 3**. **Q4** CAPTCHA (Cloudflare Turnstile) stays off locally and in CI; the production dashboard items are the person's. Also recorded there: S14 (merge-gate spoofing) is accepted for the pilot. This task adds the first real table, and every merge to `main` deploys migrations to production (L11): the orchestrator confirms with the person that the S14 acceptance still covers that before merge.

The orchestrator plans **one PR for the whole slice** (DB + API + UI + tests incl. Playwright e2e and abuse tests).

## Goal

A person can sign in with their email address (one-time code and/or magic link, see Question 5), and then create, see, mark done/undone, rename and delete their own to-dos, and nobody else's. Signing out ends access, and every abuse case below is refused with an observable result.

## Acceptance criteria

Each one is testable; qa-test writes at least one test per line and maps it in `specs/3/test-plan.md`. "The API" means whatever server entry points backend-dev builds for to-dos (style decided in Question 2); "error response" means the status code given plus the error format decided in Question 2, and **never** a stack trace, SQL text, internal ids, or any other user's data. Screen texts in quotes are the exact texts the UI shows (frontend-dev may change wording only by updating this brief first). "User A" and "user B" are two separate confirmed test users on the local stack. "Rows in the DB" is checked as `postgres` on the local database, not through the app.

### Sign-in and sign-out

- [ ] AC1 (sign in, happy path): Given a signed-out visitor on the sign-in screen, when they enter a valid email address and ask for a code, then the screen shows "Check your email for a sign-in code." and exactly one email to that address appears in the local mail server (Mailpit, `[local_smtp]`); when they enter the code from that email, then they land on their to-do list and the header shows their email address. (If the person picks magic link or both in Question 5, the same AC holds for following the link from the email, landing on the list.)
- [ ] AC2 (first sign-in creates the account): Given an email address with no account, when it completes AC1, then exactly one row exists in `auth.users` for it, confirmed, with an empty to-do list ("No to-dos yet."). (Whether unknown emails may create accounts at all is Question 6; this AC assumes the recommended default.)
- [ ] AC3 (invalid email): Given the sign-in screen, when the email field is empty, `not-an-email`, or longer than 254 characters, then the screen shows "Enter a valid email address.", no request reaches the auth service, and no email is sent.
- [ ] AC4 (wrong code): Given a code was requested, when a wrong 6-digit code is entered, then the screen shows "That code is wrong or has expired. Request a new code.", no session cookie is set, and the to-do list is not reachable.
- [ ] AC5 (used / expired code): Given a code that was already used to sign in (single use), when it is entered again after signing out, then the result is the same as AC4. Expiry itself (900 s, `otp_expiry`) is proven by the existing static config test in `tests/integration/auth-config.test.ts`, not by waiting 15 minutes.
- [ ] AC6 (no account enumeration): Given one email address with an account and one without, when a code is requested for each, then both show the same screen text as AC1 and the auth response status is the same.
- [ ] AC7 (resend too fast): Given a code was requested for an address less than 60 s ago (`max_frequency = "60s"`), when another code is requested for the same address, then the screen shows "Please wait a minute before requesting another code." and no second email arrives in Mailpit. If the local stack does not enforce this (compare L21), qa-test records the observed result in the Handoff and security decides, as in 2b.
- [ ] AC8 (sign out): Given user A is signed in, when they click "Sign out", then they see the sign-in screen, the browser holds no Supabase session cookie, reloading the list or using the browser Back button shows the sign-in screen (no cached to-dos are shown), and an API request replayed with A's pre-sign-out cookies returns 401 with no data. security states in the threat model whether a captured access token must stop working at sign-out or may live until it expires (`jwt_expiry = 3600`); qa-test asserts the chosen behavior.
- [ ] AC9 (signed-out access): Given no session, when the to-do list page is opened directly, then the sign-in screen is shown and no to-do data is in the HTML or network responses; when any to-do API is called (list, create, change, delete), then it returns 401 and the DB is unchanged.

### To-dos, happy paths

- [ ] AC10 (create): Given user A is signed in, when they type "Buy milk" and press "Add", then "Buy milk" appears at the top of the list, not done, and exactly one row exists in the DB with that title, `user_id` = A's id, done = false.
- [ ] AC11 (list): Given A has 3 to-dos and B has 2, when A opens the list, then exactly A's 3 appear, newest first, and none of B's titles are in the HTML or any network response.
- [ ] AC12 (toggle done): Given A's to-do is not done, when A checks it, then it shows as done (checkbox checked and title struck through), the DB row has done = true, and after a reload it is still done; when A unchecks it, the same holds for not done.
- [ ] AC13 (edit title): Given A's to-do "Buy milk", when A edits the title to "Buy oat milk" and saves, then the list shows "Buy oat milk", the DB row has the new title, and its done state and owner are unchanged.
- [ ] AC14 (delete): Given A's to-do, when A deletes it, then it disappears from the list, the DB row is gone, and after a reload it does not come back. (Delete is permanent and needs no undo in this task.)
- [ ] AC15 (persistence across sessions): Given A created to-dos, when A signs out and signs in again (on a new browser context), then the same to-dos with the same done states are listed.

### Title validation (row 5)

The title rule: leading and trailing whitespace is trimmed, then the title must be **1 to 200 characters**, counted as Unicode code points (as Postgres `char_length` counts them), so the API and the DB agree. The trimmed title is what is stored.

- [ ] AC16 (boundaries accepted): Given A is signed in, when a title of exactly 1 character, exactly 200 characters, 200 emoji (each one code point, e.g. 200 x U+1F600), or "  Buy milk  " is submitted on create and on edit, then each is accepted and stored ("Buy milk" without the spaces).
- [ ] AC17 (invalid titles rejected): Given A is signed in, when create or edit is sent with a title that is empty `""`, whitespace-only (`"   "`, tabs, newlines), 201 characters, 201 characters after trimming, a number, `null`, `true`, an array, an object, or missing, then the API returns 400 with the error format, no row is created or changed, and the UI (for the cases a user can type) shows "Title must be 1 to 200 characters." and keeps the input.
- [ ] AC18 (other invalid input): Given A is signed in, when the API gets a body that isn't JSON, a body over 10 KB, a to-do id that isn't a valid id format, or a done value that isn't a boolean (`"true"`, `1`, `null`), then it returns 400 (or 413 for the oversized body) with the error format and the DB is unchanged.
- [ ] AC19 (DB enforces it too): Given the local database, when an insert or update on the to-do table as an authenticated user (directly through PostgREST with A's token, bypassing the app) sets a title of `""`, `"   "` or 201 characters, then the database rejects it (CHECK constraint) and no row is written. pgTAP tests cover this.

### Abuse cases by security-baseline row

**Row 1 (type `/admin`):** this task has no admin role or admin feature.

- [ ] AC20: Given signed-out and signed-in (A) requests, when `/admin`, `/api/admin` and `/api/admin/todos` are requested, then each returns 404 and no data. No route, API or UI checks a role from `user_metadata`.
- [ ] AC21 (server checks, not only the proxy): Given no session, when every to-do API is called with a forged `x-middleware-subrequest` header (and any other header security names in the threat model as a middleware/proxy bypass), then each still returns 401 and the DB is unchanged. Each API checks the session itself on the server; the proxy is not the only check.

**Row 2 (IDOR, change the id):**

- [ ] AC22: Given B owns to-do X, when A (signed in) reads, toggles, edits or deletes X by its id through the API, then each returns 404 (the same status and body as for an id that doesn't exist), X is unchanged in the DB (title, done, owner), and no field of X appears in the response.
- [ ] AC23: Given B owns to-do X, when A calls the Supabase REST API directly with the anon key and A's access token to select, update or delete X, then 0 rows are returned or affected and X is unchanged.

**Row 3 (API key in the browser):**

- [ ] AC24: Given a production build (`npm run build`), when verify.sh scans the client bundle, then "client bundle has no server secrets" passes; client code reads only `NEXT_PUBLIC_*` env vars; `SUPABASE_SERVICE_ROLE_KEY` is not used by any to-do or sign-in code path (if security approves a need for it, it is server-only and that code does its own ownership check, standing rule 3).
- [ ] AC25: Given the app running in a browser, when every network request and response during AC1-AC14 is recorded (Playwright), then no request or response contains the service-role key, the database password, or any other secret value; the only Supabase key in the browser is the publishable/anon key. No secret appears in a test file, fixture or log: local keys come from `npx supabase status` at run time.

**Row 5 (bad input):** AC16-AC19 above, plus:

- [ ] AC26 (abuse test): The `tests/abuse/**` suite sends each invalid case from AC17 and AC18 to every to-do API as user A and asserts 400/413 and an unchanged DB.

**Row 8 (admin at signup / mass assignment):**

- [ ] AC27: Given a sign-in request that sends `data: {"role": "admin", "is_admin": true}` (user metadata) for a new email, when that user signs in, then `raw_app_meta_data` has no role/admin field, and the user can only see and change their own to-dos (AC22/AC23 hold for them).
- [ ] AC28 (create, mass assignment): Given A is signed in, when create is sent with extra fields `user_id` = B's id, `id` = a chosen id, `done` = true, `created_at` = a past date, or any unknown field, then the API returns 400 with the error format and no row is created (strict field whitelist: create accepts only the title).
- [ ] AC29 (change, mass assignment): Given A owns to-do X, when a change request for X sends `user_id` = B's id, `id` = another id, `created_at`, or any unknown field (with or without a valid title/done), then the API returns 400, and X is unchanged and still owned by A. A change request may set only the title and/or the done flag.
- [ ] AC30 (DB level): Given A's token directly against the Supabase REST API, when A inserts a to-do with `user_id` = B's id, or updates A's own to-do to `user_id` = B's id, then the database rejects it (RLS `with check`) and no row is owned by B as a result.

**Row 9 (guess the login code):**

- [ ] AC31: Given the local stack, when 10 wrong codes are entered for one address through the UI, then each shows the AC4 message and no session is ever created. The local stack does **not** enforce the per-IP verify limit (lesson L21), so **this test does not prove row 9 and must not be counted as its proof**.
- [ ] AC32 (row 9 proof): Row 9 is proven by (a) the static config test in `tests/integration/auth-config.test.ts` (S5 `token_verifications = 5` (< 10), `otp_expiry = 900`, `otp_length = 6`, `max_frequency = "60s"`) staying green after any `supabase/config.toml` change in this task, and (b) **2b dashboard checklist item 22** (10 wrong-code verify requests against production give 429 at or before attempt 6 and on every later attempt), run by the person after the first production deploy, recorded in `tasks/decisions.md`. All sign-in code verification goes through Supabase Auth's verify endpoint; the app adds no own code check, retry loop or endpoint that bypasses its rate limits (security confirms in the threat model).
- [ ] AC33 (CAPTCHA): Given local and CI, then `[auth.captcha]` stays off (2b S-tests unchanged), per decision Q4. Turning CAPTCHA on in production is tied to Question 4.

**Row 11 (XSS):**

- [ ] AC34: Given A is signed in, when A creates or edits to-dos titled `<script>window.__xss=1</script>`, `<img src=x onerror="window.__xss=1">`, `"><svg onload="window.__xss=1">` and `javascript:window.__xss=1`, then each title is shown as the literal text in the list and in the edit field, `window.__xss` stays undefined, no dialog opens, and the DB stores the text unchanged (not stripped or HTML-escaped in storage). verify.sh's `dangerouslySetInnerHTML` check passes.
- [ ] AC35 (nonce CSP, header): Given a production build (`npm run build` + `npm start`), when `/`, the sign-in screen, the to-do list page, a 404 page and one API response are requested, then each response has exactly one `Content-Security-Policy` header whose `script-src` contains a `'nonce-…'` value and does **not** contain `'unsafe-inline'` (dev mode may keep `'unsafe-eval'` only as security specifies); two requests to the same page get different nonces; the other five 2b headers (`X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, `Strict-Transport-Security`) are still present with their 2b values. Exact CSP value comes from `specs/3/threat-model.md`; `tests/integration/security-headers.test.ts` is updated to match.
- [ ] AC36 (nonce CSP, page works): Given the production build in a browser, when the e2e run goes through AC1, AC10, AC12, AC13, AC14 and AC8, then every page renders and hydrates, all of the app's own scripts run (they carry the nonce), calls to the local Supabase URL are allowed by `connect-src`, and the console shows no CSP violation.
- [ ] AC37 (nonce CSP, injected script blocked): Given the to-do list page of the production build, when the test injects an inline `<script>` without the nonce (e.g. `window.__csp=1`) into the page, then the script does not run (`window.__csp` stays undefined) and the browser fires a `securitypolicyviolation` event (and console error) naming `script-src` or `script-src-elem`. A CSP reporting endpoint (`report-uri`/`report-to`) is out of scope unless security requires it.

**Row 14 (query your database):**

- [ ] AC38: Given the local database after `npx supabase db reset`, then the to-do table has RLS enabled with policies that limit select, insert, update and delete to the owner (`auth.uid()`); verify.sh "RLS enabled on every public table" passes; `npx supabase db lint` reports no errors.
- [ ] AC39: Given the anon key and no user token, when the to-do table is queried, inserted into, updated or deleted from through the Supabase REST API, then nothing is returned or changed (error or 0 rows). pgTAP tests check this as role `anon`.
- [ ] AC40 (explicit grants, L14): Given the migration, then it grants exactly the table privileges the app needs to `authenticated` and none to `anon` (production's default privileges grant nothing, L14; task 1 already revoked TRUNCATE/TRIGGER/REFERENCES/MAINTAIN), and any function it adds grants EXECUTE explicitly (task 2a). pgTAP tests assert these grants with `table_privs_are` / `function_privs_are` (or equivalent).
- [ ] AC41: No SQL is built from string concatenation of request input anywhere in the slice (code-reviewer checks; security lists it in the gate).

### Duplicate and rapid actions

- [ ] AC42 (double submit): Given A types a title, when "Add" is clicked twice quickly (or Enter pressed twice), then exactly one to-do is created (the control is disabled while the first request is pending).
- [ ] AC43 (repeat toggle): Given A's to-do X, when two "mark done" requests for X are sent (sequentially and in parallel), then both succeed, X is done, and it stays done (marking done is idempotent; the same holds for "mark not done"). When the checkbox is clicked 5 times quickly in the UI, then after the requests settle and a reload, the UI and the DB show the same done state.
- [ ] AC44 (act on a deleted to-do): Given A deleted X in one tab, when A toggles, edits or deletes X again from a second tab, then the API returns 404, the second tab shows "This to-do no longer exists." and removes it from the list, and no row is created.
- [ ] AC45 (parallel creates): Given A, when 20 create requests with different titles are sent in parallel, then exactly 20 rows exist for A, each with its own title, and none for any other user.

### Release, build and gates

- [ ] AC46 (not released to real users yet): Sign-in is not opened to real users (no production URL announced, no real sign-ups) until the person has recorded in `tasks/decisions.md` that 2b dashboard checklist **item 22 passed**, and items 1 (custom SMTP), 21 (site URL / redirect URLs) and, per Question 4, item 9 (Turnstile) are done. Merging this PR does deploy the migration to production (Supabase integration); that is allowed, the table stays empty. git-release records the release state in the Handoff.
- [ ] AC47: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` (new script, Playwright) and `npm run build` pass; `bash scripts/verify.sh --brief tasks/3/TASK_BRIEF.md` passes with the local stack, and its summary line is in the Handoff; CI is green (see Question 3 for what CI needs); security gate PASS; review APPROVE.
- [ ] AC48: `specs/3/test-plan.md` maps every AC above and every applicable security row to a test file, test name and level (pgTAP, integration, abuse, e2e, static, or manual with the reason).

## Security rows that apply

Flagged by product-spec; security confirms, fills in and may add rows during Design (`specs/3/threat-model.md`). Rows 4, 6, 7, 10, 12 are N/A per PROJECT_CONTEXT (security confirms; row 7 note: a sign-in code is single use, which Supabase Auth enforces; AC5 tests it). Row 13 is covered by the CI secret scan.

- [ ] Row 1: abuse test: AC20, AC21
- [ ] Row 2: abuse test: AC22, AC23
- [ ] Row 3: abuse test: AC24, AC25
- [ ] Row 5: abuse test: AC16-AC19, AC26
- [ ] Row 8: abuse test: AC27-AC30
- [ ] Row 9: abuse test: AC31 (not proof, L21); proof: AC32 (static S5 + production item 22)
- [ ] Row 11: abuse test: AC34; CSP: AC35-AC37
- [ ] Row 14: abuse test: AC38-AC41
- [ ] Also for security to decide (not a baseline row): cross-site requests. If the API authenticates by cookie, a state-changing request with a foreign `Origin` (e.g. `https://evil.example`) and A's valid cookies is refused (403) and changes nothing; session cookie flags (`Secure` in production, `SameSite`, `HttpOnly` where possible); if magic link is chosen, the post-login redirect only goes to this app's own paths (a `next`/`redirect_to` of `https://evil.example` is ignored). Sign-out semantics (AC8).

## Scope

**Allowed paths** (union for the whole slice; verify.sh reads only this one block for the branch. Per-role split in the table below; each role touches only its own rows.)

```
# db-builder
supabase/migrations/**
supabase/tests/**
# backend-dev (Next 16 may call the request interceptor proxy.ts instead of middleware.ts: backend-dev confirms from node_modules/next/dist/docs and uses one)
app/api/**
lib/server/**
middleware.ts
proxy.ts
types/database.ts
# frontend-dev (app/** except app/api/**, which is backend-dev's)
app/**
components/**
lib/client/**
# qa-test
tests/integration/**
tests/e2e/**
tests/abuse/**
playwright.config.*
# devops-cicd (package.json: scripts and devDependencies only; dependencies only as approved in Question 1)
package.json
package-lock.json
next.config.*
vitest.config.*
supabase/config.toml
supabase/templates/**
.github/workflows/**
# db-architect, security, qa-test, code-reviewer specs
specs/3/**
# git-release (PROJECT_CONTEXT Commands + API style, with the person's OK 2026-11-25)
PROJECT_CONTEXT.md
```

| Role | Paths it may change in this task | Notes |
|------|-----------------------------------|-------|
| db-architect | `specs/3/schema.md` | Design only |
| security | `specs/3/threat-model.md`, `specs/3/security-gate.md` | Gives the exact nonce CSP value, sign-out semantics, cross-site rule |
| db-builder | `supabase/migrations/**`, `supabase/tests/**` | Avoid the bare word `truncate` in migrations, even in comments (L15 false positive) |
| backend-dev | `app/api/**`, `lib/server/**`, `middleware.ts` or `proxy.ts`, `types/database.ts` (generated) | Confirm the middleware/proxy file name and the nonce pattern (incl. its effect on `cacheComponents` / `partialPrefetching` and static rendering) from `node_modules/next/dist/docs`, per AGENTS.md. The type-generation command isn't in PROJECT_CONTEXT's Commands table: propose it, don't invent it |
| frontend-dev | `app/**` except `app/api/**`, `components/**`, `lib/client/**` | First component and page examples in the repo (PROJECT_CONTEXT: "the first feature task sets the example") |
| qa-test | `tests/integration/**`, `tests/e2e/**`, `tests/abuse/**`, `playwright.config.*`, `specs/3/test-plan.md` | Updates `tests/integration/security-headers.test.ts` (CSP moves to the nonce policy) and `auth-config.test.ts` if config.toml changes |
| devops-cicd | `package.json` (scripts, devDependencies), `package-lock.json`, `next.config.*` headers block, `vitest.config.*`, `supabase/config.toml`, `supabase/templates/**`, `.github/workflows/**` (only if CI needs a local stack env or Playwright browsers, Question 3) | `vitest.config.*` is likely needed so Vitest doesn't pick up Playwright `*.spec.ts` files. `supabase/templates/**` (sign-in email templates, if the code must appear in the email) is not in the ownership map yet: the orchestrator confirms it goes to devops-cicd with `supabase/config.toml`. `.github/workflows/**` changes need the person's `framework-change-approved` label |
| code-reviewer | `specs/3/review.md` | |

**Size (rule 2):** this slice will very likely exceed the ~400 changed-line guideline (migration + pgTAP, API, proxy, UI, integration/abuse/e2e tests, config). The orchestrator chose one PR for the whole slice on purpose; reviewers should expect a large diff and review it per role (commits per role).

**Out of scope:**
- Password sign-in, social/OAuth providers, phone/SMS, passkeys, MFA, account deletion, changing the email address, profile pages.
- Admin role or admin features (row 1 here means only "no admin surface exists and nothing trusts metadata").
- Sharing to-dos, lists/projects, due dates, priorities, reordering, search, filters, pagination, bulk actions, undo after delete, soft delete, offline mode, realtime sync between tabs (AC44 covers stale tabs).
- The Turnstile widget in the login form (unless the person answers Question 4 otherwise), a CSP reporting endpoint (unless security requires it), choosing an app host / production URL.
- Any production change by an agent: dashboard settings (items 1-22) are the person's (AGENT_RULES §4).
- Framework files (`scripts/**`, `rules/**`, `roles/**`, `ORCHESTRATOR.md`, `templates/**`) and drive-by changes to existing migrations (never edit a merged migration).

## Inputs

- Spec files: `specs/3/schema.md` (db-architect), `specs/3/threat-model.md` (security), `specs/3/test-plan.md` (qa-test)
- Other:
  - `rules/security-baseline.md` rows 1, 2, 3, 5, 8, 9, 11, 14; `rules/database-and-deploy.md`.
  - `specs/2b/threat-model.md` (current CSP and the other five headers, section B auth values, S-tests), `specs/2b/security-gate.md` (P1 = item 22), `tasks/2b/TASK_BRIEF.md` Handoff (dashboard checklist items 1-22; note: header values are fixed at `next build`, so `NEXT_PUBLIC_SUPABASE_URL` must be set at build time while the CSP stays in `next.config`).
  - `tests/integration/security-headers.test.ts`, `tests/integration/auth-config.test.ts` (existing tests this task changes or must keep green).
  - `supabase/config.toml`: `site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]` (note https vs http; matters if magic link is chosen), `enable_signup = true`, `[auth.email]` `otp_length = 6`, `otp_expiry = 900`, `max_frequency = "60s"`, `[local_smtp]` (Mailpit) for reading codes in tests.
  - `tasks/lessons.md`: **L18** (CI `verify` job sets no local-stack env vars; verify.sh now starts the DB before project checks, so tests may use the stack locally), **L19/L23** (shared `tasks/board.md` / `tasks/lessons.md` cause merge conflicts and no CI run: merge main early, before the gates), **L21** (local stack doesn't enforce per-IP auth limits), **L22** (merge main before running the gates, not after), **L14** (explicit grants), **L15** (`truncate` false positive), **L5** (`--passWithNoTests` can now go, tests exist).
  - verify.sh order: `test:e2e` runs **before** `build`, so the Playwright config must start its own production server (build included) for the CSP ACs, or devops-cicd defines the script so it does.
  - Env var names for tests/CI pointing at the local stack (URL, anon key) are not in PROJECT_CONTEXT yet: propose names in the Handoff (no values), the person approves.
  - `AGENTS.md`: Next.js 16 differs from training data; read `node_modules/next/dist/docs/` before writing Next code.

## Destructive change?

- [x] No (adds a table, policies, grants, routes, UI and tests; drops or renames nothing; no data touched).
- [ ] Yes: step 1 (stop using it) is task ___; step 2 (drop) is this task. Backup step: ___. Person approved on: ___

## Questions for the person

**Answered 2026-11-25 (the person, via the coordinator; recorded in `tasks/decisions.md`): all recommended defaults below, and S14 stays accepted for this merge.** Q2 answered 2026-11-25 16:43 UTC: route handlers (Option A in the backend-dev Handoff entry) and the type-generation command.

Each has a recommended default. The task stays in `BACKLOG` until they're answered (the orchestrator records the answers in `tasks/decisions.md` and here).

1. **New dependencies (AGENT_RULES §8; versions are picked by the role that adds them, pinned exactly).** The slice needs:
   (a) Supabase client libraries for Next.js server and browser auth (cookie-based sessions in server code and the proxy: the Supabase JS client plus its SSR helper package), in `dependencies`;
   (b) a schema validation library for the API boundary (row 5; the baseline names zod), in `dependencies`;
   (c) Playwright test runner plus its browser download, in `devDependencies` (adds the `test:e2e` script).
   **Recommended:** approve all three (Supabase's official JS + SSR packages, zod, Playwright with Chromium only). Without (a) sign-in needs hand-written cookie/session code (higher risk); without (c) AC36/AC37 and the e2e ACs can't be automated.
2. **API style and error format** (PROJECT_CONTEXT: backend-dev proposes, you decide). Options, not decided here:
   (a) Route handlers under `app/api/**` (REST-like JSON endpoints, e.g. list/create/change/delete), called from client components;
   (b) Server Actions called from forms/components (no public URL per action, but still reachable by POST and must be checked like an API);
   (c) the browser talks to Supabase directly (PostgREST) with RLS as the only server check, no own API.
   Error format options: a small JSON object such as `{ "error": { "code": "...", "message": "..." } }`, or RFC 9457 problem+json. **Recommended:** let backend-dev propose one of (a)/(b) with an error format in this brief's Handoff during Design (before building), and you pick; (c) weakens rows 5 and 8 (no server-side whitelist beyond DB constraints) and is not recommended. The ACs above are written to hold for (a) or (b).
3. **CI for tests that need the local stack or Playwright.** The `verify` job doesn't set the local Supabase URL/keys (L18) and has no Playwright browsers. Running the auth/abuse/e2e tests in CI needs `.github/workflows/**` changes (devops-cicd), which is a framework path: the PR needs your `framework-change-approved` label (only you add it, AGENT_RULES 18a). **Recommended:** yes, add it in this PR: the verify job reads the local URL and keys from `npx supabase status` at run time (never stored), installs the pinned Playwright Chromium, and runs `test:e2e`. Alternative: e2e and live auth tests run only locally and are recorded in the Handoff (weaker: nothing stops a regression in CI).
4. **Production auth dashboard (the person's items; agents never change production).**
   (a) Site URL and redirect URLs (item 21): the production URL isn't decided (no app host chosen). **Recommended:** leave unset until you choose a host; AC46 keeps sign-in unreleased until then.
   (b) Email template: if sign-in uses a typed code, the production "magic link" and "confirm signup" email templates must show the code (`{{ .Token }}`), not only a link. **Recommended:** you edit both templates in the dashboard when you set up SMTP (item 1); devops-cicd mirrors them locally in `supabase/templates/**` so local tests see the same email.
   (c) Turnstile timing (item 9): CAPTCHA on in production breaks sign-in unless the login form sends a Turnstile token, which needs the widget, a new public site-key env var and CSP allowances for Cloudflare. **Recommended:** keep the widget out of this task; make it a small follow-up task (3b) before release; turn item 9 on together with 3b. AC46 blocks real users until then.
5. **Sign-in method: 6-digit code, magic link, or both?** The request says "OTP / magic link", which can be read either way. **Recommended:** **code only** for this task: it works without a decided production URL and redirect allow-list, works when the email is opened on another device, isn't consumed by email link scanners, keeps the e2e test simple (read the code from Mailpit), and every attempt goes through the rate-limited verify endpoint (row 9). Magic link (with a callback route, redirect allow-list and open-redirect tests) can be added later.
6. **Who may sign up?** Today `enable_signup = true` and a first code request for an unknown email creates the account (AC2). **Recommended:** keep open sign-up for the pilot (anyone with an email can create their own empty list), since AC46 keeps it unreleased until the production checklist is done. Alternative: invite-only (only emails you add can sign in), which needs an extra admin flow and is out of scope.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/3/TASK_BRIEF.md` (new), `tasks/board.md` (row 3 added).
- **Verified:** `bash scripts/bootstrap-check.sh --offline`: `PASS 29/29 (1 skipped)`. Read the current `supabase/config.toml` (auth keys cited above), `next.config.ts` (static CSP with `'unsafe-inline'` in `script-src`), `package.json` (no Supabase client, validation or Playwright dependency yet; `test` still `--passWithNoTests`), `.gitignore` (already ignores `playwright-report/`, `test-results/`), `scripts/verify.sh` (scope check reads the first fenced block after the words "Allowed paths"; bundle secret scan; RLS static check; `test:e2e` runs before `build`), `.github/workflows/ci.yml` (no Playwright, no stack env in `verify`). `node_modules` isn't installed in this worktree, so the Next 16 middleware/proxy name was not checked: backend-dev confirms.
- **Left to do:** the person answers Questions 1-6; db-architect writes `specs/3/schema.md`; security writes `specs/3/threat-model.md` (exact nonce CSP, sign-out semantics, cross-site rule, confirms N/A rows); qa-test writes `specs/3/test-plan.md`; orchestrator sets `SPEC_READY`.
- **Next role must know:**
  - Choices product-spec made that the person or security may overturn (flagged, not asked): titles are trimmed and counted in Unicode code points; list is newest first; extra fields are rejected with 400 (not silently dropped); marking done is idempotent ("set", not "flip"); not-found and not-yours give the same 404; delete is permanent; a 10 KB body limit; the exact screen texts in quotes. If any of these is wrong, product-spec updates the AC before building.
  - Never write the words "Allowed paths" above the Scope section of this brief: verify.sh starts reading at their first occurrence and takes the next fenced block.
  - CSP: keep exactly one `Content-Security-Policy` header per response; when the nonce policy moves into the proxy, the CSP entry in `next.config.*` goes away (devops-cicd) and the header test changes (qa-test), in the same PR.

### backend-dev, 2026-11-25 (Design: API proposal)

Question 2 is for the person to decide. Nothing was built. Sources: `node_modules/next/dist/docs/01-app/` (Next 16.4.6): `01-getting-started/15-route-handlers.md`, `02-guides/data-security.md` (Server Actions), `03-api-reference/05-config/01-next-config-js/serverActions.md`, `03-api-reference/03-file-conventions/proxy.md`.
- **Proxy file name:** `proxy.ts`. `middleware` was deprecated and renamed to `proxy` in v16.0.0, and proxy runs on the Node.js runtime by default (proxy.md, "Migration to Proxy"). `middleware.ts` will not be created. The proxy only refreshes the session cookie and sets the nonce CSP. It never decides access: every endpoint checks the session itself (AC21). The proxy buffers request bodies up to 10 MB (`proxyClientMaxBodySize`), so the 10 KB limit has to be enforced in the handler.
- **Order in every endpoint (both options):** for POST/PATCH/DELETE, Origin check first, then authenticate (`supabase.auth.getUser()`, which asks the Auth server), then 415 (content type), then 413 (size), then 400 (JSON, id, zod), then run the query with the user's own client (RLS applies), then send the response. No service role is used.

**Option A: route handlers** (`app/api/todos/route.ts`, `app/api/todos/[id]/route.ts`, shared helpers in `lib/server/`)
| Method, path | Request body | Success | Errors |
|---|---|---|---|
| `GET /api/todos` | none | 200 `{"todos":[{"id","title","done","created_at"}]}`, newest first | 401 |
| `POST /api/todos` | `{"title":string}` | 201 `{"todo":{…}}` | 400, 401, 403, 413, 415 |
| `GET /api/todos/[id]` (for AC22 "read") | none | 200 `{"todo":{…}}` | 400 bad id, 401, 404 |
| `PATCH /api/todos/[id]` | `{"title"?:string,"done"?:boolean}`, at least one | 200 `{"todo":{…}}`; setting done twice is idempotent (AC43) | 400, 401, 403, 404, 413, 415 |
| `DELETE /api/todos/[id]` | none | 204, empty body | 400 bad id, 401, 403, 404 (also on a second delete, AC44), 415 (non-JSON content type; orchestrator, after review round 2) |
- **Validation (zod):** `z.strictObject` on create and patch, so any unknown field (`user_id`, `id`, `done` on create, `created_at`) gives 400 (AC28/AC29). Title: `z.string().trim()`, then a refine that counts code points (`[...s].length`) between 1 and 200. zod's `.min`/`.max` count UTF-16 units, which would wrongly reject 200 emoji (AC16). `done` is `z.boolean()`, so `"true"`, `1` and `null` give 400. The `[id]` param uses zod's uuid check (`z.uuid()`), assuming `specs/3/schema.md` uses uuid ids. Not-yours and not-found are the same case: the query runs with `.eq('id', id)` under RLS, and 0 rows means 404 with the same body (AC22).
- **Body:** the content type must be `application/json`, otherwise 415. A `Content-Length` over 10240 gives 413 before reading. Otherwise the handler reads `request.text()`, returns 413 if the UTF-8 byte length is over 10240 (this catches chunked bodies with no length), then runs `JSON.parse`; a parse failure gives 400 `invalid_json`.
- **CSRF:** route handlers have no built-in Origin check (the docs describe one only for Server Actions). `lib/server/origin.ts` gives 403 `forbidden_origin` unless `Origin` exactly equals the app's own origin; a missing Origin is also refused. Requiring JSON also forces a CORS preflight on cross-site requests, and the app sends no CORS headers. Cookies stay `SameSite=Lax`, the @supabase/ssr default. Proof: a request with `Origin: https://evil.example` plus A's cookies gives 403 and changes nothing.
- **Tests:** abuse tests are plain `fetch` calls with A's or B's cookies and assert the exact status and body. That works for every AC17/18/20-22/26/28/29/43-45 case.

**Option B: Server Actions** (`'use server'` file `lib/server/actions/todos.ts`: `createTodo(title)`, `updateTodo(id, patch)`, `deleteTodo(id)`; the list is read in a Server Component)
- **Reachability:** a POST to the page URL with a `Next-Action: <id>` header and React-encoded arguments. The ids are encrypted and change with each build, but the docs say to treat actions as "reachable via direct POST requests". All actions live at top level in one file, with no closures, so no encrypted closure data is sent to the browser. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is only needed when self-hosting on several instances.
- **Security:** each action takes `unknown` arguments and runs the same zod schemas, `getUser()` and RLS ownership check inside itself. Next compares Origin with Host itself and aborts on a mismatch (built-in CSRF protection; `serverActions.allowedOrigins` stays unset). The body limit defaults to 1 MB, and devops-cicd would set `serverActions.bodySizeLimit: '10kb'` in `next.config.ts`.
- **Gaps against the ACs:** actions return values, not status codes, so each would return `{ok:true,todo}` or the error object below with HTTP 200. The 401/404/400 ACs would have to be reworded as error codes. 415 does not apply. An oversized body and a foreign Origin are refused by the framework with whatever status and body Next chooses, not our format. Abuse tests would need the action id from each build's manifest plus React's argument encoding, which is brittle. Calling the functions directly in Vitest skips the HTTP boundary, so it does not prove AC21 or AC26. `/api/todos` would still be needed if any client other than the UI calls it.

**Error format (both options):** `{"error":{"code":"…","message":"…"}}`. Messages are fixed English text. They never repeat the input and never contain a stack trace, SQL, or ids. Codes: `unauthorized` 401, `forbidden_origin` 403, `not_found` 404, `invalid_json` 400, `invalid_id` 400, `validation_failed` 400, `payload_too_large` 413, `unsupported_media_type` 415, `method_not_allowed` 405, `internal_error` 500 (the details are logged on the server without the request body). For AC20, `app/api/[...rest]/route.ts` returns JSON 404 `not_found` for any unknown `/api/*` path, such as `/api/admin`; `/admin` gets Next's normal 404 page.

**Auth:** recommended: the browser calls Supabase directly. `createBrowserClient` (from @supabase/ssr, anon key) calls `signInWithOtp({ email })`, then `verifyOtp({ email, token, type: 'email' })`, and later `signOut()`. Supabase's per-IP limits then see each user's own IP (row 9, AC32: the app adds no verify endpoint of its own). If sign-in went through our server routes, every user would share the server's IP: the per-IP limit would apply to everyone at once, and one attacker could block sign-in for all users. **How the session reaches the server:** the @supabase/ssr browser client stores the session in `sb-…-auth-token` cookies. Those cookies can't be `HttpOnly`, because browser JavaScript writes them; security should note this. `lib/server/supabase.ts` builds `createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll, setAll } })` on `await cookies()` from `next/headers`, and `proxy.ts` refreshes expired tokens. Authorization uses only `getUser().id`, never `user_metadata` (AC27). For AC8, security decides `signOut` scope and whether `getUser()` (rejects revoked sessions) or `getClaims()` (local JWT check) is used.
**Type generation (proposed, needs approval for PROJECT_CONTEXT Commands):** `npx supabase gen types typescript --local > types/database.ts`.

**Recommendation: Option A (route handlers).** Every API AC is written as an HTTP status, and with route handlers each one maps directly to a status and our error format. qa-test can call them with plain `fetch` in the abuse suite, and the one CSRF control we add is a small function with its own test. Option B would mean rewording those ACs and calling per-build action ids in abuse tests.

### devops-cicd, 2026-11-25 (branch `ci/3-todos-tooling`)

- **Changed:**
  - `package.json` / `package-lock.json` (one lockfile change for all builders; exact versions, current stable from `npm view` on 2026-11-25): `dependencies` `@supabase/supabase-js` 2.119.2, `@supabase/ssr` 0.12.7 (peer `@supabase/supabase-js ^2.114.0`, satisfied), `zod` 4.6.7; `devDependencies` `@playwright/test` 1.65.1 (brings `playwright`/`playwright-core` 1.65.1). Scripts: `"test": "vitest run"` (`--passWithNoTests` removed, L5: tests exist), `"test:e2e": "playwright test"` (new).
  - `vitest.config.ts` (new): Vitest excludes `tests/e2e/**`, `.next/**`, `playwright-report/**`, `test-results/**` on top of its defaults, so Playwright files never run under Vitest.
  - `next.config.ts`: CSP entry and its builder (`isDev`, `supabaseOrigin()`) removed (the nonce CSP moves to `proxy.ts` + `lib/server/csp.ts`, backend-dev, threat model 6.1); the other five headers unchanged byte for byte on `source: "/(.*)"`; `cacheComponents: false`; `partialPrefetching` removed (6.5).
  - `.github/workflows/ci.yml`, `verify` job only (framework path: **the PR needs the person's `framework-change-approved` label**): new steps before `verify.sh`: install Playwright Chromium (`npx --no-install playwright install --with-deps chromium`, version from the lockfile), `npx --no-install supabase start`, then export `NEXT_PUBLIC_SUPABASE_URL` (from `API_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `ANON_KEY`) and `MAILPIT_URL` (from `MAILPIT_URL`) read from `npx supabase status -o env` at run time, each `::add-mask::`ed and written only to `$GITHUB_ENV`. verify.sh then finds the stack running, skips its own start and resets/tests/lints the DB as before; `npm test`, `test:e2e` and `build` see the env. `scripts/verify.sh` is unchanged (outside this task's allowed paths). Job names `verify`, `db-check`, `secrets` unchanged.
- **Proposed env var names (the person approves for PROJECT_CONTEXT; no values anywhere):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already listed), plus `MAILPIT_URL` (tests only: local Mailpit for reading sign-in codes). If qa-test needs to check rows as `postgres` through a DB URL, ask devops-cicd to export one more name (proposed `LOCAL_DB_URL` from `DB_URL`); it is not exported now.
- **Local equivalent (builders, Git Bash, stack already running; values stay in the shell, never in a file):**
  ```
  eval "$(npx supabase status -o env | sed -nE 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^MAILPIT_URL=/export MAILPIT_URL=/p')"
  npx playwright install chromium   # once per machine
  npm test && npm run test:e2e
  ```
  Don't `echo` the values and don't write them to `.env.local` in a commit.
- **Verified:** `bash scripts/verify.sh --no-db` (DB not run: the shared local stack was in use by db-builder): `verify.sh: FAIL 2/15 failed: npm run test, npm run test:e2e (1 skipped)`. typecheck, lint, build, scope, secrets, migrations PASS. Both failures are expected on this branch alone:
  - `npm run test`: 14 tests in `tests/integration/security-headers.test.ts` fail only because they expect the old CSP in `next.config.ts` and `cacheComponents`/`partialPrefetching: true`: `H1: exactly one rule covers all paths and it carries exactly the six headers`, `H2: Content-Security-Policy (production, local API URL) equals the threat model string exactly`, `H3: production CSP has no 'unsafe-eval', ...`, `H4: with NODE_ENV=development only script-src changes, adding 'unsafe-eval'`, `H4: 'unsafe-eval' is absent when NODE_ENV=production`, `H4: ... NODE_ENV=test`, `H5` (unset, empty), `H6: a URL with a path, query and an injected directive yields the origin only`, `H6: NEXT_PUBLIC_SUPABASE_URL=... fails closed` x4 (`javascript:`, `ftp:`, `not a url`, `data:`), `AC1: the existing options cacheComponents and partialPrefetching stay on`. Still passing: `H2: %s equals %j exactly` for all five other headers, `H1/AC2` source matches, all of `auth-config.test.ts`.
  - `npm run test:e2e`: fails because `playwright.config.*` (qa-test) doesn't exist yet, so Playwright defaults to the repo root and loads the Vitest files. Passes once qa-test's config sets `testDir: "tests/e2e"`.
  - Parsing of `supabase status -o env` checked against the running local stack (names and value shapes only, nothing printed): URL and Mailpit URL are `http://127.0.0.1:<port>`, key present, no quotes or CR.
  - `next build` route table on this branch: `○ /`, `○ /_not-found` (static) until frontend-dev makes the root layout dynamic (6.5 step 2).
- **qa-test must know:** update the 14 header tests above to N3 (no CSP in `headers()`, five headers exact, `cacheComponents === false`, no `partialPrefetching`) and move H2-H6 to `buildCsp` (N1). `playwright.config.ts` must set `testDir: "tests/e2e"` and a `webServer` that runs `npm run build && npm start` (verify.sh runs `test:e2e` **before** `build`; the CSP ACs need a production build), and read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `MAILPIT_URL` from the environment (fail with a clear message if unset). Chromium only. Name e2e files anything; Vitest ignores `tests/e2e/**`. `eslint.config.mjs` doesn't ignore `playwright-report/**` / `test-results/**` (outside this task's allowed paths); if a local re-run of lint after e2e trips on them, delete the folders or ask for a follow-up.
- **backend-dev must know:** `next.config.ts` no longer sets any CSP; `proxy.ts` must set exactly one on every non-static response (6.3/6.4). `NEXT_PUBLIC_SUPABASE_URL` is set in CI before `next build`. `zod` is v4 (`z.strictObject`, `z.uuid()` exist in v4).
- **frontend-dev must know:** `cacheComponents` is off, so `use cache`/`cacheLife` aren't available; make the root layout dynamic (6.5 step 2).

#### Production checklist for the person (replaces 2b dashboard checklist item 22's 10-attempt loop; from `specs/3/threat-model.md` 4.5; agents never run these)

Record each result in `tasks/decisions.md`. Keys only in a shell variable, never pasted anywhere.

- [ ] **P1-revised (row 9; blocking before real users).** After the first production deploy and with the verify rate limit at 5 per 5 minutes (dashboard: Authentication > Rate Limits): from one machine, send **35** wrong-code `POST /auth/v1/verify` requests back to back (same command as `specs/2b/security-gate.md` P1, loop to 35, anon key in a shell variable). Record every status code. Wait 65 seconds, send 2 more, record both.
  - **Pass:** first 429 at or before attempt 6, every later attempt 429, never a 200.
  - **Burst-bound (expected):** first 429 between attempts 7 and 31, every later one 429, never a 200; after the wait at most 1 non-429, then 429. Row 9 not proven: release stays blocked until you record one of (a) Supabase lowers the verify burst and a re-run passes; (b) raise `otp_length` to 8 (dashboard + `config.toml` + S8 + the "6-digit" AC texts), security's recommendation; (c) an explicit risk acceptance with the numbers in threat model 4.2.
  - **Fail:** no 429 by attempt 31, or any 200: stop, row 9 FAIL in production, tell security.
- [ ] **P2 (blocking before real users).** One signed-in test user makes 60 to-do API calls (list/toggle) within 3 minutes through the deployed app. Pass: no 401 and no 429. Fail: tell security (design change, not higher limits).
- [ ] Still blocking (AC46): item 1 (custom SMTP), item 21 (site URL / redirect URLs once a host exists), item 9 + task 3b (Turnstile), production email templates show `{{ .Token }}`. Leave Auth IP forwarding off; no secret API key for this task.
- P3 (info only): server-side session refresh shares one bucket; revisit near ~1,000 active users/hour.
### db-builder, 2026-11-25

Branch `db/3-todos-schema` (worktree `wt-3-db-builder`, from `feat/3-todos`). Not pushed, not merged.
- **Changed:**
  - `supabase/migrations/20261125165117_create_todos.sql` (new, via `npx supabase migration new create_todos`): `specs/3/schema.md` section 9, extracted byte-for-byte from the spec's fenced block (no edits, LF, no destructive words).
  - `supabase/tests/03_todos_test.sql` (new, pgTAP, `plan(163)`): every schema.md section 7 case: S1-S5, G1-G5, R1-R5, M1-M5 (M4 near the end, extra grant revoked right after and checked), N1, C1-C3, K1 (last). Assertions always run as `postgres`; every `throws_ok`/`lives_ok` string ends with `; reset role` (L20); allowed cases write to temp table `t3_out`; `current_user = 'postgres'` is asserted after each block. Fixtures: users A `1111…`, B `2222…` (`@test.local`), to-dos A1-A3, B1-B2 backdated one day.
  - `types/database.ts` (new, generated; backend-dev owns later edits): `npx supabase gen types typescript --local > types/database.ts` from Git Bash after `db reset`. ASCII/UTF-8, LF, no BOM, exit 0 (stderr only had the `--local` v4 deprecation warning and the oxfmt hint; oxfmt not run).
- **Verified:** `bash scripts/verify.sh`: `verify.sh: PASS 17/17 (1 skipped)` (skip = `test:e2e`, no script). Includes `db reset`, `supabase test db` (all four files pass), `db lint --level error`, typecheck, lint, test, build.
- **Negative control** (run once, in rolled-back transactions through `psql` in `supabase_db_AutomationTest`, not committed): adding `grant insert, update on public.todos to authenticated;` (table-wide) before the fixtures made 26 tests fail (M1, M2, M3, the C2/C3 update cases on A1, M4 update and its follow-ups), all 163 still ran (no role leak). `alter table public.todos disable row level security;` made 13 fail (R1 x4, R3 B1 x3, R4 B1 x2, M1 "no row for B", M4 x2 + follow-up). The tests can fail.
- **Commits:** `87d3eb9 db: create public.todos with owner-only RLS, column grants and tests`, `280591d chore: generate types/database.ts for public.todos`, plus this handoff (`docs:`).
- **Backend-dev must know:**
  - Error codes from the DB (PostgREST maps them): `42501` `permission denied for table todos` when a request names any column other than `title` on insert or other than `title`/`done` on update (or anon touches the table at all); `42501` `new row violates row-level security policy for table "todos"` only if the column grants were wider (second layer); `23514` `new row for relation "todos" violates check constraint "todos_title_trimmed"` / `"todos_title_length"`; `23502` for a null title. A `23514` or `42501` from a signed-in user means your whitelist/trim let something through: treat as 500 `internal_error`, per schema.md handoff.
  - Not-yours and not-found both give 0 rows on select/update/delete (no error): use `.select()` and map empty to 404.
  - Ordering: `order('created_at', { ascending: false }).order('id', { ascending: false })` (index `todos_user_id_created_at_idx` matches; `id` breaks ties for same-instant creates).
  - Title must arrive trimmed with JS `trim()` and be 1-200 code points; the DB rejects untrimmed values instead of trimming them.
  - `types/database.ts`: `Insert`/`Update` allow `user_id`, `id`, `done`, `created_at`, `updated_at` because gen types ignores column grants; your zod whitelist must match schema.md section 4, not the types. `Relationships` for `todos` is **empty** (schema.md section 11 expected the FK to `users`): the generator only includes `public`/`graphql_public`, so the FK into `auth` isn't listed. Harmless (we never embed `users`). The file also has a `graphql_public` section and starts with a blank line (raw CLI output, not formatted).
- **Spec notes (no deviation made):** section 9's `btrim` set is written with literal Unicode characters (U+00A0 ... U+FEFF, invisible in most editors; only U+000B is a `\u` escape), while the note under it speaks of `E'...\uXXXX...'`. Copied as-is: same 19+6 characters, same meaning, applies and passes C1/C2. If reviewers prefer visible `\uXXXX` escapes, that is a db-architect change before merge (never after).
- **Left to do:** backend-dev (API, uses these types), qa-test (integration/abuse tests on this schema). Production unchanged; it gets this migration only via merge to `main` (schema.md section 10 has the post-deploy read-only queries).

### backend-dev, 2026-11-25 (build)

Branch `feat/3-todos-api` (worktree `wt-3-backend-dev`, from `feat/3-todos`). Not pushed, not merged. Contract = Option A above, unchanged except the id format note below.
- **Changed:**
  - `proxy.ts`: function `proxy`, matcher exactly 6.4, no `runtime` export. Per request: `generateNonce()` (16 bytes `crypto.getRandomValues`, base64) → `buildCsp()` → forwarded request headers `x-nonce` + `Content-Security-Policy` (`set`, so client-sent values are overwritten) → `createServerClient` + `getClaims()` (refresh only, in try/catch) → the last `setAll` response (rebuilt with the CSP request headers, cookies with `cookieOptions`, the library's cache headers) → CSP response header set once at the end. No authorization.
  - `lib/server/csp.ts`: `generateNonce()`, `supabaseOrigin(raw)` (2b logic), `buildCsp({ nonce, supabaseUrl, isDev })` → the 6.3 strings exactly; throws on a nonce that isn't 16-byte base64.
  - `lib/server/supabase.ts`: `createClient()` (anon key + `next/headers` cookies, `cookieOptions`, typed with `Database`; throws if the two `NEXT_PUBLIC_*` vars are unset) and `getVerifiedUser(client)` (`auth.getUser()`, any error → null). Frontend's stub of this file is superseded; same `createClient()` name and shape.
  - `lib/server/origin.ts` (`isSameOrigin`: Origin present, not `null`, a bare http(s) origin, host === `Host`), `lib/server/body.ts` (`readJsonBody`: 415 → `Content-Length` > 10240 → 413 → streamed byte count > 10240 → 413 → strict UTF-8 + `JSON.parse` → 400 `invalid_json`), `lib/server/errors.ts` (format, fixed messages, `Cache-Control: private, no-store`, `internalError()` logs op + error code only), `lib/server/todo-schemas.ts` (zod), `lib/server/todo-api.ts` (`guardRequest`: Origin for mutations → `getUser()`).
  - `app/api/todos/route.ts` (GET, POST; PUT/PATCH/DELETE → 405 + `Allow`), `app/api/todos/[id]/route.ts` (GET, PATCH, DELETE; POST/PUT → 405), `app/api/[...rest]/route.ts` (every method → JSON 404).
  - Unit tests next to the code: `lib/server/{csp,origin,body,todo-schemas}.test.ts` (94 tests).
  - `lib/client/cookie-options.ts`: byte-identical copy of frontend-dev's file (separate commit `be2d048`) so this worktree compiles; drop one copy at merge.
- **Order in every handler:** mutations: Origin 403 → `getUser()` 401 → 415 → 413 → 400 `invalid_json` → 400 `invalid_id` → 400 `validation_failed` → query → response. GET/DELETE: (Origin for DELETE) → 401 → `invalid_id` → query. DELETE ignores any body/content type. (Superseded by the review fix: DELETE now returns 415 for a non-JSON `Content-Type` after 403/401, then `invalid_id`; the body is still not read.) Every query uses the user's RLS client **and** `.eq("user_id", user.id)` (row 2, defense in depth); update/delete use `.select()` and 0 rows → 404 with the identical body as a missing id. Any DB error (23514, 42501, 22P05, ...) → 500 `internal_error`, logged as `api todos.<op> failed: <code>` only.
- **Validation details:** title = `z.string().trim()` then 1-200 code points (`[...s].length`), then refuse U+0000 and lone surrogates (`isWellFormed()`) → 400, never 500 (T5). `z.strictObject` on create (`{title}`) and patch (`{title?, done?}`, at least one). **Id:** `z.guid()` (any 8-4-4-4-12 hex, like Postgres `uuid`), not `z.uuid()`: `z.uuid()` also demands RFC version/variant bits, so a well-formed id such as `11111111-1111-1111-1111-111111111111` would give 400 instead of 404. Anything else (`not-a-uuid`, `123`, no dashes) is 400 `invalid_id`.
- **Response shapes:** list `{"todos":[{"id","title","done","created_at"}]}` newest first (`created_at desc, id desc`); create 201 / read / patch 200 `{"todo":{…same 4 keys}}`; delete 204 empty body. Error messages: `invalid_json` "Request body must be valid JSON.", `invalid_id` "Invalid to-do id.", `validation_failed` "Request body is not valid.", `unauthorized` "Sign in required.", `forbidden_origin` "Cross-origin request refused.", `not_found` "Not found.", `method_not_allowed` "Method not allowed.", `payload_too_large` "Request body is larger than 10 KB.", `unsupported_media_type` "Content-Type must be application/json.", `internal_error` "Something went wrong.". The UI should show its own texts by `code`/status (e.g. "Title must be 1 to 200 characters." for 400 `validation_failed` on a title), not these messages.
- **Sign-out (3.6):** no server route. Browser `signOut()` (frontend-dev) is enough: verified live that after a global `signOut()` the replayed pre-sign-out cookie gets 401 from the API (`getUser()` rejects the revoked session).
- **Verified:**
  - `npx vitest run lib/server`: 4 files, 94 tests pass. `npm run typecheck`, `npm run lint`: clean.
  - `bash scripts/verify.sh --no-db --brief tasks/3/TASK_BRIEF.md` (local stack env exported in the shell): `verify.sh: FAIL 2/16 failed: npm run test, npm run test:e2e (1 skipped)`. Both expected and not backend-dev's: `npm run test` = the same 14 `tests/integration/security-headers.test.ts` tests devops-cicd listed (H1, H2, H3, H4 x3, H5 x2, H6 x5, AC1), qa-test rewrites them; all 94 of mine and `auth-config.test.ts` pass. `test:e2e` = no `playwright.config.*` yet (qa-test). Scope, secrets, bundle scan, typecheck, lint, build PASS.
  - **Live**, `npm run build && npx next start -p 3201` with the local stack, users A/B/C/D created through the local auth admin API (service key only in a shell variable) and signed in via `generate_link` + `verifyOtp` (real `@supabase/ssr` cookies): 128 checks passed, including: 401 for every endpoint with no session, with `x-middleware-subrequest` (`middleware`, `proxy:…x5`), `x-user-id: <A>`, `next-router-prefetch`, and with three forged cookies (garbage, non-base64, `alg: none` token); create of "Buy milk", "  Buy milk  " (stored trimmed), 1 char, 200 chars, 200 x U+1F600, `<script>…` (stored as-is); list = exactly A's, newest first, no B data; 21 bad create bodies → 400 `validation_failed` (AC17, AC28 incl. `user_id`=B, `id`, `done`, `created_at`, unknown key, NUL, lone surrogate); not JSON 400, `text/plain` / no content type 415, 11 KB 413, foreign / missing / `null` Origin 403, and A's count unchanged afterwards; toggle done, 2 parallel "done" → both 200 (AC43), edit title trimmed with done kept; 9 bad patch bodies → 400; bad id → 400 on GET/PATCH/DELETE; A's GET/PATCH/DELETE of B's to-do → 404 with the byte-identical body of a missing id, B's row unchanged (AC22); delete 204, again 404, patch after delete 404 (AC44); 20 parallel creates → 20 rows (AC45); `/api/admin`, `/api/admin/todos`, `/api/todos/a/b` (anon and A) → JSON 404 no-store, `/admin` → 404 page with CSP (AC20); `PUT /api/todos` → 405 + `Allow`; every API response `Cache-Control: private, no-store` and exactly one CSP with a nonce and no `'unsafe-inline'` in `script-src`; two requests → different nonces, a client-sent `Content-Security-Policy`/`x-nonce` request header doesn't set the nonce; an **expired access token** cookie → proxy refreshes → 200, new `SameSite=Lax` session cookie set, CSP still present, `no-store` (6.4); sign-out replay → 401 (AC8). No 500 and no error in the server log.
  - Expected live failures (not backend): `/` is still static (`○`) on this branch, so its 10 `<script>` tags have no nonce: frontend-dev's dynamic root layout (6.5 step 2) fixes it. Requests with `rsc: 1` get Next's own **307** to `?_rsc` before any handler runs; following it gives 401. Not a bypass (no data, no DB change).
- **frontend-dev must know:** import `createClient` / `getVerifiedUser` from `@/lib/server/supabase` (pages: `getVerifiedUser(await createClient())`, null → redirect). Send `Content-Type: application/json` and same-origin `fetch` on POST/PATCH/DELETE (the browser adds `Origin`; your `lib/client/api.ts` already does). 404 on PATCH/DELETE = "This to-do no longer exists." (AC44). The nonce is on request header `x-nonce` (`(await headers()).get("x-nonce")`) if you need it for `next/script`.
- **qa-test must know:** `buildCsp({ nonce, supabaseUrl, isDev })` and `generateNonce()` in `lib/server/csp.ts` are the N1/N2 targets (my colocated tests already cover them; keep or move). Abuse tests must send `Origin: <app origin>` on mutations or they get 403 (a server-side `fetch` sends no Origin), and `Content-Type: application/json`. For T1 `rsc: 1`, expect 307 → follow → 401 (or use `redirect: "manual"` and assert no data). Forged/expired cookies: the cookie name is `sb-<first label of the Supabase host>-auth-token` (`sb-127-auth-token` locally), value `base64-<base64url JSON session>`, chunked as `.0`, `.1` when long; `generate_link` (`magiclink`) + `verifyOtp({ token_hash, type: "magiclink" })` through the admin API is a fast way to get real sessions without Mailpit (service key only from `npx supabase status` at run time). Cookie `secure` follows `NODE_ENV === "production"` (see open issue).
- **Open issues for the orchestrator / security:**
  - `lib/client/cookie-options.ts` (given to both builders verbatim) sets `secure` from `NODE_ENV` only; threat model 3.2 asks for a function of protocol/host, not `NODE_ENV` alone, unit-tested. With the e2e production build on `http://127.0.0.1` the session cookie is `Secure`; Chromium accepts `Secure` cookies on `http://127.0.0.1`/`localhost`, other browsers may not. Security/frontend-dev decide; backend imports whatever the file exports.
  - Origin check compares with `Host`; behind a host that sets `X-Forwarded-Host` (most PaaS proxies keep `Host`, some don't) it must be revisited when a host is chosen (threat model 5).
  - ~~`z.guid()` instead of `z.uuid()`~~ resolved: see the follow-up below.

#### backend-dev, 2026-11-25 (follow-up fix)

- **Contract deviation (deliberate, accepted by the orchestrator 2026-11-25):** the `[id]` param is checked with `z.guid()` (any 8-4-4-4-12 hex, as Postgres `uuid` accepts), not `z.uuid()` as Option A said. A well-formed id that doesn't exist or isn't yours is 404; only a malformed one is 400 `invalid_id`.
- **Cookie Secure flag (threat model 3.2):** frontend-dev's `cookieOptionsFor(hostname)` replaced the `cookieOptions` const. `proxy.ts` passes `request.nextUrl.hostname`; `lib/server/supabase.ts` passes the hostname from the `Host` header via `headers()` (port stripped by `hostnameFromHost()`; missing/unparsable → "" → Secure on, fail closed). `X-Forwarded-Host` is not read; like the Origin check, that waits for the hosting decision. The earlier open issue about `secure` from `NODE_ENV` is closed by this.
- **Verified:** `npm run typecheck`, `npm run lint`, `npx vitest run lib/server`, `npm run build` (see commit message).
### frontend-dev, 2026-11-25 (build)

Branch `feat/3-todos-ui` (worktree `wt-3-frontend-dev`, from `feat/3-todos`). Not pushed, not merged.
- **Changed:**
  - `lib/client/cookie-options.ts` (own commit `20408db`, for backend-dev's server client and proxy): `{ path: "/", sameSite: "lax", secure: NODE_ENV === "production" }`.
  - `lib/server/supabase.ts` **stub** (own commit `299dccc`): exports `async function createClient()` (server client on `next/headers` cookies). backend-dev owns this file; the orchestrator keeps backend-dev's version at merge and drops the stub. The UI imports only `createClient` from it: if backend-dev's export has another name, `app/page.tsx` and `app/sign-in/page.tsx` need a one-line import change.
  - `lib/client/supabase.ts` (browser client, `createBrowserClient` + `cookieOptions`, anon key only, used only for `signInWithOtp` / `verifyOtp` / `signOut`), `lib/client/api.ts` (fetch wrapper for `/api/todos`: `credentials: "same-origin"`, `cache: "no-store"`, `Content-Type: application/json` on POST/PATCH/DELETE, DELETE has no body; `{error:{code,message}}` -> `ApiError(status, code, message)`), `lib/client/validation.ts` (UX-only email / code / title checks; title = JS `trim()` then 1-200 code points), `lib/client/texts.ts` (all screen texts), `lib/client/use-hydrated.ts`, unit tests `lib/client/validation.test.ts`, `lib/client/api.test.ts` (23 tests).
  - `app/layout.tsx`: `await connection()` (threat model 6.5) -> `next build` route table: `ƒ /`, `ƒ /_not-found`, `ƒ /sign-in` (no `○`/`◐`). Metadata title "To-dos".
  - `app/page.tsx` (to-do list at `/`): server `createClient()` + `auth.getUser()`, no user -> `redirect("/sign-in")` before anything renders; data then loads client-side from `GET /api/todos`. `app/sign-in/page.tsx` (public; signed-in user -> `/`). `app/page.module.css` (replaced template styles).
  - `components/SignInForm.tsx`, `SignOutButton.tsx`, `TodoList.tsx`, `TodoItem.tsx`, `ui.module.css`.
- **Behavior notes:** no return path (after sign-in always `/`, so C5 does not apply). `signInWithOtp` errors: 429 / `over_email_send_rate_limit` -> AC7 text; every other result (incl. errors) -> AC1 text (AC6). Any `verifyOtp` failure -> AC4 text. Sign-out: `signOut()` (global); on error or exception every `sb-*` cookie is expired by hand; then `location.replace("/sign-in")`. Sign-in success uses `location.replace("/")` (full load). The list page listens to `pageshow` and reloads when `event.persisted`. Any 401 from the API -> `/sign-in`. 404 on toggle/edit/delete -> item removed + "This to-do no longer exists." (AC44). Server `validation_failed` -> "Title must be 1 to 200 characters."; other API errors show the server's `message` as text. Each item's controls are disabled while its request is pending, and the item then shows the state the server returned (AC43). "Add" is disabled while creating, plus a ref guard (AC42). Submit buttons stay disabled until hydration (a pre-hydration native submit would have put the email in the URL; forms are also `method="post"`). No `maxLength` on title inputs (200 emoji = 400 UTF-16 units). Titles only as text children / input `value`; no `dangerouslySetInnerHTML`, no inline script, no `next/script` (so no `x-nonce` read is needed).
- **Verified:** `bash scripts/verify.sh --no-db --brief tasks/3/TASK_BRIEF.md`: `verify.sh: FAIL 2/15 failed: npm run test, npm run test:e2e (1 skipped)`. typecheck, lint, build, scope, secret scans, `dangerouslySetInnerHTML` PASS. `npm run test`: only the 14 known `tests/integration/security-headers.test.ts` failures (qa-test updates them; see devops-cicd handoff); the 23 new `lib/client` tests pass. `test:e2e`: no `playwright.config.*` yet (qa-test); without one, Playwright also picked up test files from `../wt-3-backend-dev`, so the config must set `testDir`. Manual smoke on a local production build (`next start`; no `proxy.ts`/API in this worktree): invalid email -> AC3 text, no request; code request -> AC1 text and the code step; wrong code -> AC4 text; correct code -> `/` with "Signed in as <email>"; empty Add -> title text; Sign out -> `/sign-in`, `document.cookie` has no `sb-*`; Back does not show the list. The list itself (`/api/todos`) was not exercised: backend-dev's API is not in this worktree.
- **For qa-test (Playwright; prefer these):**
  - Routes: sign-in `/sign-in`; list `/` (signed out -> 307 to `/sign-in`). 404: Next's default not-found page.
  - Sign-in: `getByLabel("Email address")`, `getByRole("button", { name: "Send code" })`; then `getByLabel("Sign-in code")`, `getByRole("button", { name: "Sign in" })`, `getByRole("button", { name: "Use a different email" })`. `getByRole("status")` shows "Check your email for a sign-in code."; errors in `getByRole("alert")`: "Enter a valid email address.", "That code is wrong or has expired. Request a new code.", "Please wait a minute before requesting another code.", "Enter the 6-digit code from the email." (new text, not in an AC: code is not 6 digits, no request sent). Buttons are disabled until hydration and while a request is pending (Playwright's click waits for enabled).
  - List page: `getByRole("heading", { level: 1, name: "My to-dos" })`, header text "Signed in as <email>", `getByRole("button", { name: "Sign out" })`. Create: `getByLabel("New to-do")`, `getByRole("button", { name: "Add" })`; its error `#new-todo-error` (`role="alert"`). List: `getByRole("list", { name: "To-dos" })` -> `getByRole("listitem")` (newest first). Per item: `getByRole("checkbox", { name: "<title>" })` (label = title; `text-decoration: line-through` on the label when done), `getByRole("button", { name: 'Edit "<title>"' })`, `getByRole("button", { name: 'Delete "<title>"' })` (visible text "Edit" / "Delete"). Edit mode: `getByLabel("Edit title")` (value = title), `getByRole("button", { name: "Save" })`, `getByRole("button", { name: "Cancel" })` (Escape also cancels); item errors in the item's `role="alert"`. Page notices (AC44 "This to-do no longer exists.") in the list's `role="status"`. Empty: "No to-dos yet."; loading: "Loading to-dos…"; list load failure: message + button "Try again". Delete has no confirmation (AC14).
- **Open issues:**
  1. **Cookie `secure` vs threat model 3.2.** `cookie-options.ts` uses `NODE_ENV === "production"` exactly as the orchestrator specified, but 3.2 asks for a function of the request/page protocol (or host `127.0.0.1`/`localhost`), not `NODE_ENV` alone, and says the e2e production build on `http://127.0.0.1:3000` uses `secure: false`. With this line the e2e build sets `Secure` cookies over http (it still worked on `http://127.0.0.1` in the smoke test, since browsers treat loopback as trustworthy, but 3.2's planned unit test won't match). security / orchestrator decide; a fix stays in `lib/client/cookie-options.ts` (browser: `location.protocol === "https:"`; server: request protocol).
  2. **Local email has no code.** The local Mailpit email for a new user is the default "Confirm your email address" link template (no `{{ .Token }}`), so AC1/AC2 can't read a 6-digit code from Mailpit until devops-cicd's `supabase/templates/**` + `config.toml` (Question 4b) are in place and the stack restarted. For the smoke test the code came from the local admin `generate_link` (`email_otp`), service-role key only in a shell variable.
  3. The @supabase/ssr browser client uses PKCE by default, so `signInWithOtp` also writes `sb-<ref>-auth-token-code-verifier` cookies (not session tokens). Sign-out clears them too; qa-test's "no Supabase session cookie" check should look at `sb-*-auth-token` (and chunks), or all `sb-*`.
  4. `DELETE` is sent with `Content-Type: application/json` and no body (threat model 5 requires the JSON content type on every state change); backend-dev's DELETE handler must not parse an empty body.
### devops-cicd, 2026-11-25 (email templates)

Branch `ci/3-todos-tooling` (worktree `wt-3-devops-cicd`, fast-forwarded to `feat/3-todos` first). Not pushed, not merged.
- **Problem (from frontend-dev):** local Mailpit got the default "Confirm your email address" link email with no 6-digit code, so code sign-in and e2e couldn't work.
- **Changed:**
  - `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html` (new): minimal HTML that shows `{{ .Token }}` large; no link, no images, no tracking. Same text in both (a new address gets the confirmation email, a known one the magic-link email).
  - `supabase/config.toml`: only two new tables after the commented invite example, `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]`, each with `subject = "Your sign-in code"` and `content_path = "./supabase/templates/<name>.html"`. Nothing else changed.
  - Key names checked against the pinned CLI 3.2.0 binary (`node_modules/@supabase/cli-windows-x64/bin/supabase.exe`, its config schema): template names `invite, confirmation, recovery, magic_link, email_change, reauthentication`; fields of `auth.email.template.*`: `subject`, `content_path`, `content`. Path style follows the commented example in config.toml.
- **Must do to apply (not done; the shared stack is in use):** restart the local stack: `npx supabase stop && npx supabase start`. Templates are read only at start. After that, sign-in emails in Mailpit show the 6-digit code.
- **Production equivalent (the person, at SMTP setup, AC46/Q4b; agents never touch production):** dashboard Authentication > Email Templates: edit **Magic Link** and **Confirm signup** so the body shows `{{ .Token }}` (the code); copying the two files' HTML is enough. No secret involved.
- **Verified:** `npx vitest run tests/integration/auth-config.test.ts`: 21/21 pass (S5/S8/S9 values unchanged). `bash scripts/verify.sh --no-db`: `verify.sh: FAIL 2/16 failed: npm run test, npm run test:e2e (1 skipped)`. Both failures are expected and owned by qa-test: `npm run test` = the 14 `tests/integration/security-headers.test.ts` cases (H1-H6, AC1) still on the old next.config CSP (move to N3/`buildCsp`); `npm run test:e2e` = no `playwright.config.ts` / `tests/e2e` yet (Playwright picks up the Vitest files and reports "No tests found"). Everything else PASS, including the scope check and build. Templates not yet checked in Mailpit (needs the restart).
### qa-test, 2026-11-25 (tests written)

Branch `test/3-todos-tests` (worktree `wt-3-qa-test`, from `feat/3-todos`). Not pushed, not merged. Written against the Option A contract and the ACs while backend-dev and frontend-dev build; the full run happens after the orchestrator integrates.
- **Changed:** `specs/3/test-plan.md` (new: every AC, row and T/C/N test mapped, plus the UI contract the e2e tests assume); `playwright.config.ts` (new); `tests/e2e/**` (new: `auth`, `todos`, `api`, `journey`, `csp` specs, `abuse/` row 1, 2, 5, 8, 9, 11, 14 and CSRF specs, `support/` helpers); `tests/integration/security-headers.test.ts` (updated to N3); `tests/integration/csp.test.ts` (new, N1 for `buildCsp`); `tests/integration/app-code-static.test.ts` (new: T3, T4, 3.3, AC32, 6.1/6.4).
- **Abuse tests are in `tests/e2e/abuse/`**, not `tests/abuse/`: they need the running app, and `vitest.config.ts` already excludes `tests/e2e/**`, so no config change is needed.
- **Counts:** Vitest: `security-headers` 17, `csp` 16, `app-code-static` 10, `auth-config` 21 (unchanged). Playwright (124): `auth` 11, `todos` 15, `api` 7, `journey` 1, `csp` 8, `abuse/csrf` 10, `abuse/row1` 18, `abuse/row2` 2, `abuse/row5` 43, `abuse/row8` 4, `abuse/row9` 1, `abuse/row11` 2, `abuse/row14` 2.
- **Verified:** `npm test`: `security-headers` and `auth-config` pass (38); `csp.test.ts` fails to load (`lib/server/csp` doesn't exist yet) and `app-code-static` fails 3/10 (no `proxy.ts`, no `app/api/todos`): expected until integration. `npx eslint tests playwright.config.ts`: clean. `npm run typecheck`: only `csp.test.ts` cannot find `../../lib/server/csp` (expected; `next build` also type-checks it, so the build on this branch alone fails the same way). `npx playwright test --list`: 124 tests in 13 files. Live against the local stack (with `csp.test.ts` set aside so the build passes): the 5 tests that need no app routes pass (`AC38`, `AC39`, `AC23`, `AC19`, `AC30`), which also proves the support code (admin-made sessions, psql checks, REST calls). Playwright browsers were not installed on this machine (needs `npx playwright install chromium`, a download); nothing that opens a page was run.
- **Expected to fail before integration:** every Playwright test except those five (no routes, no UI); `csp.test.ts`; `app-code-static` (3); `typecheck`/`build` on this branch alone.
- **Builders must do this for the tests to be deterministic (or tell qa-test, who changes one place):**
  - **devops-cicd: local email templates must show the 6-digit code.** Probe on the local stack today: the default "Confirm your email address" email has only a link (`token=<hash>`), no `{{ .Token }}`. AC1, AC2, AC4, AC5, AC7, AC15, AC31 and the journey read the code from Mailpit and fail with a clear message until `supabase/templates/**` + `config.toml` give both the confirm-signup and magic-link emails `{{ .Token }}` (Q4b). Not in the devops-cicd Handoff yet.
  - **backend-dev: `lib/server/csp.ts` must be importable by Vitest:** export `buildCsp({ nonce, supabaseUrl, isDev })`, pure, no `@/` imports and no `server-only` import (Vitest has no `@/` alias and `server-only` is not installed). The test imports it relatively. If `@/` is wanted, devops-cicd adds the alias to `vitest.config.ts`.
  - **backend-dev:** error codes exactly as the contract (`unauthorized`, `forbidden_origin`, `not_found`, `invalid_json`, `invalid_id`, `validation_failed`, `payload_too_large`, `unsupported_media_type`, `method_not_allowed`); body `{"error":{"code","message"}}` with only that key; `GET /api/todos` = `{"todos":[...]}` with exactly `id,title,done,created_at`; create 201, delete 204 with an empty body; unknown `/api/*` JSON 404 (`/api/admin`, `/api/admin/todos`, also for POST/DELETE); `PUT` and other unexported methods 405 in the error format (Next's own 405 has no body: export a handler); 401 before 415/413/400; T5: a NUL or lone surrogate in a title gives 400 (or is stored exactly), never 500; Origin compared with `Host` so `http://localhost:3000` against `127.0.0.1:3000` is 403; no `Access-Control-Allow-*` on any response, `OPTIONS` included. The tests assert all of these.
  - **frontend-dev:** paths and accessible names in `specs/3/test-plan.md` "UI contract" (list at `/`, sign-in at `/login`; "Email address", "Send code", "Sign-in code", "Sign in", "New to-do", list named "To-dos", "Edit…"/"Delete…" buttons, "Edit title", "Save"); email input not blocked by native validation; "Add" not disabled for an empty field and no `maxLength` on the title field (AC17's empty and 201-character cases must show the message); no confirm dialog on delete; the title is its own text node in the item. If a return path is added, tell qa-test (C5). Name and module of the cookie `secure` helper (threat model 3.2) are needed for the C4 HTTPS unit test.
  - **Everyone:** `NEXT_PUBLIC_SUPABASE_URL` set at build time (the Playwright web server builds with the caller's env).
- **Auth budget:** each UI sign-in uses its own address (one code request each). Per run: 13 code requests and about 45 `/auth/v1/verify` calls (28 session setups through the admin-generated code, 7 UI sign-ins, AC31's 10 required wrong codes). That is more than `token_verifications = 5` per 5 min, which the local stack doesn't enforce (L21); no limit was raised, nothing touches production. If the orchestrator wants the run under 5 verifies per 5 minutes, tests must share sessions; tell qa-test.
- **Secrets:** no value in any file. Test-only local values (service-role key for creating users, JWT secret for T2, values the AC25 scan looks for) come from `npx supabase status -o env` in memory, are never put into `process.env` (the app server never sees them) and never printed (assertions name the secret only). Traces, videos, screenshots and the HTML report are off.
- **Left on the shared stack:** test users `qa3-*@test.local` and `qa-probe*@test.local` (two probe users from checking the Mailpit/OTP flow) and their to-dos; gone at the next `db reset`. Nothing deleted, no reset, no stop.
- **Next:** after integration, qa-test runs `npm test` and `npm run test:e2e` with the stack env and reports pass/fail per test-plan line with owning roles.

### qa-test, 2026-11-25 (integration run)

Branch `test/3-todos-tests` fast-forwarded to the integrated `4469360`, plus `31b886c` (test alignment). Not pushed, not merged. Local stack restarted and reset by the orchestrator; Chromium installed; env exported per the devops-cicd Handoff (values only in the shell).
- **Aligned to the build (naming only):** sign-in at `/sign-in`; header "Signed in as <email>"; new unit tests `tests/integration/cookie-options.test.ts` (C4, `cookieOptionsFor`, 14) and N2 for `generateNonce` in `csp.test.ts` (2). `z.guid()` ids need no test change (my invalid ids are all malformed).
- **Test-side fixes (my tests were wrong; no assertion weakened):** checkbox clicked then waited for the server-confirmed state (controlled checkbox; Playwright `check()` wants an immediate change); AC8 opens the list twice so Back has a list entry to return to (sign-out uses `location.replace`); AC15 second sign-in via an admin-made session (a second UI code request within 60 s is refused by design, and an admin-generated code counts as a send); AC37 injects only into the served HTML (inline script, guessed nonce, `onerror` handler), because `page.evaluate()` insertion bypasses CSP in Chromium (even a `data:` script ran); AC25 scans for the DB password only if it is 16+ characters (local default `postgres` is a word in client JS: false positive); AC45 titles unique per run.
- **Results:** `npm test`: 12 files, 211/211 pass. `npm run test:e2e`: 125 tests, 122 pass, 3 fail. `bash scripts/verify.sh --brief tasks/3/TASK_BRIEF.md` (with DB): `verify.sh: FAIL 1/19 failed: npm run test:e2e (0 skipped)`.
- **Remaining failures (app differs from AC/contract; tests kept):**
  1. `AC21/T1: no session + x-middleware-prefetch: 1 -> every to-do API 401, ...`: `expected 401, received 200` with body `{}` on list, read, create, change and delete (probe). Next answers the request itself before any handler; no data, DB unchanged. **backend-dev** (proxy/handler must give 401 for this header, or security accepts it as a documented exception and amends AC21/T1).
  2. `AC21/T1: no session + rsc: 1 -> ...`: `expected 401, received 307` (Location `<path>?_rsc`) on every endpoint; no data, DB unchanged. **backend-dev** (same decision as 1; backend's Handoff already noted it).
  3. `AC18: a body that isn't JSON -> 400 invalid_json on create and edit`: `expected "invalid_json", received "validation_failed"` for `not json`, `{`, `{"title":"x",}`, `""`, `'title'`. Status 400 is right; the code contradicts the Option A contract and backend-dev's own Handoff (`invalid_json`). **backend-dev**.
- **Local auth limits:** kept as is (each sign-in its own address); the local stack doesn't enforce per-IP limits (L21); recorded in `specs/3/test-plan.md`.

#### backend-dev, 2026-11-25 (fix round 2)

- **T1 `x-middleware-prefetch: 1` fixed:** Next answered it itself with 200 `{}` before any handler (`next/dist/server/base-server.js`, middleware-prefetch bail-out). `proxy.ts` now deletes that one header from the forwarded request for `/api` and `/api/*` only; each to-do API then answers 401 from its own `getUser()`. Pages keep the header (`/sign-in` with it is still 200). The proxy still decides nothing.
- **T1 `rsc: 1` not fixed; security decides:** Next flags the request as RSC (request meta, `base-server.js` `handleRSCRequest`) from the original header, and the proxy's header changes don't clear that flag; it then sends 307 to `?_rsc` because the cache-busting hash doesn't match (`02-guides/cdn-caching.md`: an RSC request without the correct `_rsc` value gets a 307 redirect). Tested: deleting `rsc`, `next-router-*` and `next-url` in the proxy still gives 307. No handler runs, no data, no DB change; following the redirect gives 401. Options: (a) documented exception, AC21/T1 expects 307 → follow → 401 (recommended); (b) `experimental.validateRSCRequestHeaders: false` in `next.config.ts` (devops-cicd; global, removes Next's CDN cache-poisoning guard; not recommended); (c) the proxy answers `/api/*` requests carrying `rsc` with a fixed error itself (makes the proxy a responder).
- **AC18 `invalid_json`: the API is right; the test harness changes the body.** Playwright's `APIRequestContext.fetch` JSON-encodes a string `data` that isn't valid JSON when the content type is JSON (`playwright-core/lib/coreBundle.js`: `isJsonParsable(options.data) ? options.data : JSON.stringify(options.data)`), so `not json` arrives as `"not json"` (valid JSON → `validation_failed`). Live: raw `fetch` with `not json`, `{`, `{"title":"x",}`, empty body, `'title'` → 400 `invalid_json` on create and edit; Playwright with `data: Buffer.from(body)` → `invalid_json`; with `data: body` (string) → `validation_failed`. **qa-test:** send raw bodies as a `Buffer` in `tests/e2e/support/api.ts` `call()`. No API change.
- **Verified:** `npm test` 12 files 211/211; typecheck, lint clean; `npm run test:e2e` (Playwright webServer production build, local stack env in the shell): 123 passed, 2 failed = `AC21/T1 ... rsc: 1` and `AC18 ... invalid_json`, both explained above. The `x-middleware-prefetch` test now passes.
- **Final round (2026-11-25, on `97f8b7d` + `53a6659` + `f197b93`):** AC18 fixed in the test helper (`53a6659`: raw bodies sent as a Buffer; Playwright JSON-encoded non-JSON strings). `x-middleware-prefetch` now 401 after backend's proxy strip (`7e760d3`). `rsc: 1` on the API asserted exactly per threat model 3.7 (307 to `?_rsc` on the app origin, empty, no Set-Cookie; followed -> 401; rows unchanged; forged-cookie variant only deletes), page case kept (`f197b93`). Results: `npm test` 12 files, 211/211 pass; `npm run test:e2e` (production build) 131/131 pass; `bash scripts/verify.sh --brief tasks/3/TASK_BRIEF.md` (full, with DB): `verify.sh: PASS 19/19 (0 skipped)`. No open failures.
- **Review round (2026-11-25, on `d18104b`):** C3 gets DELETE cases (A's own to-do, A's session, app Origin, Content-Type `text/plain` / form-urlencoded / multipart / none, with and without a body -> 415, row still there). The test API client now sends `application/json` on every mutation, DELETE included, like `lib/client/api.ts` (needed since `ef37275`; five DELETE-based tests got 415 before this). Results: `npm test` 12 files, 211/211 pass; `npm run test:e2e` (production build) 135/135 pass; `bash scripts/verify.sh --brief tasks/3/TASK_BRIEF.md` (full, with DB): `verify.sh: PASS 19/19 (0 skipped)`.


## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25 (gates)

- **Gate round 1** (HEAD e9078ba, fresh agents): security PASS; review CHANGES_REQUESTED (should-fix: DELETE without 415).
  Fixed by backend-dev (ef37275), qa-test added the C3 DELETE cases (e4e8cd3), frontend-dev nit 3 (cdca71a). The round-1
  gate files were not committed.
- **Gate round 2** (HEAD 75d75fe, fresh agents): security PASS (`verify.sh: PASS 19/19 (0 skipped)`, e2e 135/135, npm test
  211/211), review APPROVE (nits only: test layout, PROJECT_CONTEXT refresh, invisible chars in the trim set, Origin with
  explicit port, CI timeout). Gate files committed after the last code commit.
- **Release lock (AC46):** merging deploys the empty table only. No real users until the person records P1-revised (row 9
  burst: (a) / (b) 8-digit codes / (c) accept), P2, P4 (once a host is chosen), SMTP (item 1), URLs (item 21), Turnstile
  (item 9, task 3b) and production email templates with `{{ .Token }}` in `tasks/decisions.md`.
- **Needs the person:** the `framework-change-approved` label (`.github/workflows/ci.yml`).

### orchestrator, 2026-11-25 (merged; release checklist for the person)

PR #14 squash-merged as `89b1c2e` (18:46 UTC); migration `20261125165117 create_todos` is in production history and the
drift check is green (`specs/3/post-deploy.md`). Task 3 is `VERIFYING`. **No real user signs in until every item below
is recorded in `tasks/decisions.md`** (AC46). Agents never change production; each item is the person's.

- [ ] **R1 Hosting:** choose the app host; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in its
      **build** environment (the CSP's `connect-src` is computed at build time).
- [ ] **R2 SMTP (2b item 1):** custom SMTP in the dashboard; then set the email rate limit (2b item 2).
- [ ] **R3 URLs (2b item 21):** site URL and redirect URLs set to the exact production URL, no wildcards.
- [ ] **R4 Email templates:** dashboard Authentication > Email Templates, "Magic Link" and "Confirm signup" show the
      code `{{ .Token }}` (same as `supabase/templates/*.html`).
- [ ] **R5 Turnstile:** task 3b adds the widget to the sign-in form; then turn on CAPTCHA (2b item 9).
- [ ] **R6 P1-revised (row 9):** with verify at 5 per 5 min: 35 wrong-code `POST /auth/v1/verify` back to back, record
      every status; wait 65 s, send 2 more. Pass = first 429 at or before attempt 6, every later one 429, never 200.
      Otherwise record one of: (a) Supabase lowers the burst and a re-run passes, (b) 8-digit codes (security's
      recommendation; changes the 6-digit decision), (c) accept the risk with the numbers in threat model section 4.
- [ ] **R7 P2:** a signed-in test user makes 60 to-do API calls in 3 minutes on the deployed app: no 401, no 429.
- [ ] **R8 P4:** on the host, the session cookie has `Secure`; `Origin: https://evil.example` gets 403 and a
      same-origin request works; the CDN strips `x-middleware-subrequest` and keeps `_rsc` in its cache key.
- [ ] **R9 Real-user run on the host:** sign in with a code, create, list, toggle, edit, delete; a second user sees
      none of them; sign out. git-release records it in `specs/3/post-deploy.md`; the orchestrator moves task 3 to DONE.
- [ ] Optional: the read-only catalog `select`s in `specs/3/schema.md` section 10, rows pasted into `specs/3/post-deploy.md`.

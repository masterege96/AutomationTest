# Task 3 test plan: email-code login + own to-dos

Author: qa-test, 2026-11-25. Inputs: `tasks/3/TASK_BRIEF.md` (AC1-AC48, backend-dev Option A contract,
devops-cicd and db-builder Handoffs), `specs/3/threat-model.md` (T1-T6, C1-C5, N1-N6, section 9), `specs/3/schema.md`,
existing `tests/integration/*`. Written while backend-dev and frontend-dev build; tests follow the contract and the ACs,
not the code.

## Levels and where they run

| Level | Runner | Files | Needs |
|-------|--------|-------|-------|
| static / unit | Vitest, `npm test` | `tests/integration/*.test.ts` | nothing running |
| pgTAP | `npx supabase test db` | `supabase/tests/03_todos_test.sql` (db-builder) | local DB |
| e2e (browser) | Playwright, `npm run test:e2e` | `tests/e2e/*.spec.ts` | local stack + production build (the config builds and starts it) |
| abuse (HTTP + browser) | Playwright, `npm run test:e2e` | `tests/e2e/abuse/*.spec.ts` | same |

Abuse tests live under `tests/e2e/abuse/` (not `tests/abuse/`) because they need the running app, and Vitest
(`npm test`, which runs before the build in verify.sh) excludes `tests/e2e/**` (devops-cicd's `vitest.config.ts`).

**Playwright setup** (`playwright.config.ts`): `testDir: "tests/e2e"`, Chromium only, one worker (shared stack and
Mailpit), web server `npm run build && npm start -- --hostname 127.0.0.1 --port 3000` (fixed port = `site_url`),
`reuseExistingServer: false` so a `next dev` server is never tested by mistake. Fails at start with a clear message if
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `MAILPIT_URL` is unset. No traces, videos, screenshots
or HTML report (they would record cookies and headers, threat model row 13).

**Secrets (row 13):** the three env vars come from the caller (CI or the shell). Test-only values (service-role key to
create confirmed test users without email, JWT secret for the forged-token test T2, and the values AC25 scans for)
are read by `tests/e2e/support/env.ts` from `npx supabase status -o env` at run time, kept in memory, never put into
`process.env` (so the app server never sees them) and never printed: secret assertions report the secret's name only.

**DB checks** ("rows in the DB, as postgres"): `tests/e2e/support/db.ts` runs `psql -U postgres` inside the local DB
container (`supabase_db_<project_id>` from `supabase/config.toml`), the way db-builder checked the schema. Test strings
reach SQL only as hex literals. No DB URL or password is needed.

**Users:** each test that needs exact list contents makes its own confirmed user (`newUser`: admin `createUser` +
`generateLink` + `verifyOtp` through `@supabase/ssr`, so the cookies are exactly what the app reads). Shared
worker users `userA` / `userB` serve the abuse tests. Unique addresses per run (`qa3-<label>-<runid>@test.local`), so
the shared stack and Mailpit need no clean-up and nothing is deleted.

**Auth request budget (threat model 9: stay under the local limits, never raise them):** every UI sign-in uses its own
address with exactly one code request, so `max_frequency` (60 s per address) is hit only where AC7 tests it. Per full
run: 13 code requests (12 sent emails + AC7's refused one) and about 45 `/auth/v1/verify` calls (about 28 for session
setup through the admin-generated code, 7 UI sign-ins, AC31's 10 wrong codes as the AC requires, AC5's replay). The
local stack does not enforce the per-IP limits (`sign_in_sign_ups`, `token_verifications`; L21), so this does not
throttle the run; none of it touches production. The email limit per address is enforced locally (AC7).
**Decision (orchestrator, 2026-11-25, integration run):** keep the tests as they are (each sign-in its own address);
the local stack does not enforce the per-IP limits (L21), so the per-run counts above are accepted locally. Row 9 is
proven by AC32 (static S5 + production P1-revised), never by these runs.

## UI contract the e2e tests use (aligned to the frontend-dev build Handoff, 2026-11-25)

All of it is in one place, `tests/e2e/support/ui.ts`; a different name or path is a one-line change there.

| What | Assumed | Source |
|------|---------|--------|
| List page path | `/` (signed out: 307 to `/sign-in`) | frontend-dev build |
| Sign-in screen path | `/sign-in` | frontend-dev build |
| Email field | label "Email address"; must not block submit with native browser validation (`noValidate`), so AC3's message shows | assumption |
| Request button | "Send code" | assumption |
| Code field / button | label "Sign-in code" / button "Sign in" | assumption |
| Header | "Signed in as <email>"; button "Sign out" | brief AC1, AC8; frontend-dev build |
| New to-do | field label "New to-do", button "Add" (enabled when the field is empty, so AC17 "empty" shows the message); no `maxLength` on the field (AC17 201 chars must show the message and keep the input) | brief AC10, AC17 |
| List | `<ul>`/`role=list` with accessible name "To-dos"; one `listitem` per to-do; title as its own text node; one checkbox per item | assumption |
| Done style | checkbox checked and the title (or an ancestor inside the item) has `text-decoration: line-through` or is inside `<s>`/`<del>` | brief AC12 |
| Edit | per-item button `Edit "<title>"`; edit field label "Edit title"; button "Save" | frontend-dev build |
| Delete | per-item button `Delete "<title>"`; no confirm dialog | frontend-dev build |
| Messages | the exact quoted texts of AC1, AC3, AC4, AC7, AC2, AC17, AC44 | brief |

## Acceptance criteria

| AC | What is checked | Test file | Test name | Level |
|----|-----------------|-----------|-----------|-------|
| AC1 | code request text, exactly one email in Mailpit, code signs in, list shown, email in header | `tests/e2e/auth.spec.ts` | `AC1 + C4: the emailed code signs in, ...` | e2e |
| AC2 | one confirmed `auth.users` row, "No to-dos yet." | `tests/e2e/auth.spec.ts` | `AC2: a first sign-in creates exactly one confirmed auth.users row and an empty list` | e2e |
| AC3 | empty / `not-an-email` / >254 chars: message, no request to `/auth/v1/*`, no email | `tests/e2e/auth.spec.ts` | `AC3: invalid email (<case>) shows the message, ...` (3) | e2e |
| AC4 | wrong code: message, no session cookie, list unreachable | `tests/e2e/auth.spec.ts` | `AC4: a wrong 6-digit code shows the message, ...` | e2e |
| AC5 | used code refused after sign-out (replayed from the browser exactly as `verifyOtp` sends it; a UI re-request is impossible within 60 s and would invalidate the code anyway); expiry: static S-test | `tests/e2e/auth.spec.ts`; `tests/integration/auth-config.test.ts` | `AC5: a code that was already used cannot sign in again after sign-out`; S8/S9 | e2e + static |
| AC6 | known vs unknown address: same text, same `/auth/v1/otp` status | `tests/e2e/auth.spec.ts` | `AC6: known and unknown addresses get the same screen text and the same auth status` | e2e |
| AC7 | second request <60 s: wait message, 429, still one email (local stack enforces it: probe 2026-11-25 gave 429 `over_email_send_rate_limit`) | `tests/e2e/auth.spec.ts` | `AC7: a second code request within 60 s shows the wait message and sends no second email` | e2e |
| AC8 | sign-out: sign-in screen, no `sb-*-auth-token` cookie, reload shows sign-in, Back to an earlier list history entry (sign-out uses `location.replace`, so the test opens the list twice) shows sign-in and no to-do, replayed old cookies get 401, old refresh token refused (threat model 3.6; direct PostgREST not asserted) | `tests/e2e/auth.spec.ts` | `AC8: sign-out clears the session; ...` | e2e |
| AC9 | signed out: list page shows sign-in, no to-do title in any response; list/read/create/change/delete API 401, DB unchanged | `tests/e2e/auth.spec.ts` | `AC9: signed out, the list page shows sign-in with no to-do data, ...` | e2e + abuse |
| AC10 | "Buy milk" at top, not done, one DB row with A's id | `tests/e2e/todos.spec.ts` | `AC10: Add creates 'Buy milk' at the top, ...` | e2e |
| AC11 | exactly A's 3 newest first; none of B's titles in any response or the page | `tests/e2e/todos.spec.ts` | `AC11: the list shows exactly the user's 3 to-dos newest first ...` | e2e |
| AC11 (API) | `GET /api/todos` order = `created_at desc, id desc` | `tests/e2e/api.spec.ts` | `list order is newest first (created_at desc, id desc)` | integration (HTTP) |
| AC12 | check/uncheck (click, then wait for the server-confirmed state: the checkbox is controlled by the server's answer), strike-through, DB, after reload | `tests/e2e/todos.spec.ts` | `AC12: checking marks done ...` | e2e |
| AC13 | edit title; done and owner unchanged | `tests/e2e/todos.spec.ts` | `AC13: editing 'Buy milk' to 'Buy oat milk' ...` | e2e |
| AC14 | delete: gone from list, DB, after reload | `tests/e2e/todos.spec.ts` | `AC14: delete removes the to-do ...` | e2e |
| AC15 | first sign-in through the UI (Mailpit code), create + toggle, sign out; second sign-in on a new context with a real session for the same address made through the admin code (a second UI code request within 60 s is refused by design, AC7, and an admin-generated code also counts as a send): same to-dos and done states | `tests/e2e/todos.spec.ts` | `AC15: after sign-out and a new sign-in in a new browser context, ...` | e2e |
| AC16 | 1 char, 200 chars, 200 emoji, "  Buy milk  " accepted on create and edit, stored trimmed | `tests/e2e/abuse/row5-input.spec.ts`; `tests/e2e/todos.spec.ts` | `AC16: 1 char, 200 chars, 200 emoji and '  Buy milk  ' ...`; `AC16 (UI): ...` | abuse (HTTP) + e2e |
| AC17 | 14 invalid titles (empty, whitespace kinds, 201, 201 after trim, 201 emoji, number, null, true, array, object, missing) on create and edit: 400 `validation_failed`, no change; UI: message + input kept | `tests/e2e/abuse/row5-input.spec.ts`; `tests/e2e/todos.spec.ts` | `AC17/AC26: create with a title that is <case> ...` (14), `AC17/AC26: edit with a title that is <case> ...` (14); `AC17 (UI): create with <case> ...` (3), `AC17 (UI): editing to whitespace only or 201 characters ...` | abuse + e2e |
| AC18 | non-JSON 400 `invalid_json`; >10 KB 413 (also multi-byte); non-uuid id 400 `invalid_id` on read/edit/delete; non-boolean done 400 | `tests/e2e/abuse/row5-input.spec.ts` | `AC18: a body that isn't JSON ...`, `AC18: a body over 10 KB ...`, `AC18: an id that isn't a uuid ...`, `AC18/AC26: done = <v> ...` (5), `AC18/AC26: an empty change body {} ...` | abuse |
| AC19 | DB CHECK via REST with A's token: `""`, `"   "`, 201 chars rejected on insert/update | `tests/e2e/abuse/row5-input.spec.ts`; pgTAP C1-C3 | `AC19: with A's token directly against Supabase REST, ...` | abuse + pgTAP |
| AC20 | `/admin`, `/api/admin`, `/api/admin/todos` 404, no data, signed out and in | `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts` | `AC20: ... (signed out)`, `AC20: ... (signed in as A)` | abuse |
| AC21 | forged bypass headers, no session: every API 401, DB unchanged | `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts` | `AC21/T1: no session + <header>: <value> -> ...` (12) | abuse |
| AC22 | A on B's X: read/toggle/edit/delete 404 with the same body as a missing id, no field of X, X unchanged | `tests/e2e/abuse/row2-idor.spec.ts` | `AC22: A's read, toggle, edit and delete of B's to-do return the same 404 ...` | abuse |
| AC23 | REST with A's token on B's X: 0 rows, unchanged | `tests/e2e/abuse/row2-idor.spec.ts` | `AC23: with A's token, Supabase REST select/update/delete of B's to-do affect 0 rows` | abuse |
| AC24 | client bundle scan; only `NEXT_PUBLIC_*` read; no service-role code path | `scripts/verify.sh` ("client bundle has no server secrets"); `tests/integration/app-code-static.test.ts` | `T4: no service-role or secret key reference`; `T4: process.env reads only ...` | verify.sh + static |
| AC25 | full journey: no secret (service-role key, secret key, JWT secret, S3 secret; DB password only if it is a real secret of 16+ characters: the local default is the word `postgres`, which legitimately appears in client JS) in any request/response; only anon/publishable apikey | `tests/e2e/journey.spec.ts` | `AC25 + AC36: full journey leaks no secret, ...` | e2e |
| AC26 | every AC17/AC18 case to every to-do API | `tests/e2e/abuse/row5-input.spec.ts` | all `AC17/AC26`, `AC18/AC26`, `AC26: a create body that is an array, ...` | abuse |
| AC27 | code request with `data {role: admin, is_admin: true}`: `raw_app_meta_data` has no role/admin; user sees only own (empty) list, 404 on A's to-do via API, 0 rows via REST | `tests/e2e/abuse/row8-mass-assignment.spec.ts` | `AC27: a code request with data {role: admin, is_admin: true} gives a normal user ...` | abuse |
| AC28 | create with `user_id`, `id`, `done`, `created_at`, `updated_at`, unknown, `role`, `__proto__`: 400, no row | `tests/e2e/abuse/row8-mass-assignment.spec.ts` | `AC28: create with any field besides title -> 400 and no row` | abuse |
| AC29 | change with `user_id`/`id`/`created_at`/`updated_at`/unknown (with and without valid fields): 400, X unchanged and A's | `tests/e2e/abuse/row8-mass-assignment.spec.ts` | `AC29: a change with user_id, id, created_at or unknown fields -> 400; ...` | abuse |
| AC30 | REST with A's token: insert as B / update own to B rejected | `tests/e2e/abuse/row8-mass-assignment.spec.ts`; pgTAP M1-M4 | `AC30: with A's token against Supabase REST, ...` | abuse + pgTAP |
| AC31 | 10 wrong codes through the UI: message each time, never a session. **Not row 9 proof (L21).** | `tests/e2e/abuse/row9-otp-guessing.spec.ts` | `AC31 (not row 9 proof, L21): 10 wrong codes ...` | abuse (functional) |
| AC32 | (a) static S5/S8/S9 config; (b) production P1-revised (the person); app has no own verify path | `tests/integration/auth-config.test.ts`; `tests/integration/app-code-static.test.ts`; manual | S5, S8, S9; `4.3/AC32: no app-owned code verification ...`; P1-revised | static + manual (production, the person) |
| AC33 | `[auth.captcha]` off locally/CI | `tests/integration/auth-config.test.ts` | `S11: no active [auth.captcha] (off locally and in CI); ...` (2b, unchanged) | static |
| AC34 | 4 payloads created and edited in the UI: literal text in list and edit field, `window.__xss` undefined, no dialog, stored unchanged; no `dangerouslySetInnerHTML` | `tests/e2e/abuse/row11-xss.spec.ts`; `tests/integration/app-code-static.test.ts`; verify.sh | `AC34: script/HTML titles created and edited in the UI ...`; `AC34: no dangerouslySetInnerHTML anywhere in app code` | abuse + static |
| AC35 | `/`, sign-in, list (signed in), 404, API (401 and 200): exactly one CSP equal to the threat model string, nonce, no `'unsafe-inline'`/`'unsafe-eval'` in script-src; five 2b headers; two requests differ | `tests/e2e/csp.spec.ts`; `tests/integration/csp.test.ts`; `tests/integration/security-headers.test.ts` | `AC35 + N4: /, sign-in, list, 404 and an API response each carry one exact CSP ...`; `AC35: two requests to the same page get different nonces`; N1 tests; N3 tests | e2e (HTTP) + unit + static |
| AC36 | journey AC1/10/12/13/14/8 on the production build: auth calls reach Supabase (connect-src), no CSP violation, no CSP console error, no page error | `tests/e2e/journey.spec.ts` | `AC25 + AC36: full journey ...` | e2e |
| AC37 | injected into the served list-page HTML (CSP header kept): an inline `<script>` without nonce, one with a guessed nonce, an inline `onerror` handler: none runs; `securitypolicyviolation` for `script-src(-elem/-attr)`; console error. Not via `page.evaluate()`: Chromium exempts DevTools-protocol script insertion from CSP (observed: even a `data:` script ran), so that would test the tool | `tests/e2e/csp.spec.ts` | `AC37: <case> in the served list page does not run and fires a script-src violation` (3) | e2e |
| AC38 | RLS on, four owner policies for `authenticated`, every public table has RLS | `tests/e2e/abuse/row14-database.spec.ts`; pgTAP S3/S4; verify.sh | `AC38: public.todos has RLS enabled and four owner-only policies for authenticated` | abuse (DB) + pgTAP |
| AC39 | anon key, no token: select/insert/update/delete get nothing | `tests/e2e/abuse/row14-database.spec.ts`; pgTAP N1 | `AC39: the anon key without a user token can't read, insert, update or delete to-dos` | abuse + pgTAP |
| AC40 | exact grants, EXECUTE on trigger function | pgTAP G1-G5 (db-builder) | `supabase/tests/03_todos_test.sql` | pgTAP |
| AC41 | no SQL from string concatenation of request input | code review (code-reviewer), security gate | - | review (no automated test: the app uses supabase-js query builders; a grep can't prove absence of string SQL) |
| AC42 | double-click Add, Enter twice: one to-do | `tests/e2e/todos.spec.ts` | `AC42: double-clicking Add creates exactly one to-do`; `AC42: pressing Enter twice quickly ...` | e2e |
| AC43 | two done requests sequential and parallel (both values); 5 quick UI clicks then reload: UI = DB | `tests/e2e/api.spec.ts`; `tests/e2e/todos.spec.ts` | `AC43: two 'done = true'/'done = false' requests, ...` (2); `AC43 (UI): 5 quick checkbox clicks ...` | integration (HTTP) + e2e |
| AC44 | act on a deleted to-do: API 404, no row; second tab shows "This to-do no longer exists." and drops it | `tests/e2e/api.spec.ts`; `tests/e2e/todos.spec.ts` | `AC44: after X is deleted, ...`; `AC44 (UI): acting on a to-do deleted in another tab ...` | integration (HTTP) + e2e |
| AC45 | 20 parallel creates: exactly 20 rows, own titles, none for others | `tests/e2e/api.spec.ts` | `AC45: 20 parallel creates give exactly 20 rows, ...` | integration (HTTP) |
| AC46 | release state (no real users until item 22/P1-revised, 1, 21, 9) | manual (git-release Handoff, `tasks/decisions.md`) | - | manual (process) |
| AC47 | typecheck, lint, `npm test`, `test:e2e`, build, verify.sh, CI | `scripts/verify.sh`, CI | - | gate |
| AC48 | this file | - | - | - |

API contract extras (not an AC by themselves; they pin backend-dev's Option A so every AC test above reads the
right shape): `tests/e2e/api.spec.ts` `list, create, read, change and delete as the owner return the documented
shapes` and `unsupported methods give 405 in the error format`.

## Security rows and threat-model tests

| Row / id | What | Test file | Test name | Level |
|----------|------|-----------|-----------|-------|
| 1 | AC20, AC21 | see above | | abuse |
| 1 T1 | 12 bypass headers x (list, read, create, change, delete, list page) | `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts` | `AC21/T1: ...` (12) | abuse |
| 1 T2 | wrong-key HS256, `alg: none`, expired HS256 (local JWT secret), random bytes in the session cookie: 401 everywhere | `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts` | `T2: a <kind> access token in the session cookie gets 401 ...` (4) | abuse |
| 1/8 T3 | no `user_metadata` / `raw_user_meta_data` read in `app/`, `lib/`, `components/`, `proxy.ts` | `tests/integration/app-code-static.test.ts` | `T3: no code reads user_metadata or raw_user_meta_data` | static |
| 2 | AC22, AC23 | see above | | abuse |
| 3 | AC24, AC25 | see above | | static + e2e |
| 3 T4 | no `SERVICE_ROLE`/`service_role`/`sb_secret`; `process.env` only the two public names + `NODE_ENV` | `tests/integration/app-code-static.test.ts` | `T4: ...` (2) | static |
| 5 | AC16-AC19, AC26 | see above | | abuse |
| 5 T5 | NUL, lone high / low surrogate on create and edit: 400 or stored exactly, never 500 | `tests/e2e/abuse/row5-input.spec.ts` | `T5: a title with a <case> is rejected with 400 or stored exactly, never 500` (3) | abuse |
| 8 | AC27-AC30 | see above | | abuse |
| 9 | AC31 (functional, **not proof**), AC32 (proof: static + P1-revised) | see above | | abuse + static + manual |
| 11 | AC34-AC37 | see above | | abuse + e2e + unit |
| 11 T6 | `</script><script>...` title in the server-rendered list: not unescaped in raw HTML, `window.__xss` undefined | `tests/e2e/abuse/row11-xss.spec.ts` | `T6: a </script> title in the server-rendered list stays text and is escaped in the HTML` | abuse |
| 13 | no secret in tests/fixtures/logs/traces: values only from `npx supabase status` in memory; traces/videos/HTML report off | `playwright.config.ts`, `tests/e2e/support/env.ts`; CI gitleaks | - | config + CI |
| 14 | AC38-AC41 | see above | | abuse + pgTAP + review |
| C1 | foreign Origin (`https://evil.example`, other port, other host name) on create/change/delete: 403 `forbidden_origin`, no CORS header, DB unchanged; preflight gets no `Access-Control-Allow-*` | `tests/e2e/abuse/csrf.spec.ts` | `C1: Origin ... -> 403 ...` (3); `C1: a CORS preflight from a foreign origin ...` | abuse |
| C2 | no Origin / `Origin: null`: 403 | `tests/e2e/abuse/csrf.spec.ts` | `C2: no Origin header -> 403 ...`; `C2: Origin null -> 403 ...` | abuse |
| C3 | `text/plain`, form-urlencoded, multipart, none: 415 `unsupported_media_type`, DB unchanged | `tests/e2e/abuse/csrf.spec.ts` | `C3: same-origin request with Content-Type <type> ...` (4) | abuse |
| C4 | session cookie `SameSite=Lax`, `path=/` after a real UI sign-in (http local, so `Secure` off) | `tests/e2e/auth.spec.ts` | `AC1 + C4: ...` | e2e |
| C4 (HTTPS) | `cookieOptionsFor(hostname)`: loopback hosts `secure: false`, every other host (incl. empty) `secure: true`, SameSite=Lax, path=/; independent of NODE_ENV | `tests/integration/cookie-options.test.ts` | `C4: loopback host %s ...` (5), `C4 (HTTPS case): non-loopback host %j ...` (6), `C4: NODE_ENV=%s does not change the result` (3) | unit |
| C5 | post-login return path: **N/A**, the frontend-dev build has no return path (always `/` after sign-in). If one is added, qa-test adds `https://evil.example`, `//evil.example`, `/\evil.example` -> list page | - | - | N/A |
| N1 | `buildCsp` prod/dev strings exact, no `'unsafe-inline'`, no prod `'unsafe-eval'`, H3/H5/H6, nonce extractable by Next's regex | `tests/integration/csp.test.ts` | all (16) | unit |
| N2 | `generateNonce()`: 1,000 unique, each `^[A-Za-z0-9+/]{22}==$` (16 bytes); live: 30 requests give 30 distinct well-formed nonces | `tests/integration/csp.test.ts`; `tests/e2e/csp.spec.ts` | `N2: 1,000 nonces are unique ...`, `N2: a generated nonce is accepted by buildCsp ...`; `N2 (live): 30 requests ...` | unit + e2e (HTTP) |
| N3 | no CSP in `headers()` (any env), five headers exact, `cacheComponents === false`, no `partialPrefetching` | `tests/integration/security-headers.test.ts` | `N3/H1: ...`, `N3/H2: <header> ...` (5), `N3: no rule in headers() sets Content-Security-Policy ...` (4), `N3: the five headers don't depend on ...`, `6.5: cacheComponents is false and partialPrefetching is not set ...`, `H1/AC2: ...` (5) | static |
| N4 | every `<script>` carries the header's nonce; a client-sent CSP / `x-nonce` request header can't choose it; proxy session refresh keeps CSP + sets cookie (6.4) | `tests/e2e/csp.spec.ts` | `AC35 + N4: ...`; `N4: a client-sent Content-Security-Policy / x-nonce request header cannot choose the nonce`; `N4 (6.4): a proxy session refresh keeps the CSP header and sets the new session cookie` | e2e (HTTP) |
| N5 | AC36, AC37 | see above | | e2e |
| N6 | `Cache-Control` contains `no-store` on list HTML, `GET /api/todos` (signed in), sign-in screen | `tests/e2e/csp.spec.ts` | `N6: HTML and API responses for a signed-in user have Cache-Control with no-store` | e2e (HTTP) |
| 6.1/6.4/3.3/3.5 | `proxy.ts` exists, no `middleware.ts`; exact matcher, no `has`/`missing`, no `runtime` export; `getSession()` not in server code; `getClaims()` only in `proxy.ts` | `tests/integration/app-code-static.test.ts` | `6.1: ...`, `6.4/3.5: ...`, `3.3: getSession() ...`, `3.3: getClaims() ...` | static |

## Not automated (and why)

- AC41: absence of string-built SQL is a code-review item (security gate).
- AC46: release process, recorded by git-release / the person.
- AC32(b) P1-revised and P2: production, run by the person only (AGENT_RULES §4).
- Dev-mode CSP (`'unsafe-eval'` only in `next dev`): unit-tested through `buildCsp({ isDev: true })`; not run live.

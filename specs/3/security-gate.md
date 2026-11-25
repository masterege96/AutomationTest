Result: PASS

# Task 3 security gate: email-code login + own to-dos

Author: security (Gate), 2026-11-25, round 2. Fresh context, judged from the repo only. Branch `feat/3-todos`, HEAD
`75d75fe`, diff `git diff origin/main...HEAD` (77 files). Gated against `specs/3/threat-model.md` (incl. 3.7),
`specs/3/schema.md`, `specs/3/test-plan.md`, `tasks/3/TASK_BRIEF.md` (ACs, answers, all Handoff entries),
`tasks/decisions.md`, `tasks/lessons.md`. No production, Supabase connector, linked command or dashboard was used.
Local keys stayed in the shell (from `npx supabase status -o env`); none was printed or written.

Round 1 (on `e9078ba`) was used only as a checklist; every row below was re-checked against the current code. Changes
since then (`e9078ba..75d75fe`): `DELETE /api/todos/[id]` returns 415 for a non-JSON content type (`ef37275`), pages
use `getVerifiedUser` (`cdca71a`), C3 DELETE tests and the test client sending JSON on every mutation (`e4e8cd3`).

PASS is code-level. It carries **required pre-release items for the person** (section "Release lock") and one
**merge precondition** (the CI change needs the person's `framework-change-approved` label). Neither is a code defect.

## Summary

| Row | Control (file:line) | Abuse test (test name) | Result |
|-----|---------------------|------------------------|--------|
| 1 `/admin` | No admin surface: `app/api/[...rest]/route.ts:5-15` (every method JSON 404; reads no session or body); `/admin` is Next's 404 page. Every to-do entry point authorizes itself: `lib/server/todo-api.ts:10-22` (`guardRequest`: Origin for mutations, then `getVerifiedUser`, 401 at :21), called first in `app/api/todos/route.ts:11,25` and `app/api/todos/[id]/route.ts:19,36,63`; `lib/server/supabase.ts:53-61` (`auth.getUser()`; any error or throw → null). Pages: `app/page.tsx:15-17` and `app/sign-in/page.tsx:14-16` now use `getVerifiedUser` (Auth outage → null → sign-in screen; fails closed). Proxy authorizes nothing: `proxy.ts:18-67` (nonce/CSP + `getClaims()` refresh in try/catch at :57-62). Only header edit: `x-middleware-prefetch` removed from the forwarded request for `/api` and `/api/*` only (`proxy.ts:16,28,32`), as 3.7 requires; the proxy never answers a request itself. No identity from headers or metadata (grep: no `user_metadata`/`raw_user_meta_data`/`app_metadata` in `app lib components proxy.ts`). | `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts`: `AC20: /admin, /api/admin, /api/admin/todos return 404 and no data` (signed in / out); `AC21/T1: no session + <header> -> every to-do API 401, list page has no data, DB unchanged` (all T1 headers incl. `x-middleware-prefetch: 1`, five `x-middleware-subrequest` forms, `x-user-id`); `AC21/T1: no session + rsc: 1 on <op> -> 307 to ?_rsc (empty, no Set-Cookie), followed -> 401; A's rows unchanged` (exact 3.7 assertion, 5 ops); `AC21/T1: no session + rsc: 1 on the list page -> no to-do data`; `AC21/T1: rsc: 1 with a forged session cookie -> 307 whose Set-Cookie may only delete`; `T2: a <kind> access token in the session cookie gets 401 on every to-do API, DB unchanged`; static `T3: no code reads user_metadata or raw_user_meta_data`, `3.3: getSession() is not used in server code`, `3.3: getClaims() is used only in proxy.ts`, `6.1: proxy.ts exists and middleware.ts does not` (`tests/integration/app-code-static.test.ts`) | **PASS** |
| 2 IDOR | RLS owner policies (migration :35-45). Every query also scoped `.eq("user_id", g.user.id)` with the user's anon-key RLS client: `app/api/todos/route.ts:17`, `app/api/todos/[id]/route.ts:29,55,76`; 0 rows → the same `not_found` body as a missing id (`[id]/route.ts:31,58,79`); ids `gen_random_uuid()` (migration :5), format `z.guid()` (`lib/server/todo-schemas.ts:31`). No service role. | `tests/e2e/abuse/row2-idor.spec.ts`: `AC22: A's read, toggle, edit and delete of B's to-do return the same 404 as a missing id; X unchanged`; `AC23: with A's token, Supabase REST select/update/delete of B's to-do affect 0 rows`; pgTAP R1-R5 (`supabase/tests/03_todos_test.sql`) | **PASS** |
| 3 Key in the browser | Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NODE_ENV` are read: `lib/client/supabase.ts:9-10`, `lib/server/supabase.ts:25-26`, `proxy.ts:22-23,40-41` (security grep this gate). No `service_role`/`SERVICE_ROLE`/`sb_secret` in `app lib components proxy.ts next.config.ts`. No new env var reaches the client. | static `T4: no service-role or secret key reference`, `T4: process.env reads only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and NODE_ENV`; e2e `AC25 + AC36: full journey leaks no secret, uses only the anon key, and has no CSP violation` (`tests/e2e/journey.spec.ts`); verify.sh `no service-role key referenced in client components`; security's bundle scan (Automated results) | **PASS** |
| 5 Bad input | zod strict: `lib/server/todo-schemas.ts:14-21` (trim, 1-200 code points, no NUL / lone surrogate), `:23` create `strictObject({title})`, `:25-27` patch `strictObject({title?, done?})` + at least one, `:31` id `z.guid()` (accepted deviation, brief backend-dev follow-up). Body: `lib/server/body.ts:9-12` JSON content type, `:41-43` 415, `:44-47` declared length > 10240 → 413, `:15-37,54` streamed byte cap → 413, `:55-59` strict UTF-8 + `JSON.parse` → 400 `invalid_json`. Order 403 → 401 → 415 → 413 → 400: create `app/api/todos/route.ts:25-31`, patch `[id]/route.ts:36-44`; **DELETE (new)** `[id]/route.ts:63-70`: 403 → 401 → 415 (`:67`, body never read) → 400 `invalid_id`. DB CHECKs `todos_title_trimmed`, `todos_title_length` (migration :13-14). Errors are fixed text; `internalError` logs op + error code only (`lib/server/errors.ts:42-51`). | `tests/e2e/abuse/row5-input.spec.ts`: `AC16: 1 char, 200 chars, 200 emoji and '  Buy milk  ' are accepted ...`; `AC17/AC26: create with a title that is <case> -> 400, no row` and `... edit ... -> 400, row unchanged` (each case); `AC18: a body that isn't JSON -> 400 invalid_json on create and edit`; `AC18: a body over 10 KB -> 413 ...`; `AC18: an id that isn't a uuid -> 400 invalid_id on read, edit and delete`; `AC18/AC26: done = <case> -> 400`; `AC18/AC26: an empty change body {} -> 400`; `AC26: a create body that is an array, string, number or null -> 400`; `T5: a title with a <NUL / lone surrogate> is rejected with 400 or stored exactly, never 500`; `AC19: with A's token directly against Supabase REST, '', '   ' and 201 chars are rejected ...`; pgTAP C1-C3; unit `lib/server/body.test.ts`, `lib/server/todo-schemas.test.ts` | **PASS** |
| 8 Mass assignment / admin at signup | Create inserts only `{ title }` (`app/api/todos/route.ts:34`); patch copies only `title`/`done` (`[id]/route.ts:47-49`); strict schemas (row 5); `user_id` from column default `auth.uid()` (migration :6); column grants `insert (title)`, `update (title, done)` (migration :51-52); RLS `with check` (:39-43). Nothing reads `user_metadata`; no roles exist. | `tests/e2e/abuse/row8-mass-assignment.spec.ts`: `AC27: a code request with data {role: admin, is_admin: true} gives a normal user limited to own to-dos`; `AC28: create with any field besides title -> 400 and no row`; `AC29: a change with user_id, id, created_at or unknown fields -> 400; X unchanged and still A's`; `AC30: with A's token against Supabase REST, insert as B and update own to-do to B are rejected`; pgTAP M1-M5 (M4 proves the RLS layer alone) | **PASS** |
| 9 Guess the login code | Browser calls Auth directly, no app-owned verify path: `components/SignInForm.tsx:43-46` (`signInWithOtp`, `shouldCreateUser: true`), `:78-82` (`verifyOtp`, `type: "email"`); no server code calls verify (grep). `supabase/config.toml` diff adds only the two email-template tables; 2b values unchanged (`token_verifications = 5`, `otp_length = 6`, `otp_expiry = 900`, `max_frequency = "60s"`). Production values applied by the person (`tasks/decisions.md`, runs 1-3: `rate_limit_verify` 5, `rate_limit_otp` 10, `mailer_otp_exp` 900, `mailer_otp_length` 6). | static `tests/integration/auth-config.test.ts` S1-S12 (unchanged, green); `4.3/AC32: no app-owned code verification (verifyOtp / auth verify only in browser code)`; functional `AC31 (not row 9 proof, L21): 10 wrong codes through the UI each show the message and never create a session` | **PASS (code/config). Behavioral proof is the person's P1-revised, release-blocking (Release lock)** |
| 11 XSS + nonce CSP | Titles only as React text (`components/TodoItem.tsx:118`), input `value` (`:87`) and `aria-label` strings; no `dangerouslySetInnerHTML`, `innerHTML`, `srcDoc`, `href={…}`/`src={…}`, `eval`, `document.write` in `app lib components proxy.ts` (security grep). CSP: `lib/server/csp.ts:9-11` nonce = 16 bytes `crypto.getRandomValues`, base64; `:6,32` throws on a malformed nonce (fails closed); `:31-46` equals threat model 6.3 (prod `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'`; `'unsafe-eval'` only when `isDev` = `NODE_ENV === "development"`, `proxy.ts:23`). `proxy.ts:19` per-request nonce; `:33-34` request headers `set` (client can't choose the nonce); `:65` one response CSP; `:69-71` matcher exactly 6.4, no `has`/`missing`. `next.config.ts:11` `cacheComponents: false`, `:12-31` CSP removed, five 2b headers byte-identical, no `partialPrefetching`. `app/layout.tsx:27` `await connection()` (every route dynamic, 6.5). | `tests/e2e/abuse/row11-xss.spec.ts`: `AC34: script/HTML titles created and edited in the UI show as literal text, never run, and are stored unchanged`; `T6: a </script> title in the server-rendered list stays text and is escaped in the HTML`; `tests/e2e/csp.spec.ts`: `AC35 + N4: /, sign-in, list, 404 and an API response each carry one exact CSP plus the five 2b headers`, `AC35: two requests to the same page get different nonces`, `N2 (live): 30 requests give 30 distinct 16-byte base64 nonces`, `N4: a client-sent Content-Security-Policy / x-nonce request header cannot choose the nonce`, `N4 (6.4): a proxy session refresh keeps the CSP header and sets the new session cookie`, `N6: HTML and API responses for a signed-in user have Cache-Control with no-store`, `AC37: <inline script / guessed nonce / onerror> in the served list page does not run and fires a script-src violation`; journey `AC25 + AC36`; unit `tests/integration/csp.test.ts` (N1, N2), `tests/integration/security-headers.test.ts` (N3); static `AC34: no dangerouslySetInnerHTML anywhere in app code`; verify.sh `no unsanitized dangerouslySetInnerHTML` | **PASS** |
| 13 `.env` in Git | No secret in the diff (security scan of added lines for JWTs, `sb_secret_`, `sb_publishable_`, DB URLs with a password, Stripe keys, PEM blocks: none); only `.env.example` tracked. Tests read local keys from `npx supabase status -o env` into memory, never into `process.env` (`tests/e2e/support/env.ts:6-7,47-58`); Playwright `trace`/`video`/`screenshot` `"off"`, reporter `list` (`playwright.config.ts:34-40`). CI exports only URL, anon key, Mailpit URL, each `::add-mask::`ed, to `$GITHUB_ENV` (`.github/workflows/ci.yml:57-68`). | CI `secrets` job (gitleaks, unchanged); verify.sh `no .env files tracked`, `basic secret pattern scan on changed files`; AC25 | **PASS** |
| 14 Query the DB | `supabase/migrations/20261125165117_create_todos.sql` is byte-identical to `specs/3/schema.md` section 9 (diffed this gate). RLS on (:35); four `to authenticated` owner policies `(select auth.uid()) = user_id` (:37-45); no anon policy; `revoke all ... from anon, authenticated`, then `select, delete` + `insert (title)` + `update (title, done)` to `authenticated` only (:49-52); trigger function `security invoker`, `search_path = ''`, EXECUTE revoked (:21-29, 2a). No SQL from strings: all app queries are supabase-js builder calls; no `.rpc(` or raw SQL in `app lib proxy.ts` (AC41). | `tests/e2e/abuse/row14-database.spec.ts`: `AC38: public.todos has RLS enabled and four owner-only policies for authenticated`, `AC39: the anon key without a user token can't read, insert, update or delete to-dos`; pgTAP `supabase/tests/03_todos_test.sql` (plan 163: S/G/R/M/N/C/K incl. grant checks G1-G5); verify.sh `RLS enabled on every public table`, `database tests`, `SQL lint` | **PASS** |
| 4, 6, 7, 10, 12 | N/A, confirmed in threat model section 2 (no prices, payments, single-use items, AI, uploads) | - | N/A |

## Threat-model controls not covered by a row above

| Control | Code | Test | Result |
|---------|------|------|--------|
| 3.2 cookies: `path /`, `SameSite=Lax`, `Secure` from the host, not `NODE_ENV` | `lib/client/cookie-options.ts:6-11` (`secure` false only for loopback hosts); browser `lib/client/supabase.ts:14`, server `lib/server/supabase.ts:15-22,29-31` (hostname from `Host`; missing/unparsable → Secure on), proxy `proxy.ts:44`. `httpOnly` not possible with browser-side sign-in (accepted, 3.2). | `tests/integration/cookie-options.test.ts` (C4: loopback false; real hosts, `""` true; `NODE_ENV` has no effect); e2e `AC1 + C4: ... cookie is SameSite=Lax` | **PASS** |
| 3.3 `getUser()` for every data decision; `getClaims()` only in proxy; never `getSession()` | `lib/server/supabase.ts:53-61`; `proxy.ts:59`; grep: no `getSession` | static 3.3 tests | **PASS** |
| 3.4 protected routes | list page redirects before rendering (`app/page.tsx:15-17`); API 401 before body/DB (`lib/server/todo-api.ts:20-21`) | `AC9: signed out, the list page shows sign-in with no to-do data, and every API call is 401 with no DB change` | **PASS** |
| 3.6 sign-out global, replayed cookie 401, refresh token revoked, `no-store`, `pageshow` | `components/SignOutButton.tsx:26-31` (`signOut()` default global; `sb-*` cookies cleared on failure); `lib/server/errors.ts:4,22,26` `private, no-store` on every API response; `components/TodoList.tsx:67-70` | `AC8: sign-out clears the session; reload/Back show sign-in; old cookies get 401; old refresh token is revoked`; `N6` | **PASS** |
| 3.7 `x-middleware-prefetch` fixed (401); `rsc: 1` documented exception (307 → 401) | `proxy.ts:16,28,32` (one header, `/api` only; proxy never answers `rsc`) | T1 tests in row 1 (exact 3.7 assertion incl. forged-cookie variant) | **PASS** |
| 5 CSRF: Origin present, http(s), exact origin form, host == `Host`; JSON content type on every mutation; no CORS headers | `lib/server/origin.ts:5-19`; `lib/server/todo-api.ts:11-13` (mutations, before `getUser()` and before the body); 415 in `lib/server/body.ts:41-43` (create, patch) and **`app/api/todos/[id]/route.ts:67` (DELETE, new)**; no `Access-Control-*` anywhere (grep) | `tests/e2e/abuse/csrf.spec.ts`: `C1/C2 <origin case> -> 403 forbidden_origin on create, change and delete; DB unchanged` (foreign, other port, `localhost` vs `127.0.0.1`, missing, `null`); `C3: same-origin request with Content-Type <type> and a JSON body -> 415; DB unchanged` (4); **`C3: same-origin DELETE of the user's own to-do with Content-Type <type> -> 415; row still there`** (4: `text/plain`, form-urlencoded, multipart, none; with and without a body); `C1: a CORS preflight from a foreign origin gets no Access-Control-Allow-* headers`; unit `lib/server/origin.test.ts` | **PASS** |
| 3.1 no return path / open redirect | `app/sign-in/page.tsx` reads no parameter; `components/SignInForm.tsx:89` `location.replace("/")` | C5 N/A (no return path; test-plan C5 row) | **PASS** |
| 6.5 no static HTML | `next.config.ts:11`, `app/layout.tsx:27` | `N4` every `<script>` carries the nonce; verify build | **PASS** |
| 8 RLS sign-off | migration == schema.md §9 (unchanged since design) | pgTAP | **PASS (matches)** |

The test-client change in `e4e8cd3` (`tests/e2e/support/api.ts:40-42`: JSON content type on every non-GET request,
like `lib/client/api.ts:52`) weakens no test: the C1/C2/T1/IDOR cases now fail for the intended reason (Origin, session,
ownership) rather than an incidental 415, and the new C3 DELETE cases override the header explicitly.

## CI workflow change (`.github/workflows/ci.yml:45-68`)

- Adds, in the `verify` job only: Playwright Chromium install (version from the lockfile, `--no-install`),
  `supabase start`, and an export step for three local-stack values. Trigger stays `pull_request`,
  `permissions: contents: read`; no `secrets.*`, no environment, no `pull_request_target`. Job names `verify`,
  `db-check`, `secrets` unchanged; `verify.sh` still runs unmodified; no step skipped, no `continue-on-error`, no check
  removed. `gate.yml`, `drift.yml`, `scripts/**` untouched. **Doesn't expose secrets or weaken checks.**
- The values are the runner's ephemeral local stack URL, anon key and Mailpit URL (no production value exists in this
  job); each is masked before being written to `$GITHUB_ENV`, only names are echoed. `supabase start` itself prints
  the local default keys to the log (as `db-check` already did); they grant nothing outside the runner.
- **Merge precondition:** `.github/workflows/**` is a framework path. The PR needs the **person's
  `framework-change-approved` label** (AGENT_RULES 18a; `tasks/decisions.md` task 3 item 3). Agents never add it.

## Release lock (AC46): proven locally vs what the person must do before real users

Proven locally (this gate): every row above in code + tests; row 9's configured values (S-tests) and that the app adds
no own verify path. **Not provable locally:** row 9 rate limiting (the local stack enforces no per-IP limits, L21),
production behavior of the server's `getUser()` calls, and host-dependent cookie/Origin behavior.

Merging this PR deploys the migration to production (an empty table; allowed by AC46; S14 accepted for this merge per
`tasks/decisions.md`). **Sign-in must not be opened to real users** (no production URL announced, no real sign-ups)
until the person has recorded in `tasks/decisions.md`:

1. **P1-revised (row 9, blocking)**: threat model 4.5 / brief devops-cicd checklist: 35 wrong-code verify requests,
   then a 65 s wait and 2 more. Pass, or if burst-bound, one of (a) lower burst + re-run pass, (b) `otp_length` 8
   (security's recommendation), (c) explicit risk acceptance by the person. Replaces 2b item 22's 10-attempt loop.
2. **P2 (blocking)**: 60 to-do API calls by one signed-in test user within 3 min through the deployed app: no 401,
   no 429.
3. **P4 (blocking, when a host is chosen)**: on the deployed host, confirm (a) the session `Set-Cookie` carries
   `Secure`, and (b) a same-origin to-do create works while one with `Origin: https://evil.example` gets 403. Reason:
   `cookieOptionsFor` and `isSameOrigin` read the `Host` header (`lib/server/supabase.ts:15-22,29-31`,
   `lib/server/origin.ts:5-19`); a reverse proxy that rewrites `Host` to a loopback name would drop `Secure` on
   server-set cookies, and one that forwards only `X-Forwarded-Host` would need an Origin-check change. The CDN/proxy
   must also strip `x-middleware-subrequest` and keep `_rsc` in its cache key (threat model 3.5, 3.7).
4. **Item 1** custom SMTP; **item 21** site URL / redirect URLs once a host exists; **item 9 + task 3b** Turnstile;
   production **Magic Link** and **Confirm signup** email templates show `{{ .Token }}` (copy
   `supabase/templates/*.html`). Leave Auth IP forwarding off; no secret API key.

git-release records the release state in the brief's Handoff (AC46).

## Automated results

| Check | Result |
|-------|--------|
| `npm test` | 12 files, 211/211 pass |
| `bash scripts/verify.sh --brief tasks/3/TASK_BRIEF.md` (with DB; local stack env exported in the shell only; `test:e2e` on a production build) | `verify.sh: PASS 19/19 (0 skipped)` at `75d75fe`. `test:e2e`: 135 passed. (A first run without the stack env exported failed only `npm run test:e2e` at Playwright's config guard, "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, MAILPIT_URL not set": an environment precondition, not a code result.) |
| Client bundle scan (security, after the build) | The local stack's `SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET`, `S3_PROTOCOL_ACCESS_KEY_SECRET` (held in the shell only) are **not** in `.next/static`; the anon key is (expected, public). The only `sb_secret_` text in the bundle is supabase-js's key-prefix check (`startsWith("sb_secret_")`), not a value. |
| `npm audit --audit-level=high` | found 0 vulnerabilities |
| Secret scan | security's scan of the diff's added lines: no JWT, `sb_secret_`, `sb_publishable_`, DB URL with password, Stripe key, PEM; verify.sh secret pattern scan PASS; gitleaks not installed locally (CI `secrets` job runs it). No value printed during this gate. |
| Supabase security advisors | Not run: this gate uses no cloud tools. Covered locally by `db lint` (verify.sh) and pgTAP grant/RLS tests. Post-deploy advisors belong to git-release's post-deploy check. |
| RLS check | verify.sh `RLS enabled on every public table (static check)` + pgTAP |

## Manual review of the diff

- Server-side authorization on every new route: yes (`guardRequest` in every to-do handler; `getVerifiedUser` on both
  pages); the catch-all returns 404 only.
- Client-trusted values: none; `user_id` never from the body; ids validated; ownership by RLS + `.eq("user_id")`.
- Raw SQL from strings: none in app code.
- `dangerouslySetInnerHTML` / HTML sinks: none.
- New env vars reaching the client: none (`MAILPIT_URL` is test/CI only, never read by app code).
- LLM output, uploads: none.
- Dependencies: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119.2, `zod` 4.6.7, `@playwright/test` 1.65.1,
  exact pins, approved by the person (`tasks/decisions.md` task 3 item 1); audit clean.

## Other findings (not blocking)

1. `isSameOrigin` compares host only, not scheme (`lib/server/origin.ts:18`), as threat model 5 specifies. An
   `http://` page on the same host could pass; HSTS (2b) and an HTTPS-only production host make this moot. Revisit
   with P4.
2. `internalError` maps a `23514`/`42501` from a signed-in user to 500 (logged by code only, `lib/server/errors.ts:42-51`).
   Correct per design; such a log line in production means the whitelist let something through and should be
   investigated.
3. Residual risks accepted in the threat model stand: cookies not HttpOnly (3.2), a captured access token usable
   against PostgREST until expiry after sign-out (3.6), no per-user to-do cap (7).
4. L25/L26 (open, framework): re-run the CSP and T1 suites at every Next.js upgrade.
5. verify.sh bundle check is weak (framework, devops-cicd; carried from round 1 for the orchestrator to file as a
   lesson): `scripts/verify.sh:182-191` runs before `npm run build`, so on a clean tree it is skipped (it ran in this
   gate only because `.next/static` remained from an earlier build), and it compares only values of env vars exported
   in the shell (`SUPABASE_SERVICE_ROLE_KEY`, ...), which neither CI nor the documented local commands export. Not a
   task 3 defect: row 3 is proven by T4 (static), AC25 (every browser request/response scanned) and security's bundle
   scan above. Fix (framework change, the person's label): run the bundle check after the build and read the local
   stack's secret values from `supabase status -o env` when a stack is running.

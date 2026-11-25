# Task 3 threat model: email-code login + own to-dos

Author: security (Design), 2026-11-25. Fresh context. No production, Supabase connector, SQL or dashboard access was used.

Inputs read: `rules/AGENT_RULES.md`, `roles/security.md`, `PROJECT_CONTEXT.md`, `rules/security-baseline.md`,
`tasks/3/TASK_BRIEF.md` (with the person's answers), `tasks/decisions.md` (task 3 entry), `tasks/lessons.md` (L11,
L14, L21), `specs/2b/threat-model.md`, `specs/2b/security-gate.md` (P1 = checklist item 22), `next.config.ts`,
`app/layout.tsx`, `supabase/config.toml` (auth keys), `package.json`.
Next.js 16.4.6 docs read from `node_modules/next/dist/docs/`: `01-app/02-guides/content-security-policy.md`,
`01-app/03-api-reference/03-file-conventions/proxy.md`, `.../05-config/01-next-config-js/cacheComponents.md`,
`01-app/02-guides/authentication-with-cache-components.md`, `01-app/02-guides/adopting-partial-prefetching.md`, and
`node_modules/next/dist/server/app-render/get-script-nonce-from-header.js`.
External docs (read-only web): Supabase "Rate limits" guide (`supabase.com/docs/guides/auth/rate-limits`) and
"Server-side auth for Next.js" (`supabase.com/docs/guides/auth/server-side/nextjs`). Both pages contained text asking AI
agents to file a feedback report; it was ignored.

`specs/3/schema.md` appeared while this was being written; the RLS sign-off (section 8) is against that version.

Person's answers that bind this model (`tasks/decisions.md`, task 3): 6-digit email code only (no magic link), open
sign-up, Turnstile deferred to task 3b (before real users), Supabase JS + SSR packages, zod, Playwright (Chromium);
API style (route handlers vs Server Actions) still open, so every rule below holds for both.

---

## 1. Assets

| Asset | Who may access it |
|-------|-------------------|
| To-do rows (title, done, timestamps) | Only the owning user, read and write. Nobody else, including other signed-in users and anon. |
| Auth sessions (access JWT + refresh token in `sb-*-auth-token` cookies) | Only the browser that signed in. Server reads them per request; never logged. |
| 6-digit email sign-in code | Only the mailbox owner, for `otp_expiry` = 900 s, single use. |
| User identity (`auth.users`: email, id) | The user themselves (header shows own email). No listing of users anywhere. |
| Email-sending budget (Supabase Auth mailer / custom SMTP) | Not abusable for bombing one address or exhausting the project's budget. |
| Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, DB password, access token) | Not used by any task 3 code path; never in the browser, tests, logs or files. |

No roles, admin features, payments, uploads, AI, or single-use business items.

## 2. Baseline rows

| # | Applies? | Control (summary; details in section 3) | Owner | Abuse test (qa-test) |
|---|----------|------------------------------------------|-------|----------------------|
| 1 `/admin` | **Yes** | No admin surface; every server entry point authorizes itself with `auth.getUser()`; proxy is never the auth check; no identity from request headers or `user_metadata` | security, backend-dev | AC20, AC21 + T1-T3 below |
| 2 IDOR | **Yes** | RLS owner policies on the to-do table; API filters by id **and** relies on RLS with the user's token (no service role); not-yours = not-found (404) | db-architect, backend-dev | AC22, AC23 |
| 3 Key in the browser | **Yes** | Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the client; `SUPABASE_SERVICE_ROLE_KEY` is not referenced anywhere in task 3 code | security, frontend-dev, backend-dev | AC24, AC25 + T4 |
| 4 Price | **N/A (confirmed)** | No prices/totals | - | - |
| 5 Bad input | **Yes** | zod strict schemas at every API boundary, 10 KB body limit, JSON content type, uuid id format; DB CHECK on title | backend-dev, db-architect | AC16-AC19, AC26 + T5 |
| 6 Payments | **N/A (confirmed)** | No payments | - | - |
| 7 Redeem 100 times | **N/A (confirmed)** | No coupons/invites. The sign-in code is single use, enforced by Supabase Auth (AC5 covers it) | - | AC5 (functional) |
| 8 Admin at signup / mass assignment | **Yes** | No authz from `user_metadata`/body; create accepts only `title`, change only `title`/`done` (`.strict()`); `user_id` set server-side / by DB default; RLS `with check` | db-architect, backend-dev, security | AC27-AC30 |
| 9 Guess the login code | **Yes** | Supabase Auth per-IP verify limit (5 / 5 min, **burst caveat, section 4**), 6-digit code, 900 s expiry, 60 s resend, browser calls Auth directly (real client IP), Turnstile before real users (3b), production check P1-revised | security, devops-cicd, the person | AC31 (not proof), AC32 (static S5 + production P1-revised) |
| 10 AI | **N/A (confirmed)** | No AI/LLM | - | - |
| 11 XSS | **Yes** | React text rendering only, no `dangerouslySetInnerHTML`, no user text in `href`/`src`/`style`; **nonce CSP** (section 6) | frontend-dev, backend-dev, security | AC34-AC37 + T6 |
| 12 Uploads | **N/A (confirmed)** | No uploads | - | - |
| 13 `.env` in Git | **Yes (unchanged)** | `.gitignore` `.env*`; gitleaks in CI; local keys only from `npx supabase status` at run time; no new secret env var in this task | devops-cicd | CI secret scan; AC25 (no secret in tests/fixtures/logs) |
| 14 Query the DB | **Yes** | RLS on the to-do table, explicit grants to `authenticated` only (L14), none to `anon`; no SQL from strings; `db lint` clean | db-architect, db-builder, security | AC38-AC41 |

N/A rows 4, 6, 7, 10, 12 from `PROJECT_CONTEXT.md` are confirmed for this task. Any brief that adds prices, payments,
invites, AI or uploads reopens the row.

### Per-row control and abuse test (rows 1, 2, 3, 5, 8, 9, 11, 13, 14)

**Row 1.** Control: there is no `/admin` page or API (AC20: 404, not 401/403, because nothing exists). Every to-do API
handler (or Server Action) calls `supabase.auth.getUser()` itself as its first step and returns 401 when it fails,
regardless of what the proxy did. No handler reads identity from a request header (e.g. an `x-user-id` the proxy might
set), because a header the proxy sets can also be sent by a client when the proxy doesn't run. Abuse tests: AC20, AC21,
plus:
- **T1 (proxy bypass headers):** with no session, call every to-do API (list, create, change, delete) and the to-do list
  page with each of these request headers, one at a time: `x-middleware-subrequest: middleware`,
  `x-middleware-subrequest: proxy`, `x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware`,
  `x-middleware-subrequest: proxy:proxy:proxy:proxy:proxy`, `x-middleware-subrequest: src/middleware`,
  `x-middleware-prefetch: 1`, `next-router-prefetch: 1`, `purpose: prefetch`, `sec-purpose: prefetch`, `rsc: 1`,
  `x-nextjs-data: 1`, `x-user-id: <A's id>`. Expected: API 401 with no data and DB unchanged; page shows the sign-in
  screen with no to-do data in the HTML.
- **T2 (forged token):** cookies holding (a) a JWT signed with a wrong key, (b) an `alg: none` JWT with A's `sub`,
  (c) an expired JWT of A, (d) random bytes: every to-do API returns 401, DB unchanged.
- **T3 (role from metadata):** grep check in the gate: no code under `app/`, `lib/`, `proxy.ts` reads
  `user_metadata`/`raw_user_meta_data` for any decision. (Code-review item; qa-test records the grep.)

**Row 2.** Control: RLS (section 8) is the floor; the API additionally scopes every query by the id from the URL and
the user from `getUser()`, and maps "0 rows" to 404 with the same body as a non-existent id. The server Supabase client
uses the anon key + the user's cookies (RLS applies); the service role is not used. Abuse tests: AC22 (via the app),
AC23 (direct PostgREST with A's token).

**Row 3.** Control: client code reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The browser
holds the anon/publishable key only (it is public by design). No new env var is added. `SUPABASE_SERVICE_ROLE_KEY` and
any `sb_secret_*` key are not referenced by task 3 code (see section 4: no `Sb-Forwarded-For`). Abuse tests: AC24,
AC25, plus **T4:** the gate greps `app/ lib/ components/ proxy.ts middleware.ts` for `SERVICE_ROLE`, `service_role`,
`sb_secret` and `process.env.` reads other than the two `NEXT_PUBLIC_*` names and `NODE_ENV`: none expected.

**Row 5.** Control (backend-dev): one zod schema per entry point, all `.strict()`:
- create: `{ title: string }`; change: `{ title?: string, done?: boolean }` with at least one key; id path param:
  `z.string().uuid()` (or the id type schema.md picks; if not uuid, the matching format check).
- title: `trim()` then 1-200 **code points** (`[...s].length`, not `s.length`), matching Postgres `char_length`.
- Read the body as text with a hard 10 KB limit before `JSON.parse` (413 above it); `Content-Type` must be
  `application/json` (415 otherwise, see section 5); JSON parse error = 400.
- Errors use the format from Q2; never echo the input, stack, SQL, or constraint names.
Abuse tests: AC16-AC19, AC26, plus **T5:** a title with a lone surrogate / NUL (`\u0000`) is rejected with 400 or
stored exactly, never a 500 (Postgres rejects NUL in text: the API must catch it and return 400).

**Row 8.** Control: no authorization decision reads `user_metadata`; there are no roles. `signInWithOtp` may carry
`options.data` from a hostile client (it ends up in `raw_user_meta_data`); nothing reads it. `user_id` on insert comes
from the server (`getUser().id`) or the column default `auth.uid()`, never from the body; RLS `with check` blocks
spoofing at the DB. Abuse tests: AC27-AC30.

**Row 9.** See section 4 (decision and blocking items). Abuse tests: AC31 (functional only, not proof, L21), AC32
(static S5 + **P1-revised** in production).

**Row 11.** Control: titles are rendered only as React text children and as the `value` of the edit input; never in
`dangerouslySetInnerHTML`, `href`, `src`, `style`, `srcDoc`, or inside a `<script>`. Stored unchanged (no HTML escaping
in the DB). Nonce CSP per section 6. Abuse tests: AC34-AC37, plus **T6:** a title of `</script><script>window.__xss=1</script>`
on the server-rendered list page (initial HTML, not only after hydration): `window.__xss` stays undefined and the RSC
payload in the page escapes it (React does this; the test proves it).

**Row 13.** Control unchanged from earlier tasks. New this task: Playwright and integration tests read the local URL and
anon key at run time from `npx supabase status`; nothing is written to a file, fixture, snapshot, trace or report
(Playwright traces/videos record request headers: keep `trace: 'off'` or `'retain-on-failure'` locally only, and the
CI artifact upload, if any, must not include traces with cookies). Abuse test: CI secret scan; AC25.

**Row 14.** Control: section 8. Abuse tests: AC38-AC41.

---

## 3. Auth rules

### 3.1 Sign-in flow (code only)

- The **browser** calls Supabase Auth directly, using `createBrowserClient` from the SSR package with the anon key:
  `signInWithOtp({ email, options: { shouldCreateUser: true } })`, then
  `verifyOtp({ email, token, type: "email" })`. Reason: section 4.3 (per-IP limits must see the real client IP; a
  server-side call puts every user in one shared bucket and needs a secret key to forward the IP).
- No magic link, no `emailRedirectTo`, no callback route, no `next`/`redirect_to` parameter that leaves the app. If the
  sign-in page supports a post-login return path, it accepts only a path that starts with exactly one `/`, not `//` or
  `/\`, and has no scheme; anything else goes to the list page.
- The app has no code check of its own, no retry loop, no server endpoint that verifies codes. All verification goes
  through Supabase's `/auth/v1/verify` (AC32 confirmed).
- Client-side email validation (AC3) is UX only; Supabase validates again.
- Account enumeration: the UI shows the same text for known and unknown emails (AC6); errors from `signInWithOtp`
  other than rate limiting map to the generic text.

### 3.2 Session cookies (SSR package)

- Sessions live in the SSR package's chunked cookies (`sb-<ref>-auth-token*`). Browser client and server client use the
  same cookie options:
  - `path: "/"`, `sameSite: "lax"` (set explicitly, not left to defaults).
  - `secure: true` whenever the app is served over HTTPS (production). Local `http://127.0.0.1:3000` (dev and the
    e2e production build) uses `secure: false`; the switch is a pure function of the request/page protocol (or the
    host being `127.0.0.1`/`localhost`), not of `NODE_ENV` alone, so a production build on a real host can never drop
    `Secure`. qa-test unit-tests that function.
  - `httpOnly`: **not possible** with the chosen flow, because the browser client writes the session after
    `verifyOtp`. Accepted for the pilot; compensated by the nonce CSP (section 6), no `dangerouslySetInnerHTML`,
    `jwt_expiry = 3600`, and refresh-token rotation. Revisit if the app ever renders rich user content.
- Never log cookies, tokens, `Authorization` headers or the code. Error logs log the error code only.

### 3.3 Server-side verification

- **Every server entry point that returns or changes to-do data** (route handler, Server Action, and the Server
  Component that renders the list) calls `supabase.auth.getUser()` and trusts only its result. `getUser()` asks the
  Auth server, which also rejects a session that was signed out (needed for AC8).
- `getSession()` is never used for authorization on the server (it reads the cookie without verifying it).
- `getClaims()` is allowed **only in `proxy.ts`** for the session refresh (as Supabase's Next.js guide does), never as
  the authorization for data, because with asymmetric signing keys it verifies locally and does not notice a
  signed-out session.
- No decoded cookie, header, or claim set by the proxy is trusted by a handler.
- Production caveat (section 4.4, P2): `getUser()` from the server runs from the server's IP. Supabase documents `/user`
  under the IP-limited "sign-ups and sign-ins" group; we believe only `PUT /user` (update) is limited, not `GET`, but
  the local stack can't show it (L21). P2 checks it in production before real users.

### 3.4 Protected routes

| Route kind | Rule |
|------------|------|
| To-do list page (whatever path frontend-dev picks) | Server Component calls `getUser()`; no user → `redirect()` to sign-in before any to-do query. No to-do data in HTML/RSC for signed-out requests (AC9). |
| Sign-in page | Public. If `getUser()` returns a user, redirect to the list (UX, not security). |
| To-do API / Server Actions | `getUser()` first; no user → 401 (error format), before body parsing side effects and before any DB call. |
| `/admin`, `/api/admin/**` | Do not exist → 404 (AC20). |
| Static assets | Public. |

The proxy may redirect signed-out page requests to sign-in as UX, but each page and API checks again (Next 16 docs:
"Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone").

### 3.5 `x-middleware-subrequest` and other proxy bypasses

- CVE-2025-29927 (forged `x-middleware-subrequest` skipped middleware) is fixed in the pinned Next 16.4.6. It doesn't
  matter for us by design, because the proxy does no authorization (3.3, 3.4). T1 proves both.
- The proxy's matcher has **no** `missing`/`has` header conditions (the docs' example skips requests with
  `next-router-prefetch` / `purpose: prefetch`; a client can send those headers, so the CSP and the session refresh
  would be skipped by a client-chosen header). See section 6.4.
- If the app is ever deployed behind a CDN/reverse proxy, that layer must strip `x-middleware-subrequest` from incoming
  requests (deploy note for the person when a host is chosen).

### 3.6 Sign-out (AC8 decision)

- "Sign out" calls `supabase.auth.signOut()` (default scope `global`: all of the user's refresh tokens are revoked at
  the Auth server), then clears the `sb-*` cookies (the SSR package does this through `setAll`; if the revoke call
  fails, cookies are still cleared and the user still sees the sign-in screen). If done server-side, it is a POST
  under the CSRF rule (section 5).
- **Decision on a captured access token:**
  - Against **the app's API and pages**: it must stop working **immediately** at sign-out. Because handlers use
    `getUser()` (3.3), the replayed pre-sign-out cookie gets 401 (AC8). qa-test asserts it.
  - The **refresh token** must stop working immediately (revoked). qa-test asserts that a refresh with the old refresh
    token fails.
  - Against **Supabase REST directly** (PostgREST with the anon key + the old access token): it **may live until it
    expires** (`jwt_expiry = 3600`, max 1 hour). PostgREST checks only the JWT signature and expiry. Accepted residual
    risk for the pilot (the attacker already needs the stolen token; RLS still limits it to the victim's own rows).
    qa-test does not assert either way. A later task may add a session-exists check in RLS if the person wants it.
- After sign-out, Back/reload must not show cached to-dos: all authenticated HTML and API responses carry
  `Cache-Control: private, no-store` (Next's dynamic default `private, no-cache, no-store, max-age=0, must-revalidate`
  is fine; qa-test asserts `no-store` is present), and the list page re-checks the session on `pageshow` with
  `event.persisted` (back-forward cache) and reloads/redirects.

---

## 4. Row 9 decision: the Supabase burst caveat

### 4.1 Finding

Supabase's "Rate limits" guide (read 2026-11-25): IP-limited Auth endpoints use a **token bucket**; "most buckets hold
up to 30 requests", so an idle client can burst up to 30 requests; the configured rate is the **refill** speed.
Verification requests (`/auth/v1/verify`): "Defaults to 30 requests per 5 minutes, with bursts up to 30 requests".
Only anonymous sign-ins have a bucket equal to the configured limit. The page does not say that lowering the rate also
lowers the burst.

So with our production setting "token verifications 5 per 5 minutes", the likely behavior is: **up to ~30 rapid wrong
guesses from one IP before the first 429**, then about **1 guess per minute**. 2b item 22's pass rule ("429 at or
before attempt 6") will then **fail**, and row 9's baseline proof ("rate limit before 10 attempts") cannot be met by
Supabase's per-IP limiter alone.

The "360 per hour" figure: the guide states the verify default as 30 per 5 minutes (= 360 per hour). The unit of the
Management API's numeric `rate_limit_*` fields is **not stated** in the guide, so it is unverified. The person reads
and sets the value in the dashboard (Authentication > Rate Limits) only, where the unit is shown; agents don't use the
Management API.

### 4.2 What the numbers mean (6-digit code, 900 s expiry)

Per code (lives 900 s) per IP: ≤ 30 (burst) + 15 (refill, 1/min) = **45 guesses**, success chance 45 / 10^6 =
**4.5 × 10^-5**. Sustained per IP per day: ~30 + 1,440 guesses ≈ **1.5 × 10^-3** per targeted account per day (a new
code needs a code request, limited to one per 60 s per address and emailed to the victim each time). With N attacker
IPs it scales linearly: 100 IPs ≈ 14 % per account per day if sustained.

Important: **the attacker never needs our server.** The anon key is public, so `/auth/v1/verify` can always be called
directly. An app-level limiter (own counter, own verify endpoint) would be bypassed and adds nothing; the controls
that count are Supabase's: per-IP bucket, code length, expiry, resend interval, project email budget, and CAPTCHA on
code **requests** (Turnstile is checked when a code is requested, not on verify, so it raises the cost per code, not
per guess).

### 4.3 Who calls Supabase Auth: the browser (decision)

| Option | Effect on per-IP limits | Other effects | Decision |
|--------|------------------------|---------------|----------|
| **Browser calls `signInWithOtp` / `verifyOtp` directly** | Limits apply to each real client IP | Cookies not HttpOnly (3.2); CSP `connect-src` must allow the Supabase origin (already does) | **Chosen** |
| Server (route handler / Server Action) calls Auth with the anon key | All users share **the server's** bucket: 30 wrong guesses by anyone lock everyone out of sign-in (DoS), and the attacker still has the direct path | HttpOnly cookies possible | Rejected |
| Server calls Auth with `Sb-Forwarded-For` | Per-client limits restored | Needs a **secret API key** (`sb_secret_*`; the legacy anon/service_role keys are not accepted), a new server env var, and the dashboard forwarding toggle. If the host doesn't overwrite `X-Forwarded-For`, an attacker rotates fake IPs **through our server** and gets a fresh 30-guess bucket per fake IP: worse than today. Host not chosen yet. | Rejected for task 3; revisit only with a chosen host that guarantees the client IP |

Consequence for operators: do **not** turn on IP forwarding in the dashboard, and no secret API key is created for this
task. Session refresh in `proxy.ts` still calls `/auth/v1/token` from the server IP (150 per 5 min, burst 30, shared by
all users; roughly one refresh per active user per hour). Fine for the pilot; noted for scale (P3).

### 4.4 Row 9 requirements for task 3 (nothing weakened)

1. Keep all 2b values: `token_verifications = 5`, `sign_in_sign_ups = 10`, `otp_length = 6`, `otp_expiry = 900`,
   `max_frequency = "60s"`; S5/S8/S9 stay green (AC32a).
2. Browser-direct auth calls (4.3); no own verify path (AC32).
3. Keep 2b item 22's **target** ("429 at or before attempt 6"), but change its procedure so it measures the burst
   instead of stopping at 10: **P1-revised** below. Release stays blocked unless it passes or the person records a
   decision (below).
4. Turnstile (task 3b) is on in production before real users (already AC46).

### 4.5 Blocking pre-release items for the person (agents never touch production)

These extend AC46 (no real users until done). Record each result in `tasks/decisions.md`.

- **P1-revised (replaces the 10-attempt loop of 2b item 22).** After the first production deploy and after the rate
  limit is set to 5 per 5 minutes: from one machine, send **35** wrong-code `POST /auth/v1/verify` requests back to back
  (same command as `specs/2b/security-gate.md` P1, loop to 35, anon key only in a shell variable). Record every status
  code. Then wait 65 seconds and send 2 more; record both.
  - **Pass:** first 429 at or before attempt 6, every later attempt 429, never a 200. Row 9 proven as designed.
  - **Burst-bound (expected):** first 429 between attempts 7 and 31, every later one 429, never a 200; after the
    65 s wait, at most 1 non-429 then 429. Row 9 is **not** proven to the baseline rule. Release stays blocked until
    the person records **one** of:
    (a) Supabase (support / plan setting) lowers the verify burst and a re-run passes; or
    (b) **raise `otp_length` to 8** (dashboard + `config.toml` + S8 + the AC texts "6-digit"), which brings the per-code
        chance to 4.5 × 10^-7 per IP (100× lower) and keeps code entry simple; security's recommendation; or
    (c) an explicit risk acceptance with the numbers from 4.2 (the person only; security does not accept it).
  - **Fail:** no 429 by attempt 31, or any 200 → stop, row 9 FAIL in production, tell security.
- **P2 (server-side `getUser()` not rate limited).** After the first production deploy and before real users: one
  signed-in test user does 60 to-do API calls (list/toggle) within 3 minutes through the deployed app. Pass: no 401
  and no 429. Fail → tell security; the fix is a design change (not raising limits).
- **P3 (info, not blocking now):** server-side refresh shares one bucket; revisit if active users approach ~1,000/hour.
- **Also blocking (already in AC46):** item 1 (custom SMTP; the built-in mailer's 2 emails/hour also makes sign-in
  unusable), item 21 (site URL / redirect URLs when a host exists), item 9 + task 3b (Turnstile), and the production
  email templates show `{{ .Token }}` (Q4b). Do not enable Auth IP forwarding.

**Proposal for `rules/security-baseline.md` (the person decides; security doesn't edit rulebooks):** row 9's proof
"hits the rate limit before 10 attempts" isn't achievable with a provider that allows a fixed burst of 30. Proposed
wording: "per-IP verify limit configured and measured in production (first 429 and refill rate recorded), and the code
space is large enough that burst + refill over the code's lifetime gives < 10^-4 success per code per IP".
(6 digits: 4.5 × 10^-5, meets it; the open question is the distributed case, hence (b).)

---

## 5. CSRF (cookie-authenticated mutations): decision

Decision: **Origin check on the server is the control**; `SameSite=Lax` and the JSON content type are defense in
depth, not relied on alone.

- Every state-changing route handler (`POST`, `PUT`, `PATCH`, `DELETE`) and the server sign-out (if any):
  1. The `Origin` header must be present and its host must equal the request's `Host` header (same comparison Next
     uses for Server Actions; behind a host that sets `X-Forwarded-Host`, use that one, decided when a host exists).
     Missing, `null`, or different → **403** (error format), before reading the body and before any DB call.
  2. `Content-Type` must be `application/json` (parameters like `; charset=utf-8` allowed) → otherwise **415**. This
     forces a CORS preflight for any cross-site fetch, which fails because the API sends no
     `Access-Control-Allow-*` headers (never add CORS headers).
- `GET` never changes state.
- If Server Actions are chosen (Q2): Next's built-in Origin/Host check is the control; `serverActions.allowedOrigins`
  stays unset (no extra origins). Each action still calls `getUser()` and validates with zod.
- Abuse tests (qa-test, `tests/abuse/**`):
  - **C1:** create/change/delete with A's valid cookies and `Origin: https://evil.example` → 403, DB unchanged.
  - **C2:** same with no `Origin` header → 403; with `Origin: null` → 403.
  - **C3:** same-origin request with `Content-Type: text/plain` and a JSON body → 415, DB unchanged.
  - **C4:** the session cookie has `SameSite=Lax` (and `Secure` in the HTTPS case, unit test from 3.2).
  - **C5:** a post-login return path of `https://evil.example`, `//evil.example`, `/\evil.example` lands on the app's
    list page (only if frontend-dev adds a return path).

---

## 6. Nonce-based CSP (replaces the fixed CSP from 2b)

### 6.1 File and placement

- Next 16 renamed `middleware.ts` to **`proxy.ts`** (`middleware` is deprecated; docs: "The `middleware` file convention
  is deprecated and has been renamed to `proxy`"). Use **`proxy.ts`** at the repo root, exporting `function proxy`.
  It runs on the Node.js runtime by default; don't export a `runtime` config (it throws).
- The `Content-Security-Policy` entry is **removed** from `next.config.ts` `headers()` (devops-cicd). The other five
  2b headers stay there **unchanged**, on `source: "/(.*)"`: `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`. Exactly one CSP header per response.
- The CSP string is built by a pure function in `lib/server/csp.ts` (backend-dev), e.g.
  `buildCsp(nonce: string, opts: { isDev: boolean; supabaseUrl: string | undefined }): string`, reusing 2b's
  `supabaseOrigin()` logic unchanged (origin only, http/https only, otherwise omitted). qa-test unit-tests it (H-tests
  move from `next.config` to this function).

### 6.2 Nonce

- Generated in `proxy.ts`, **per request**, from **16 bytes** of `crypto.getRandomValues` (Web Crypto, CSPRNG),
  encoded as standard **base64** (24 chars, `A-Za-z0-9+/=`), e.g.
  `Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")`. Not `Math.random`, not a counter, not
  derived from time or the request. (Next extracts it with `/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/` from `script-src`.)
- The proxy sets the CSP on **both** the forwarded request headers (`Content-Security-Policy`, so Next's renderer
  reads the nonce and stamps it on its scripts) and the response. It also sets request header `x-nonce` (only for code
  that needs it, e.g. `next/script`). The proxy **overwrites** any incoming `Content-Security-Policy` / `x-nonce`
  request header (`requestHeaders.set`, never `append`), so a client can't choose the nonce.
- Never cache, log, or reuse a nonce.

### 6.3 Exact header values

`<NONCE>` = the per-request nonce; `<origin>` = origin of `NEXT_PUBLIC_SUPABASE_URL` (omitted, with its leading
space, if unset or not http/https). Directives in this order, joined by `"; "`.

**Production (`next build` + `next start`, `NODE_ENV=production`; also the e2e build):**

```
default-src 'self'; script-src 'self' 'nonce-<NONCE>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' <origin>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**Development (`next dev`, `NODE_ENV=development`):** identical except `script-src` ends with `'unsafe-eval'`:

```
default-src 'self'; script-src 'self' 'nonce-<NONCE>' 'strict-dynamic' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' <origin>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

| Directive | Value | Reason / change from 2b |
|-----------|-------|------------------------|
| `script-src` | `'self' 'nonce-<NONCE>' 'strict-dynamic'` | **No `'unsafe-inline'`** in any environment (AC35). `'strict-dynamic'` lets nonce'd Next scripts load their chunks; CSP3 browsers then ignore `'self'`/host lists. No `https:`, `*`, `data:`, hosts. |
| `script-src` dev only | `+ 'unsafe-eval'` | React dev debugging (Next docs); never in a production build. |
| `style-src` | `'self' 'unsafe-inline'` (unchanged) | **Decision: keep.** A nonce in `style-src` makes browsers ignore `'unsafe-inline'`, which blocks React `style={...}` attributes (nonces don't apply to attributes) and risks breaking `next/font`/framework styles. CSS injection needs an HTML injection first, which React escaping + the script nonce already block. Revisit (e.g. `style-src-elem` nonce + `style-src-attr 'unsafe-inline'`) in a later hardening task. |
| `connect-src` | `'self' <origin>` (unchanged logic) | Browser calls `<origin>/auth/v1/*` (sign-in, refresh). No `wss:` (no Realtime). Turnstile (3b) adds what it needs then. |
| others | unchanged from 2b | `default-src 'self'`, `img-src 'self' blob: data:`, `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` |

Still deliberately absent: `upgrade-insecure-requests` (breaks local `http://127.0.0.1:55421`; HSTS covers HTTPS),
`report-uri`/`report-to` (no endpoint; not required for task 3), `require-trusted-types-for` (later hardening).
Task 3b (Turnstile) will add `https://challenges.cloudflare.com` to `frame-src` (new directive) and load the script
via `next/script` with the nonce; security specifies it in 3b.

`NEXT_PUBLIC_SUPABASE_URL` must be set when `next build` runs (Next may inline `NEXT_PUBLIC_*` at build time, also in
server code); if it isn't, `connect-src` is `'self'` only and sign-in fails closed (visible, nothing widened).

### 6.4 Matcher

```ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- Covers every page, every `/api/**` route (AC35 needs the CSP on an API response; the session refresh also helps),
  404s and public files. No `missing`/`has` conditions (3.5). Don't add `api` to the exclusion.
- `_next/static` / `_next/image` responses get the five `next.config` headers but no CSP; that's fine (CSP governs
  documents). This changes 2b's "CSP on every path" to "CSP on every non-static path"; qa-test updates the header test.
- The proxy's Supabase refresh (`createServerClient` + `getClaims()`) must return the response object its `setAll`
  built last, **with** the CSP response header and the modified request headers (`NextResponse.next({ request: { headers: requestHeaders } })`
  every time it is recreated), and copy the cache headers `setAll` passes. Losing either the cookies or the CSP
  header on a refresh is a bug (qa-test: AC35 run with an expired access token).

### 6.5 Static rendering and `cacheComponents: true` (requirement)

Next 16 docs: "you **must use dynamic rendering to add nonces**"; "Static pages are generated at build time, when no
request or response headers exist—so no nonce can be injected"; and "**Partial Prerendering (PPR) is incompatible** with
nonce-based CSP since static shell scripts won't have access to the nonce". `cacheComponents: true` makes PPR the
default App Router behavior (a build-time static shell for every route), and `partialPrefetching` only works with it.

**Requirement (fail closed):** no HTML response may be served from a build-time prerender or static shell. Every page,
including the 404 / not-found page, is rendered per request so all of its `<script>` tags carry that request's nonce.

**Recommended way (security's pick; devops-cicd owns `next.config.*`, frontend-dev owns `app/**`):**
1. `next.config.ts`: set `cacheComponents: false` and remove `partialPrefetching` (it requires cacheComponents).
2. Root layout (`app/layout.tsx`) is made dynamic, e.g. `await connection()` from `next/server` (or reading
   `headers()`), so every route under it, including not-found, renders per request.
3. `next build` output lists no static (`○`) or partial-prerender (`◐`) HTML routes; qa-test or devops-cicd records
   the route table in the Handoff.

An alternative that keeps `cacheComponents: true` is allowed **only** if it passes the same behavioral checks below;
backend-dev must show it in the Handoff with the route table. Note for the person: the docs say both features "will be
enabled everywhere in the next major release, and the options will be removed", so the next Next.js major needs a CSP
re-design (nonce vs. experimental SRI/hash CSP). Proposed lesson (orchestrator files it): "nonce CSP conflicts with
cacheComponents/PPR; flag at framework upgrade".

Performance cost (per Next docs): no static/CDN caching of pages. Acceptable for the pilot; also required anyway
because pages are per-user. HTML with a nonce must never be stored by a shared cache (`no-store`, 3.6).

### 6.6 CSP tests (qa-test; AC35-AC37 plus)

- **N1 (unit, `buildCsp`):** production and dev strings equal 6.3 exactly for a fixed test nonce and
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421`; `script-src` has no `'unsafe-inline'`; production has no
  `'unsafe-eval'`; H5/H6 (unset / malicious URL) behave as in 2b.
- **N2 (unit, nonce):** 1,000 generated nonces are unique, each matches `^[A-Za-z0-9+/]{22}==$` (16 bytes).
- **N3 (`next.config`):** no `Content-Security-Policy` in `headers()`; the five other headers equal 2b A2 exactly.
- **N4 (live, production build):** AC35 paths each have exactly one CSP header; two requests → different nonces; the
  nonce in the header equals the `nonce` attribute on **every** `<script>` in the HTML (no script without it);
  a request carrying its own `Content-Security-Policy: script-src 'nonce-AAAA'` request header still gets a fresh,
  different nonce.
- **N5:** AC36 (no CSP violations, hydration works, Supabase calls allowed) and AC37 (injected script blocked, event fires).
- **N6:** HTML and API responses have `Cache-Control` containing `no-store`.

---

## 7. Other risks considered

| Risk | Decision |
|------|----------|
| Email bombing one address | 60 s per address (`max_frequency`), 10 code requests / 5 min per IP; Turnstile (3b) before real users |
| Exhausting the project's email budget (30/h with SMTP; 2/h built-in) → nobody can sign in | Residual DoS; Turnstile (3b) is the mitigation; item 1 before real users |
| To-do spam by a signed-in user (DB growth) | Not a baseline row; no per-user cap in task 3 (pilot). Residual, noted. Title ≤ 200 and body ≤ 10 KB bound each request. |
| Error leakage | Error format only; no stack, SQL, constraint names, ids of others (brief) |
| Logging secrets | No logging of cookies, tokens, codes, `Authorization`, request bodies with emails |
| Open redirect | No magic link; return-path rule in 3.1 and test C5 |
| Clickjacking | Unchanged 2b (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) |

## 8. RLS sign-off (db-architect's `specs/3/schema.md`)

**Result: matches.** Checked against `specs/3/schema.md` (appeared while this model was being written):

1. `public.todos`: `id uuid` default `gen_random_uuid()` (not countable), `user_id uuid not null default auth.uid()`
   FK `auth.users(id) on delete cascade`, `done boolean not null default false`, `created_at`/`updated_at` not
   client-settable. OK (rows 2, 8).
2. Title: `todos_title_trimmed` (`title = btrim(title, <JS trim() whitespace set>)`) plus `todos_title_length`
   (`char_length(title) between 1 and 200`). Stricter than the single `char_length(btrim(title))` check (that one
   accepts untrimmed huge values and tab/newline-only titles); the DB set equals JS `trim()`, so API and DB agree.
   **Accepted**; backend-dev must trim with `String.prototype.trim()` / zod `.trim()` (same set). (Row 5, AC19.)
3. RLS enabled; four policies `to authenticated`, `using ((select auth.uid()) = user_id)`, insert and update
   `with check` the same; no `anon` policy. Not forced: agreed (owner `postgres` has BYPASSRLS, FORCE would be a
   no-op; no security definer function touches the table). (Rows 2, 14.)
4. Grants: `revoke all ... from anon, authenticated`, then `select, delete` + `insert (title)` +
   `update (title, done)` to `authenticated`; nothing to `anon`; no service-role data grant. Column grants are a
   second mass-assignment layer below the API whitelist. (Rows 8, 14, L14, AC40.)
5. Trigger function `todos_set_updated_at`: `security invoker`, `set search_path = ''`, EXECUTE revoked from
   public/anon/authenticated (2a rule). OK.
6. pgTAP plan covers RLS, A-vs-B, anon, CHECK boundaries, grants. qa-test/db-builder keep it.

No changes needed. If schema.md changes after this date, security re-checks this section at the gate.

---

## 9. Handoff notes for builders

**backend-dev**
- `proxy.ts` (not `middleware.ts`), function `proxy`, matcher exactly as 6.4, no `runtime` export. It does: nonce (6.2)
  → CSP via `lib/server/csp.ts` (6.3) on request and response → Supabase SSR session refresh with `getClaims()` →
  returns the last `setAll` response carrying the CSP header, cookies, and cache headers. It does **not** authorize.
- Every to-do entry point: Origin check + content type (5) → `getUser()` (3.3) → zod strict (row 5) → query with the
  user's server client (anon key + cookies, RLS on) → 404 for 0 rows. No service role. No identity from headers.
- Sign-out per 3.6. No auth verify endpoint of your own (4.3).
- Propose the Q2 style and error format in the brief's Handoff; all of this holds for either.

**frontend-dev**
- Browser client (`createBrowserClient`) does `signInWithOtp` (`shouldCreateUser: true`) and `verifyOtp`
  (`type: "email"`) directly (4.3). Cookie options per 3.2 (shared helper with the server client).
- Titles only as text children / input `value` (row 11). No `dangerouslySetInnerHTML`, no inline `<script>`; any
  `next/script` gets the nonce from `x-nonce`.
- Root layout dynamic (6.5 step 2); list page `getUser()` + redirect (3.4); `pageshow` re-check (3.6). Return path rule
  (3.1) if you add one.

**devops-cicd**
- `next.config.ts`: remove the CSP entry, keep the five headers byte-for-byte; `cacheComponents: false`, remove
  `partialPrefetching` (6.5) unless backend-dev proves the alternative. `supabase/config.toml` auth values stay as 2b
  (4.4). No IP-forwarding, no secret key, no new secret env var.
- Carry **P1-revised** (replacing item 22's 10-attempt loop) and **P2** into the production checklist / release notes
  for the person (4.5).

**qa-test**
- Tests T1-T6, C1-C5, N1-N6 above, in addition to the brief's ACs; map them in `specs/3/test-plan.md`.
- AC8: assert app API 401 and refresh-token failure after sign-out; do **not** assert direct-PostgREST behavior (3.6).
- AC31 stays non-proof (L21). Keep live auth tests under the local limits even though the local stack doesn't enforce
  them (production will).
- No keys in files, traces, or reports (row 13).

**db-architect / db-builder**: section 8 (matches; no changes). Row 5 note for backend-dev: trim with JS `trim()` so API and DB whitespace sets agree.

**The person (blocking before real users):** P1-revised and its decision (a)/(b)/(c) (security recommends (b), 8-digit
codes), P2, items 1, 9 (+ task 3b), 21, email templates with `{{ .Token }}`, IP forwarding left off. Also decide the
baseline row 9 wording proposal (4.5).

# Task 2b: Security headers in next.config + auth defaults in supabase/config.toml

| Field | Value |
|-------|-------|
| State | VERIFYING (the person: dashboard items 1-21, item 22 before any real user) |
| Owner role | devops-cicd (`next.config.*` headers block, `supabase/config.toml`, production dashboard checklist); qa-test (`tests/integration/**`, `specs/2b/test-plan.md`) |
| Branch | `sec/2b-headers-auth-defaults` |
| Worktree | `../wt-2b-devops-cicd` |
| Depends on | 0 (Phase 0). Independent of 2a (task 2 was split by path ownership). |

The person's request (relayed by the orchestrator; task 2 was split into 2a = part (a) and 2b = parts (b), (c)):

> "TASK 2: security groundwork, before any login feature. (a) a migration revoking EXECUTE on future functions in public from PUBLIC, anon and authenticated (alter default privileges), with a pgTAP test; (b) security headers in next.config (CSP, X-Frame-Options/frame-ancestors, Referrer-Policy, X-Content-Type-Options, Permissions-Policy), plus a test that checks them; (c) auth defaults in supabase/config.toml for local and CI: minimum password length 10+, email confirmations on, rate limits, OTP expiry. Also a written checklist (in the brief's handoff) of the matching settings the person must set in the Supabase dashboard for production, because the dashboard isn't managed by migrations (custom SMTP, rate limits, CAPTCHA)."

## Goal

Before any login feature exists, every response of the Next.js app carries the security headers that security
specifies, the local and CI auth service enforces safe defaults (password length, email confirmation, rate limits,
OTP expiry), and the person has a written checklist to set the same auth settings in the Supabase dashboard for
production.

## Acceptance criteria

**Headers (part b)**

- [ ] AC1: `specs/2b/threat-model.md` (security) gives the exact value of each header: `Content-Security-Policy`, frame protection (`X-Frame-Options` and/or CSP `frame-ancestors`, as security decides), `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`. devops-cicd copies those values into the headers block of `next.config.ts`, unchanged; the existing options in that file (`cacheComponents`, `partialPrefetching`) stay as they are.
- [ ] AC2: Given the app, when `/` and at least one other path (listed in `specs/2b/test-plan.md`) are requested, then each response carries all six headers with exactly the values in the threat model. The test lives in `tests/integration/**` and runs in `npm test`.
- [ ] AC3 (unhappy path): Given a response where any one of the six headers is missing or has a different value, when the test runs, then it fails and names the header. qa-test shows this once (for example a red run with one header removed locally, not committed) and records it in the Handoff.
- [ ] AC4: `npm run build` still succeeds and `/` still renders with the headers on (the CSP doesn't block the app's own scripts or styles; no CSP violation in the browser console on `/`).

**Auth defaults for local and CI (part c)**, in `supabase/config.toml` (values from security's threat model unless the request fixes them):

- [ ] AC5: `[auth]` `minimum_password_length` is 10 or more (currently `6`). `password_requirements` (currently `""`) is set as security decides.
- [ ] AC6 (unhappy path): Given the local stack (`npx supabase start`), when a user signs up with a 9-character password, then local auth rejects it with an error and no user is created; a password of the minimum length is accepted.
- [ ] AC7: `[auth.email]` `enable_confirmations` is `true` (currently `false`). Given a new email signup on the local stack, when that user tries to sign in before confirming, then sign-in is refused.
- [ ] AC8: `[auth.rate_limit]` keys (`email_sent`, `sms_sent`, `anonymous_users`, `token_refresh`, `sign_in_sign_ups`, `token_verifications`, `web3`) and `[auth.email]` `otp_expiry` (currently `3600`) and `max_frequency` (currently `"1s"`) are set to the values in the threat model. security states for row 9 which limit makes OTP guessing hit the rate limit before 10 attempts.
- [ ] AC9: `npx supabase start` and `npx supabase db reset` still work with the changed config.toml; no secret value appears in config.toml (secrets only as `env(NAME)` references, and no new env var unless listed in the Handoff for the person).

**Production checklist and gates**

- [ ] AC10: devops-cicd writes, in this brief's **Handoff**, a checklist of the Supabase dashboard settings the person must set for production, one line per setting: what it controls, the value (matching config.toml or explicitly saying why production differs), and where in the dashboard (described, not invented). It covers at least: custom SMTP, every auth rate limit from AC8, CAPTCHA, minimum password length / requirements, email confirmations, OTP expiry and resend interval. No secret values in it. Agents don't apply any of it (AGENT_RULES §4).
- [ ] AC11: `specs/2b/test-plan.md` maps AC2, AC3, AC6, AC7 and each applicable security row to a test file, test name and level.
- [ ] AC12: `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` passes; security gate PASS; review APPROVE; CI green.

## Security rows that apply

Security confirms and fills in the abuse tests during Design.

- [ ] Row 9 (guess the login code): rate limits, OTP expiry, CAPTCHA (production checklist); abuse test: (security fills in)
- [ ] Row 11 (XSS): Content-Security-Policy header; abuse test: (security fills in)
- [ ] Row 1 (`/admin`) / login in general: flagged only; password length and email confirmation are auth controls. Security decides whether it applies here.

## Scope

**Allowed paths**

```
next.config.*          # security headers block only (devops-cicd)
supabase/config.toml   # devops-cicd
tests/integration/**   # qa-test: headers test, local auth tests
specs/2b/**            # threat-model.md + security-gate.md (security), test-plan.md (qa-test), review.md (code-reviewer)
```

**Out of scope:**
- Login, signup or any other UI; API routes; `middleware.ts` (backend-dev).
- Tables, migrations, DB tests (task 2a covers function privileges).
- New dependencies, tools or services (including a test library, an SMTP or CAPTCHA provider): propose in the Handoff, the person approves (AGENT_RULES §8).
- `scripts/**`, `.github/workflows/**`, `package.json` (not in this task's allowed paths).
- Production: no dashboard changes by agents; the person applies the checklist from AC10.

## Inputs

- Spec files: `specs/2b/threat-model.md` (security: header values, auth values), `specs/2b/test-plan.md` (qa-test)
- Other: `supabase/config.toml` (current `[auth]`, `[auth.rate_limit]`, `[auth.email]`, commented `[auth.captcha]` and `[auth.email.smtp]`, `[local_smtp]` sections); `next.config.ts`; `rules/security-baseline.md` rows 9, 11; `rules/database-and-deploy.md` ("Auth emails, rate limits, CAPTCHA" row: Supabase dashboard, custom SMTP mandatory for real users); `roles/devops-cicd.md` (headers content comes from security).

## Destructive change?

- [x] No (config and headers only; no data, no drop/rename).
- [ ] Yes: step 1 (stop using it) is task ___; step 2 (drop) is this task. Backup step: ___. Person approved on: ___

## Questions for the person

1. **CSP: static or nonce-based?** The request puts the CSP in `next.config`, which gives one fixed header for all responses. A nonce-based CSP (often needed to avoid `'unsafe-inline'` for scripts with the App Router) would need `middleware.ts`, which belongs to backend-dev and is outside this task. Is a static CSP in `next.config` what you want now (security picks the strictest value that still lets the app run), with a nonce-based CSP as a later task if security asks for it?
2. **CAPTCHA and SMTP providers.** The checklist needs a CAPTCHA provider (config.toml lists `hcaptcha` and `turnstile`) and a custom SMTP provider for production. Both are new services (PROJECT_CONTEXT: no new paid services without approval). Which ones do you want, or should the checklist leave them as "to be chosen by the person"? Locally, should CAPTCHA stay off (it's commented out in config.toml now)?

---


### Answers from the person (2026-11-25, recorded in tasks/decisions.md on the 2a branch)

- Q1: global revoke of EXECUTE on functions created by role `postgres` in **any schema**, from `PUBLIC`, `anon` and `authenticated` (no `IN SCHEMA`). Every function migration grants explicitly. ACs 1-3 apply to `public` and, through the global default, to every schema.
- Q2: role `postgres` only.
- Q3: a fixed CSP in `next.config` now; a nonce CSP with middleware in task 3.
- Q4: CAPTCHA off locally and in CI; Cloudflare Turnstile and the person's SMTP choice go on the production dashboard checklist (the person applies them).
- Auth checks in 2b: a static vitest test that parses `supabase/config.toml`, plus one manual live check on the local stack recorded in the Handoff (verify.sh runs tests before the DB starts; fixed separately in task 2c).

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/2b/TASK_BRIEF.md`, `tasks/board.md` (row 2b added).
- **Verified:** read the current `supabase/config.toml` (key names cited above exist there), `next.config.ts`, `package.json` scripts, and `scripts/verify.sh` section 5/6 order.
- **Left to do:** person answers the Questions; security writes `specs/2b/threat-model.md` (header values, auth values, row 9 limit); qa-test writes `specs/2b/test-plan.md`; orchestrator sets SPEC_READY.
- **Next role must know:**
  - `scripts/verify.sh` runs `npm test` (section 5) before it starts the local database (section 6), and no `tests/` folder or `vitest.config.*` exists yet. AC6/AC7 need the local auth service running, and AC2 may need the app served. If qa-test can't make these tests deterministic inside `npm test` in CI with the current pipeline, set BLOCKED with a handoff to devops-cicd (`scripts/**`, `.github/workflows/**` and `vitest.config.*` are outside this task's allowed paths; framework files need the person's `framework-change-approved` label).
  - With `enable_confirmations = true`, local signup tests need the confirmation email from the local mail server (`[local_smtp]`, enabled) or another way qa-test documents; no real email is sent.
  - The local and test values for the Supabase URL and anon key come from `npx supabase status`; no env var for them is listed in PROJECT_CONTEXT for tests, so don't invent one (propose it in the Handoff).

### devops-cicd, 2026-11-25

- **Changed:**
  - `next.config.ts`: added the `isDev` / `supabaseOrigin()` / `contentSecurityPolicy` code from threat model A1 verbatim, and an `async headers()` returning one rule `source: "/(.*)"` with the six headers of A1/A2 (CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, `Strict-Transport-Security`). `cacheComponents: true` and `partialPrefetching: true` unchanged. Note: the brief says "five headers"; security's spec has six (adds HSTS). I copied the spec (six).
  - `supabase/config.toml`: exactly nine value lines changed, nothing else (comments, ports 55420-55429, other sections untouched; `[auth.sms] enable_confirmations` stays `false`): `[auth]` `minimum_password_length = 12`, `password_requirements = "letters_digits"`; `[auth.rate_limit]` `email_sent = 30`, `sign_in_sign_ups = 10`, `token_verifications = 5`; `[auth.email]` `enable_confirmations = true`, `secure_password_change = true`, `max_frequency = "60s"`, `otp_expiry = 900`. All "keep" values from section B already matched. `[auth.captcha]` and `[auth.email.smtp]` stay commented. No secret, no new env var.
- **Verified:**
  - `npm run typecheck`, `npm run lint`, `npm run build`: pass.
  - Production server (`npm run build && npx next start -p 3100`): `/` (200), `/does-not-exist` (404) and `/next.svg` all carry the headers. Lines from `curl -sI` (build without `NEXT_PUBLIC_SUPABASE_URL`):
    ```
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    X-Content-Type-Options: nosniff
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
    Strict-Transport-Security: max-age=63072000; includeSubDomains
    ```
    With `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421` set **at build time**, the CSP has `connect-src 'self' http://127.0.0.1:55421`. **Important:** the header values are fixed at `next build`; setting the env var only at `next start` does not change them (observed). So production builds must have `NEXT_PUBLIC_SUPABASE_URL` set at build time, or Supabase calls are blocked by `connect-src` (fails closed, as specified).
  - Local stack: `npx --no-install supabase stop` + `start` (under the shared lock); the auth container came up healthy and its environment shows the new values (`GOTRUE_PASSWORD_MIN_LENGTH=12`, `GOTRUE_MAILER_AUTOCONFIRM=false`, `GOTRUE_MAILER_OTP_EXP=900`, `GOTRUE_SMTP_MAX_FREQUENCY=1m0s`, `GOTRUE_RATE_LIMIT_VERIFY=5`, `GOTRUE_RATE_LIMIT_OTP=10` (the CLI's mapping of `sign_in_sign_ups`), `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`).
  - Threat model Question 1 (`email_sent` locally): observed `GOTRUE_RATE_LIMIT_EMAIL_SENT=360000` in the local auth container, i.e. the CLI does **not** apply `email_sent = 30` without `[auth.email.smtp]` enabled. Don't assert email-send limiting behavior locally.
  - `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (with DB): `verify.sh: PASS 18/18 (1 skipped)` (skipped: test:e2e, no script). `supabase db reset` / migrations apply / `supabase test db` pass with the new config.
  - Not done by me: the browser-console CSP check on `/` (H8/AC4), the live L1 check, AC6/AC7 live checks: qa-test.
- **Production dashboard checklist (AC10). The person applies this in the Supabase dashboard; agents never do (AGENT_RULES §4). No secrets here: credentials and the CAPTCHA secret are typed into the dashboard only.** Locations below are described from the Supabase dashboard's Authentication section as I know it; they were not checked against the live dashboard by an agent, so if a name differs, look in the Authentication settings for the setting with that meaning. If the dashboard shows a rate in a different unit, convert so the rate is the same (e.g. 10 per 5 min = 120 per hour).
  1. [ ] **Custom SMTP** (sends auth emails from your own provider; required before real users, the built-in mailer is for testing only). Value: enabled, your chosen provider, sender address on your own domain. Where: Authentication, email / SMTP settings. Do this first: the email rate limit can only be set after it.
  2. [ ] **Rate limit, emails sent**: 30 per hour. Where: Authentication, Rate Limits. (Matches config.toml `email_sent = 30`.)
  3. [ ] **Rate limit, SMS sent**: 30 per hour (inert, phone provider off). Where: Authentication, Rate Limits.
  4. [ ] **Rate limit, anonymous sign-ins**: 30 per hour per IP (inert, anonymous sign-ins off). Where: Authentication, Rate Limits.
  5. [ ] **Rate limit, token refreshes**: 150 per 5 min per IP. Where: Authentication, Rate Limits.
  6. [ ] **Rate limit, sign-ups and sign-ins**: 10 per 5 min per IP (password guessing / signup spam). Where: Authentication, Rate Limits.
  7. [ ] **Rate limit, token verifications (OTP / magic link)**: 5 per 5 min per IP (row 9: the 6th code guess is refused). Where: Authentication, Rate Limits.
  8. [ ] **Rate limit, Web3 sign-ins**: 30 per 5 min per IP (inert). Where: Authentication, Rate Limits.
  9. [ ] **CAPTCHA**: enabled, provider Cloudflare Turnstile, secret entered in the dashboard only. Where: Authentication, attack protection / bot protection settings. **Turn on only together with task 3's login form that sends the Turnstile token**; earlier, every signup and sign-in fails. Off locally and in CI (config.toml `[auth.captcha]` stays commented).
  10. [ ] **Minimum password length**: 12. Where: Authentication, email provider / password settings.
  11. [ ] **Password requirements**: letters and digits. Where: same place as the minimum length.
  12. [ ] **Leaked-password protection**: on, if your plan offers it (dashboard-only, no config.toml key). Where: Authentication, password / attack protection settings.
  13. [ ] **Confirm email**: on. Where: Authentication, email provider settings.
  14. [ ] **Secure password change**: on (a stolen session can't change the password without a recent login). Where: Authentication, email provider settings.
  15. [ ] **Email OTP expiration**: 900 seconds (15 minutes). Where: Authentication, email provider settings.
  16. [ ] **Email OTP length**: 6. Where: Authentication, email provider settings.
  17. [ ] **Minimum interval between emails per user**: 60 seconds (stops email bombing). Where: Auth settings (email / SMTP area; exact page not verified).
  18. [ ] **Anonymous sign-ins**: off. Where: Authentication, sign-in / user signup settings.
  19. [ ] **Manual linking**: off. Where: Authentication, sign-in / user signup settings.
  20. [ ] **Phone provider**: off. Where: Authentication, providers.
  21. [ ] **Site URL and redirect URLs**: exact production URL(s) only, no wildcards (prevents open redirects carrying auth tokens). Where: Authentication, URL configuration. Set once the production URL is decided (PROJECT_CONTEXT: not decided yet).
  - Also for production builds: `NEXT_PUBLIC_SUPABASE_URL` must be set in the hosting provider's **build** environment (see Verified), otherwise the CSP blocks Supabase calls.
- **Left to do / next role must know (qa-test):**
  - Header test (H1-H7, static, import `next.config.ts` and call `headers()`): one rule `source: "/(.*)"` with exactly these six keys and values: `Content-Security-Policy` (A1 string; with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421` and `NODE_ENV` not `development`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://127.0.0.1:55421; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`. The CSP is computed at module load, so stub env and re-import the module (`vi.resetModules()`) for H4-H6.
  - Config test (S1-S12) keys and expected values: `[auth]` `minimum_password_length = 12`, `password_requirements = "letters_digits"`, `enable_anonymous_sign_ins = false`; `[auth.rate_limit]` `email_sent = 30`, `sms_sent = 30`, `anonymous_users = 30`, `token_refresh = 150`, `sign_in_sign_ups = 10`, `token_verifications = 5`, `web3 = 30`; `[auth.email]` `enable_confirmations = true`, `double_confirm_changes = true`, `secure_password_change = true`, `max_frequency = "60s"`, `otp_length = 6`, `otp_expiry = 900`; `[auth.sms]` `enabled = false` (note `[auth.sms]` also has `enable_confirmations = false`: parse by section); no active `[auth.captcha]`.
  - The one manual live check, **L1 (OTP brute force)**: with the local stack running, send 10 `POST <API URL>/auth/v1/verify` (header `apikey: <anon key>` from `npx supabase status`, never written down) with body `{"type":"email","email":"<test address>","token":"<wrong 6 digits>"}`; expect `429` at or before attempt 6 and on every later attempt, never a session. Record each status code. Under the shared lock if you start/stop the stack. Rate limits are per 5 min per IP on the shared stack: L1 plus AC6/AC7 checks can trip `sign_in_sign_ups = 10` / `token_verifications = 5`; wait out the window, never raise the limits.
  - H8/AC4: browser console on `/` with a production build, no CSP violation (not checked by me).

### qa-test, 2026-11-25

- **Added (commit 54f3c9e):**
  - `specs/2b/test-plan.md`: maps AC1-AC12 and rows 9, 11 (plus 3, 13 watch rows) to test file + test name + level, or to a manual check.
  - `tests/integration/security-headers.test.ts` (23 tests): H1-H6 against the real `next.config.ts` `headers()` output, plus AC1 (existing options unchanged). Env is stubbed with `vi.stubEnv` and the module re-imported after `vi.resetModules()`. Exact strings for all six headers; dev-only `'unsafe-eval'` (absent for `production` and `test`); `connect-src 'self'` when `NEXT_PUBLIC_SUPABASE_URL` is unset or empty, `'self' http://127.0.0.1:55421` when set; a URL with path, query and `; script-src *` yields the origin only; `javascript:`, `ftp:`, `data:` and a non-URL fail closed to `'self'`. One test per header, so a failure names the header.
  - `tests/integration/auth-config.test.ts` (21 tests): S1-S12 against `supabase/config.toml` with a small section-aware parser inside the test (no new dependency; it throws on any line it can't parse, so a format change is noticed). Includes parser self-tests (`[auth.email]` vs `[auth.sms]` `enable_confirmations`) and the "no literal secrets" check: every `secret` / `pass` / `password` / `auth_token` / `*_key` / `*_secret` / `*_token` assignment, active **or commented**, is `""` or `"env(NAME)"`; no JWT-like or `sb_secret_`/`sb_publishable_` string in the file.
- **Results:** `npm test`: 2 files, 44/44 pass. `npm run typecheck`: pass. `npm run lint`: pass. `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (under the shared lock, after the test commit): `verify.sh: PASS 18/18 (1 skipped)` (skipped: test:e2e, no script).
- **Red run (AC3 / H7), not committed:** ran the committed header test against a temporary copy of `next.config.ts` (in the session scratchpad, outside the repo) through a temporary copy of the test file that only changed the import path; both copies deleted afterwards, `git status` clean of them, `next.config.ts` never touched.
  - `X-Content-Type-Options` removed: `Tests 3 failed | 20 passed (23)`; failures: `H1: exactly one rule covers all paths and it carries exactly the six headers`, `H2: X-Content-Type-Options equals "nosniff" exactly` (`AssertionError: X-Content-Type-Options header: expected undefined to be 'nosniff'`), `H4: ...` (`X-Content-Type-Options header (dev): expected undefined to be 'nosniff'`).
  - `Referrer-Policy` changed to `no-referrer`: `Tests 2 failed | 21 passed (23)`; `AssertionError: Referrer-Policy header: expected 'no-referrer' to be 'strict-origin-when-cross-origin'`.
  - Then the committed tests: 44/44 green.
- **H8 / AC2 live / AC4 (manual, done):** `npm run build` passes; `npx next start -p 3127` (built without `NEXT_PUBLIC_SUPABASE_URL`). `curl -sI`: `/` 200 and `/does-not-exist` 404 both carry all six headers with the threat-model values (`connect-src 'self'`). Browser (Claude desktop Browser pane, Chromium 156) on `/`: page renders and hydrates (`self.__next_f` present, fonts loaded), **no console messages on load, so no CSP violation**. Enforcement confirmed: a probe `fetch('http://127.0.0.1:9/probe')` from the page raised a `connect-src` violation in the console. (An `eval` probe run through the browser tool's devtools channel gave inconsistent results (`new Function` blocked once, allowed once), so it's not used as evidence; the static H3/H4 tests cover `'unsafe-eval'`.) Server stopped afterwards.
- **Manual live checks, local stack (under the shared lock; auth container `gotrue:v2.198.0` started 15:06 UTC with this branch's config: `GOTRUE_PASSWORD_MIN_LENGTH=12`, `GOTRUE_MAILER_AUTOCONFIRM=false`, `GOTRUE_RATE_LIMIT_VERIFY=5`; key kept in a shell variable only):**
  - **AC6: PASS.** `POST /auth/v1/signup` with a 9-char password (`abcdefg12`): `422`, `error_code: weak_password`, reasons `["length"]`; 11 chars: same `422`; `auth.users` count for that email after both: `0`. 12 chars without a digit: `422 weak_password` reasons `["characters"]` (letters_digits works). Exactly 12 chars with letters and digits: `200`, user created (count 1), unconfirmed.
  - **AC7: PASS.** Signup with a valid password: `200`; `POST /auth/v1/token?grant_type=password` before confirming: `400`, `error_code: email_not_confirmed`, no `access_token`; DB shows `email_confirmed_at` and `last_sign_in_at` null.
  - **L1 (row 9): FAIL.** 10 wrong-OTP `POST /auth/v1/verify` (`{"type":"email","email":"qa-l1@example.test","token":"000000"}`): attempts 1-10 all `403 otp_expired`, **no 429**, never a session. Repeated with an existing unconfirmed user (the AC7 address): again 10 x `403 otp_expired`, no 429, no session. The auth container has `GOTRUE_RATE_LIMIT_VERIFY=5` but no `GOTRUE_RATE_LIMIT_HEADER`; my unverified understanding is that GoTrue applies its per-IP limits only when a rate-limit header is configured (the hosted platform sets one), so the local stack doesn't enforce `token_verifications` at all. Spacing: AC6/AC7 used 8 sign-up/sign-in requests (< 10) before L1, so they were not affected by any limit.
  - **Owner of the L1 failure: security** (decide whether row 9 can be proven locally at all, or whether S5 + the production checklist + a post-deploy check on production replace L1) with **devops-cicd** if a config change is wanted. Not fixed by me (outside my paths); limits not raised. Recorded as lesson L21.
- **Five vs six headers (for product-spec):** AC2/AC3 say "five headers"; the threat model A2 has six (adds `Strict-Transport-Security`). Tests check all six. Please update the AC wording.
- **Not covered:** `email_sent` behavior locally (devops-cicd observed the CLI doesn't apply it without SMTP; not asserted); production dashboard values (AC10, the person applies them; nothing automated checks production); no automated live auth tests until task 2c decides how `npm test` gets a stack.
- **Test users left on the local stack:** `qa-ac6-1795619325@example.test`, `qa-ac6b-*@example.test`, `qa-ac7-1795619325@example.test` (unconfirmed; gone at the next `db reset`).

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25

- AC2/AC3 wording changed from "five" to "six headers" (review finding 2; the threat model adds HSTS). Done by the orchestrator in tasks/ so the gates stay valid; product-spec owns the wording if it wants to change it.
- **Dashboard checklist item 22 (required, from the security gate P1):** after the first production deploy, after applying the rate-limit item and before any real user: (1) confirm Authentication > Rate Limits shows token verifications 5 per 5 minutes; (2) from one machine send 10 `POST https://<project-ref>.supabase.co/auth/v1/verify` with header `apikey: <publishable/anon key>` (shell variable only, never written down) and body `{"type":"email","email":"<own test address>","token":"000000"}` (ready loop in `specs/2b/security-gate.md`); (3) pass = 429 at or before attempt 6 and on every attempt after it, never a 200; no 429 by attempt 9 = stop, no real users, tell security; (4) record the ten status codes and the date in `tasks/decisions.md`. Task 3's login isn't released to real users until this passes.
- Merged main (PR #8, PR #9) into this branch. This branch's lesson renumbered L17 → L21; added L22 (a catch-up merge makes gates stale).
- The person's task 2 answers are in `tasks/decisions.md` on the 2a branch (PR for 2a); this brief quotes them.

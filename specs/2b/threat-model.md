# Task 2b threat model: security headers + local/CI auth defaults

Author: security (Design), 2026-11-25. Fresh context. Inputs: `tasks/2b/TASK_BRIEF.md` (with the person's answers),
`tasks/decisions.md` (Task 2 entry, on the 2a branch), `supabase/config.toml`, `next.config.ts`, `app/layout.tsx`,
`app/page.tsx`, `package.json`, `rules/security-baseline.md`, `rules/database-and-deploy.md`, `specs/1/security-gate.md`.
No Supabase cloud or production access was used.

Person's answers that bind this model: **Q3** fixed CSP in `next.config` now, nonce CSP with middleware in task 3.
**Q4** CAPTCHA off locally and in CI; Cloudflare Turnstile and the person's SMTP choice go on the production
dashboard checklist. **Auth checks:** a static vitest test that parses `supabase/config.toml`, plus one manual live
check on the local stack recorded in the Handoff.

## Assets

| Asset | Who may access it |
|-------|-------------------|
| User accounts and sessions (Supabase Auth, local stack now; production later) | Each user their own; nobody guesses passwords or email OTP/confirmation tokens |
| Email OTP / confirmation / recovery tokens | Only the mailbox owner, for `otp_expiry` seconds |
| The app's pages and future to-do data rendered in them | The signed-in owner; no injected script runs in the page; no framing by other sites |
| Email-sending reputation (SMTP) | Not abusable for spam or email bombing (send limits) |

No tables, routes, env vars (beyond the existing `NEXT_PUBLIC_SUPABASE_URL`), uploads or AI tools are added.

## Baseline rows

| # | Applies? | Required control | Owner | Abuse test |
|---|----------|------------------|-------|------------|
| 9 Guess the login code | **Yes** | `supabase/config.toml` values in section B (rate limits, OTP expiry, resend interval, password policy, confirmations); production dashboard checklist in section C (incl. Turnstile CAPTCHA, custom SMTP) | security (values), devops-cicd (config.toml, checklist) | qa-test: static test S1-S12 (section D) + the manual live check L1 |
| 11 XSS | **Yes** (header part) | Headers in section A, copied unchanged into `next.config.ts`; existing verify.sh check bans `dangerouslySetInnerHTML` without sanitizing | security (values), devops-cicd (next.config) | qa-test: header test H1-H8 (section D) |
| 1 `/admin` | **Partly** | No routes or roles exist yet, so route authorization is N/A in this task. Password length and email confirmation are auth hardening covered under row 9. Row 1 proper (server-side role checks) is task 3's. | security | none in this task (covered by S1-S4) |
| 3 Key in the browser | Not changed, but watched | Only `NEXT_PUBLIC_SUPABASE_URL` (a public value) is read in `next.config.ts`; no secret may be interpolated into a header | devops-cicd | H6 (connect-src holds only the URL's origin) |
| 13 `.env` in Git | Not changed, but watched | `config.toml` holds no secret values; secrets only as `env(NAME)` | devops-cicd | S12 |
| 2, 5, 8, 14 | Not changed by this task | No tables, inputs, roles or DB objects touched | per baseline | none in this task |
| 4, 6, 7, 10, 12 | **N/A (confirmed)** | `PROJECT_CONTEXT.md`: no prices (4), no payments (6), no single-use items (7), no AI/LLM (10), no uploads (12). Confirmed for the pilot scope; a brief that adds one reopens the row. | security | none |

---

## A. Headers (row 11): exact values for `next.config.ts`

devops-cicd adds an `async headers()` to the existing config object (keep `cacheComponents: true` and
`partialPrefetching: true` as they are) returning **one** rule with `source: "/(.*)"` (all paths, including `/`,
404s and `/_next/static/*`) and the headers below. Copy the values character for character; qa-test's test compares
exact strings.

### A1. Content-Security-Policy

Build it in `next.config.ts` exactly like this (the logic is part of the spec, not only the string):

```ts
const isDev = process.env.NODE_ENV === "development";

// Origin only (scheme://host:port); anything else fails closed to "'self'" only.
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

const sb = supabaseOrigin();
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${sb ? ` ${sb}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
```

Resulting value (production build, `NODE_ENV=production`; `<origin>` = origin of `NEXT_PUBLIC_SUPABASE_URL`):

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' <origin>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Why each directive:

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Fallback for everything not listed (frames, workers, media, manifest) |
| `script-src` | `'self' 'unsafe-inline'` | **`'unsafe-inline'` is needed for now:** without a per-request nonce, the App Router's inline bootstrap and RSC payload scripts (`self.__next_f.push(...)`) are blocked and the page doesn't hydrate. No host allowlist, no `https:`, no `*`. |
| `script-src` (dev only) | adds `'unsafe-eval'` | **Dev only** (`next dev`, `NODE_ENV=development`): React's dev build uses `eval` for debugging/HMR. Never in a production build; H3 checks this. |
| `style-src` | `'self' 'unsafe-inline'` | React/Next inject inline `style` attributes and `<style>` tags (incl. `next/font` CSS variables). Lower risk than scripts. |
| `img-src` | `'self' blob: data:` | Local images (`/next.svg`, `/vercel.svg`) and Next's inline placeholders |
| `font-src` | `'self'` | `next/font/google` (Geist in `app/layout.tsx`) self-hosts the fonts at build time; no Google host needed |
| `connect-src` | `'self'` + origin of `NEXT_PUBLIC_SUPABASE_URL` | supabase-js `fetch`es to `<url>/auth/v1` and `/rest/v1`. Never a literal project ref in the file; only the env var. If the var is unset or not an http(s) URL, only `'self'` (fails closed: Supabase calls break visibly, nothing is widened). Realtime (`wss:`) is **not** allowed; the task that first uses Realtime adds the `wss://` origin and security signs it off. `'self'` covers Next's same-origin dev HMR connection in current browsers; if the dev overlay shows a CSP violation for the HMR socket, report it to security, don't add `ws:` or `*` yourself. |
| `object-src` | `'none'` | No plugins/`<object>`/`<embed>` |
| `base-uri` | `'self'` | Stops `<base href>` injection redirecting relative script URLs |
| `form-action` | `'self'` | Injected forms can't post credentials to another origin |
| `frame-ancestors` | `'none'` | Clickjacking: no site (including ours) may frame the app |

Deliberately **not** included now: `upgrade-insecure-requests` (it would upgrade the local `http://127.0.0.1:55421`
Supabase calls in a local `next start` and break them; HSTS covers HTTPS in production), `report-uri`/`report-to`
(no reporting endpoint exists), `strict-dynamic`.

**What tightens in task 3 (nonce CSP in `middleware.ts`, owner backend-dev, values from security):**
`script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` and **no** `'unsafe-inline'` for scripts (kept only as a
fallback that CSP3 browsers ignore when a nonce is present); the fixed CSP in `next.config` is then removed or
replaced so there is exactly one CSP header. `style-src 'unsafe-inline'` is reviewed then (may stay). When the
Turnstile widget is added (task 3), `script-src` and `frame-src` need `https://challenges.cloudflare.com`, and a
`frame-src` directive appears; security specifies it then.

### A2. Other headers

| Header | Exact value | Reason |
|--------|-------------|--------|
| `X-Frame-Options` | `DENY` | Clickjacking protection for browsers that ignore `frame-ancestors` (same intent) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Cross-origin requests get the origin only, so `?code=` / tokens in auth callback URLs don't leak to other sites. Not `no-referrer`: that makes browsers send `Origin: null` on same-origin form posts, which breaks Next's server-action origin check for progressive-enhancement forms. |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing of responses into script/HTML |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | The app uses none of these; denies them to the page and any frame. (No `interest-cohort`: deprecated, causes console warnings.) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Forces HTTPS on the production host for 2 years. Browsers ignore it over plain HTTP, so local `http://127.0.0.1:3000` is unaffected. No `preload` (that's a separate, hard-to-undo decision for the person once the production domain is chosen). |

Headers are set for every path; none is conditional except the dev-only `'unsafe-eval'` and the Supabase origin.

---

## B. `supabase/config.toml` values for local and CI (row 9)

Only keys that exist in the file today are listed. Values marked "keep" don't change but are pinned by the test.

### `[auth]`

| Key | Current | Required | Reason |
|-----|---------|----------|--------|
| `minimum_password_length` | `6` | `12` | Person asked for 10+; 12 adds margin against online guessing and credential stuffing without hurting UX. AC6: 9 and 11 characters rejected, 12 accepted. |
| `password_requirements` | `""` | `"letters_digits"` | One of the three values the file lists. Blocks all-letter and all-digit passwords (dictionary words, PINs) without forcing symbol rules that push users to predictable patterns. |
| `enable_signup` | `true` | keep `true` | The app needs signup |
| `enable_anonymous_sign_ins` | `false` | keep `false` | No anonymous users in scope |
| `enable_manual_linking` | `false` | keep `false` | Not needed |
| `enable_refresh_token_rotation` | `true` | keep `true` | A stolen refresh token is usable once |
| `refresh_token_reuse_interval` | `10` | keep `10` | Default grace for concurrent tabs |
| `jwt_expiry` | `3600` | keep `3600` | 1 hour access tokens |

### `[auth.rate_limit]` (all seven keys in the file)

| Key | Current | Required | Unit (from the file's comments) | Reason |
|-----|---------|----------|------|--------|
| `email_sent` | `2` | `30` | per hour | Matches the production value with custom SMTP (section C). The file's comment says it "requires auth.email.smtp to be enabled", which is off locally (local mail server instead), so locally it may not be enforced; qa-test must not rely on it (see Questions). |
| `sms_sent` | `30` | keep `30` | per hour | Inert: `[auth.sms] enabled = false`. Pinned so it isn't raised silently. |
| `anonymous_users` | `30` | keep `30` | per hour per IP | Inert: anonymous sign-ins are off |
| `token_refresh` | `150` | keep `150` | per 5 min per IP | Refresh tokens aren't guessable; a low value breaks multi-tab use |
| `sign_in_sign_ups` | `30` | `10` | per 5 min per IP | Password guessing / signup spam: max 10 tries per 5 min per IP (120/hour). With 12-character passwords and CAPTCHA in production this is enough; normal users never hit it. |
| `token_verifications` | `30` | `5` | per 5 min per IP | **This is the limit that stops OTP guessing before 10 attempts:** OTP / magic-link / confirmation-token verifications are limited to 5 per 5 minutes per IP, so the 6th guess is refused (HTTP 429). |
| `web3` | `30` | keep `30` | per 5 min per IP | Inert: no Web3 provider enabled |

Note for qa-test: `sign_in_sign_ups = 10` and `token_verifications = 5` apply to the local stack too (all requests
come from one IP). Create fixture users through a path that doesn't consume these limits where possible, and keep each
test file's sign-in/verify calls under the limits, or wait out the 5-minute window; never raise the limits for tests.

### `[auth.email]`

| Key | Current | Required | Reason |
|-----|---------|----------|--------|
| `enable_confirmations` | `false` | `true` | Person's request. Stops signups with someone else's address being usable; AC7. Local confirmation mails go to the local mail server (`[local_smtp] enabled = true`). |
| `double_confirm_changes` | `true` | keep `true` | Email change confirmed on old and new address (account takeover) |
| `secure_password_change` | `false` | `true` | A stolen session can't change the password without a recent login |
| `max_frequency` | `"1s"` | `"60s"` | Minimum time between signup-confirmation / reset emails to one address: stops email bombing and token-spraying. Matches the production setting. |
| `otp_length` | `6` | keep `6` | With `token_verifications = 5` per 5 min and a 15-minute expiry, one IP gets at most 15 guesses per token (15 in 1,000,000). |
| `otp_expiry` | `3600` | `900` | 15 minutes: shortens the guessing window and the life of a leaked email link |

Commented `require_current_password` stays commented (not part of the requested defaults; revisit in task 3 with the
password-change UI).

### `[auth.captcha]`

Stays **commented out** (CAPTCHA off locally and in CI, person's Q4). No `secret` value may ever be written in the
file; when enabled anywhere it must be `env(NAME)` and the name proposed to the person.

### `[auth.email.smtp]`

Stays commented out locally (the local mail server is used). Production SMTP is set in the dashboard only.

### Not in `config.toml` (stated explicitly, not invented)

- **Account lockout** (lock an account after N wrong passwords): no key exists in `config.toml`. Per-IP limits
  above and CAPTCHA in production are the controls now. Whether per-account lockout is needed is a question for task 3.
- **Leaked-password protection**: no key in the file; dashboard-only (section C).
- `[auth.sessions]` `timebox` / `inactivity_timeout` exist only as comments; leave them commented in this task.

---

## C. Production dashboard checklist (the person sets these; agents never do; values only, no secrets)

devops-cicd copies this into the brief's Handoff (AC10) and adds the dashboard location for each, described from
the dashboard, not invented. Units: if the dashboard shows a different unit than below, convert so the rate is the
same and note it.

| Setting | Production value | Note |
|---------|------------------|------|
| Custom SMTP | Enabled, with the person's chosen provider; sender on the person's own domain | **Required before real users** (built-in mailer is for testing only). Credentials entered in the dashboard only. |
| Rate limit: emails sent | 30 per hour | Settable after custom SMTP is on |
| Rate limit: SMS sent | 30 per hour | Inert (phone provider off) |
| Rate limit: anonymous sign-ins | 30 per hour per IP | Inert (anonymous sign-ins off) |
| Rate limit: token refreshes | 150 per 5 min per IP | |
| Rate limit: sign-ups and sign-ins | 10 per 5 min per IP | |
| Rate limit: token verifications (OTP / magic link) | 5 per 5 min per IP | Row 9 control |
| Rate limit: Web3 sign-ins | 30 per 5 min per IP | Inert |
| CAPTCHA | Enabled, provider Cloudflare Turnstile, secret entered in the dashboard only | **Enable only together with task 3's login form that sends the Turnstile token**; enabling it earlier makes every signup/sign-in fail. The Turnstile site key reaches the app later as a `NEXT_PUBLIC_*` env var whose name task 3 proposes. |
| Minimum password length | 12 | |
| Password requirements | Letters and digits | |
| Leaked-password protection | On, if the plan offers it | Dashboard-only feature |
| Confirm email | On | |
| Secure password change | On | |
| Email OTP expiration | 900 seconds | |
| Email OTP length | 6 | |
| Minimum interval between emails per user | 60 seconds | |
| Anonymous sign-ins | Off | |
| Manual linking | Off | |
| Phone provider | Off | |
| Site URL and redirect URLs | Exact production URL(s) only, no wildcards | Set when the production URL is decided (PROJECT_CONTEXT: not decided yet). Prevents open redirects with auth tokens. |

---

## D. Abuse tests (qa-test)

### Header test (row 11), `tests/integration/**`, runs in `npm test`

Static, deterministic, no server needed: import `next.config.ts`, call `headers()`, find the rule with
`source: "/(.*)"`.

- **H1:** exactly one rule covers all paths (`/(.*)`), and it contains all six headers of section A.
- **H2:** with `NODE_ENV` not `development` and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421` (the local API port
  from `config.toml`, a test value), `Content-Security-Policy` equals the production string in A1 with
  `<origin>` = `http://127.0.0.1:55421`, and every other header equals A2 exactly.
- **H3:** in that production value, `script-src` has **no** `'unsafe-eval'`, and no directive contains `*`, `https:`,
  `http:` or `data:` as a script source; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'` are present.
- **H4:** with `NODE_ENV=development` (re-import the module after stubbing the env), `script-src` is
  `'self' 'unsafe-inline' 'unsafe-eval'` and nothing else differs.
- **H5:** with `NEXT_PUBLIC_SUPABASE_URL` unset, `connect-src` is exactly `'self'`.
- **H6:** with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421/rest/v1?x=1; script-src *`, `connect-src` is
  `'self' http://127.0.0.1:55421` (origin only; no path, no injected directive); with `javascript:alert(1)` it is
  `'self'`.
- **H7 (AC3, red run):** removing or changing any one header makes the test fail and name that header (shown once
  locally, not committed; recorded in the Handoff).
- **H8 (AC2/AC4, live):** after `npm run build` and `npm run start`, `/` and one more path from the test plan (e.g. a
  404 path) return all six headers with the A1/A2 values, and the browser console on `/` shows no CSP violation.
  qa-test records this in the Handoff if it can't run inside `npm test` (verify.sh doesn't serve the app).

Not in this task: the row 11 render test (username `<script>` / `<img onerror>` renders as text) needs the first UI
that renders user content (task 3). verify.sh's existing `dangerouslySetInnerHTML` check stays.

### Static config test (row 9), `tests/integration/**`, runs in `npm test`

Parses `supabase/config.toml` by section. No TOML parser is in `package.json`; qa-test either writes a minimal
section-aware parser inside the test (no dependency) or proposes one to the person (AGENT_RULES §8). Assert:

- **S1:** `[auth] minimum_password_length` is `12` (and `>= 10`).
- **S2:** `[auth] password_requirements` is `"letters_digits"`.
- **S3:** `[auth.email] enable_confirmations` is `true`.
- **S4:** `[auth.email] secure_password_change` is `true`; `double_confirm_changes` is `true`.
- **S5:** `[auth.rate_limit] token_verifications` is `5` (and `< 10`: the row 9 proof that guessing hits the limit
  before 10 attempts).
- **S6:** `[auth.rate_limit] sign_in_sign_ups` is `10`.
- **S7:** `[auth.rate_limit] email_sent` `30`, `sms_sent` `30`, `anonymous_users` `30`, `token_refresh` `150`,
  `web3` `30`.
- **S8:** `[auth.email] otp_expiry` is `900` (and `<= 900`); `otp_length` is `6`.
- **S9:** `[auth.email] max_frequency` is `"60s"`.
- **S10:** `[auth] enable_anonymous_sign_ins` is `false`; `[auth.sms] enabled` is `false`.
- **S11:** no active `[auth.captcha]` section (CAPTCHA off locally/CI per the person); if a future change enables it,
  its `secret` is an `env(...)` reference.
- **S12:** no line in the file assigns a literal secret: every `secret`, `pass`, `auth_token`, `*_key` value is
  `""` or `env(NAME)`.

### Manual live check (row 9), once, local stack, recorded in the Handoff

**L1, OTP brute force:** with `npx supabase start` running (the API URL and anon key come from `npx supabase status`;
don't paste the key into any file or the Handoff), send 10 `POST <API URL>/auth/v1/verify` requests with header
`apikey: <anon key>` and body `{"type":"email","email":"<a test address>","token":"<wrong 6 digits>"}`, one after
another. Expected: an HTTP `429` (rate limited) at or before the 6th request, and every later request also `429`;
never a session. Record the status code of each attempt in the Handoff. If the first 429 comes after attempt 9, row 9
FAILs.

Recommended in the same session (they are acceptance criteria, not extra rows): AC6 (9-character password rejected,
12-character accepted) and AC7 (unconfirmed user can't sign in), each with its observed result.

## Auth rules

No routes or roles yet. Sessions: Supabase defaults with rotation (section B). Route and role rules arrive in task 3.

## Questions

1. **`email_sent` locally:** the file's comment says the limit requires `[auth.email.smtp]` to be enabled; locally the
   local mail server is used instead. Is it enforced locally? It doesn't change the value (30); qa-test must not
   assert behavior from it. devops-cicd/qa-test note what they observe.
2. **Rate limits in CI:** all local requests share one IP, so `sign_in_sign_ups = 10` / `token_verifications = 5`
   per 5 minutes constrain future live auth tests (task 2c makes the DB available to tests). If that makes tests
   flaky, qa-test reports it; the limits are not raised without security and the person agreeing.
3. **Per-account lockout:** not configurable in `config.toml`; decide in task 3 whether it's needed beyond per-IP
   limits and CAPTCHA.
4. **HSTS `preload` and `upgrade-insecure-requests`:** left out until the production domain and hosting are decided
   (person).

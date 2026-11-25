Result: PASS

# Task 2b security gate: security headers + local/CI auth defaults

Author: security (Gate), 2026-11-25; re-gated after the main merge (HEAD `fc61959`), see the last section. Fresh
context, judged from the repo only. Branch `sec/2b-headers-auth-defaults`,
diff `git diff origin/main...HEAD` (origin/main fetched first). No Supabase cloud or production access was used.

PASS carries **one required post-deploy item (P1, below)** that the person must do before any real user signs in.
Row 9 rests on it. P1 is now dashboard checklist item 22 in `tasks/2b/TASK_BRIEF.md` (orchestrator note).

## Summary

| Row | Control (file:line) | Abuse test (test name) | Result |
|-----|---------------------|------------------------|--------|
| 9 Guess the login code | `supabase/config.toml:214` `token_verifications = 5`; `:212` `sign_in_sign_ups = 10`; `:243` `otp_expiry = 900`; `:241` `otp_length = 6`; `:239` `max_frequency = "60s"`; `:187` `minimum_password_length = 12`; `:190` `password_requirements = "letters_digits"`; `:232` `enable_confirmations = true`; `:234` `secure_password_change = true`; `:204-216` all seven rate limits; `:219` `[auth.captcha]` stays commented; production: dashboard checklist in `tasks/2b/TASK_BRIEF.md` (devops-cicd Handoff, items 1-21, plus item 22 = P1 in the orchestrator note) | `tests/integration/auth-config.test.ts`: `S1` ... `S11` (S5: `[auth.rate_limit] token_verifications is 5 (< 10: ...)`); manual live checks AC6, AC7, L1 | **PASS with accepted local limitation** (static S1-S11 pass; AC6 and AC7 pass live; L1 can't be enforced by the local stack, see the L1 decision; P1 required post-deploy) |
| 11 XSS / clickjacking (header part) | `next.config.ts:4` (`isDev`), `:7-16` (`supabaseOrigin()`), `:18-30` (CSP builder), `:36-56` (`headers()`, one rule `source: "/(.*)"`, six headers at `:41-52`) | `tests/integration/security-headers.test.ts`: `H1: exactly one rule covers all paths and it carries exactly the six headers`, `H1/AC2: the all-paths rule source matches %s`, `H2: Content-Security-Policy (production, local API URL) equals the threat model string exactly`, `H2: %s equals %j exactly`, `H3: production CSP has no 'unsafe-eval', ...`, `H4: with NODE_ENV=development only script-src changes, ...`, `H4: 'unsafe-eval' is absent when NODE_ENV=%s`, `H5` (unset, empty), `H6` (origin only; fail closed for `javascript:`, `ftp:`, `data:`, non-URL); H7 red run and H8 live/browser check in the qa-test Handoff | **PASS** |
| 3 Key in the browser (watch) | `next.config.ts:8` reads only `NEXT_PUBLIC_SUPABASE_URL` (public); `:12` reduces it to `u.origin` for http/https only | `H6: a URL with a path, query and an injected directive yields the origin only`; `H6: NEXT_PUBLIC_SUPABASE_URL=%j fails closed to connect-src 'self'`; verify.sh `client bundle has no server secrets` | **PASS** |
| 13 `.env` in Git (watch) | `supabase/config.toml`: no literal secret; every secret-like key is `""` or `env(NAME)`; diff adds no secret and no env var | `S12: every secret-like key (secret, pass, auth_token, *_key, ...) is "" or "env(NAME)"`; `S12: no JWT or Supabase API key appears anywhere in the file`; `finds the secret-like keys the file has today (guards the scan itself)`; verify.sh `no .env files tracked`, `basic secret pattern scan on changed files` | **PASS** |
| 1 `/admin` | No routes or roles in this task (threat model: N/A here, task 3) | none required | N/A |
| 4, 6, 7, 10, 12 | N/A per `PROJECT_CONTEXT.md` (threat model) | none | N/A |
| 2, 5, 8, 14 | Not changed (no tables, inputs, roles, DB objects) | none | not affected |

## Checks against the threat model

**`next.config.ts` (row 11):** matches threat model A1 character for character: `isDev` only on
`NODE_ENV === "development"` (`:4`), so `'unsafe-eval'` is dev-only (`:21`); `supabaseOrigin()` returns `""` when the
var is unset/empty (`:9`), on a parse error (`:13-14`) and for any scheme other than `http:`/`https:` (`:12`), and
otherwise only `u.origin` (no path, query or injected `;`), so `connect-src` fails closed to `'self'` (`:25`). The other
five headers (`:42-52`) equal A2 exactly, including HSTS without `preload`. `cacheComponents` and `partialPrefetching`
unchanged (`:34-35`). One rule, `source: "/(.*)"`.

**`supabase/config.toml` (row 9):** `git diff origin/main...HEAD -- supabase/config.toml` changes exactly nine value
lines, all equal to threat model B: `minimum_password_length 6 -> 12`, `password_requirements "" -> "letters_digits"`,
`email_sent 2 -> 30`, `sign_in_sign_ups 30 -> 10`, `token_verifications 30 -> 5`, `enable_confirmations false -> true`
(`[auth.email]`, line 232; `[auth.sms]` line 271 stays `false`), `secure_password_change false -> true`,
`max_frequency "1s" -> "60s"` (`[auth.email]`, line 239; the `[auth.sms]`/MFA `5s` lines untouched), `otp_expiry 3600 -> 900`.
All "keep" values match. No comment, port, section or other key changed. `[auth.captcha]` and `[auth.email.smtp]` stay
commented. No secret, no new env var.

**Tests are not tautologies:**
- The header test imports the real `next.config.ts` (`../../next.config`), stubs `NODE_ENV` / `NEXT_PUBLIC_SUPABASE_URL`
  and re-imports after `vi.resetModules()`, then calls the real `headers()`. Expected values are hard-coded literals
  from A1/A2 (`PROD_CSP_LOCAL_API`, `OTHER_HEADERS`), not derived from the config. qa-test's red run (H7) showed a
  removed `X-Content-Type-Options` and a changed `Referrer-Policy` each fail and name the header.
- The auth test reads the real `supabase/config.toml` from disk with a section-aware parser that throws on any line
  it can't parse; parser self-tests prove `[auth.email]` vs `[auth.sms]` are kept apart. The S12 scan includes
  commented lines and has a guard test that the scan actually finds the file's secret-like keys.

**Dashboard checklist (AC10, devops-cicd Handoff in `tasks/2b/TASK_BRIEF.md`):** complete against threat model C:
all 21 settings are present (custom SMTP first, all seven rate limits, Turnstile CAPTCHA with the "only together with
task 3's login form" warning, password length 12, letters and digits, leaked-password protection, confirm email,
secure password change, OTP expiry 900, OTP length 6, 60 s email interval, anonymous sign-ins off, manual linking off,
phone off, exact site/redirect URLs), plus the build-time `NEXT_PUBLIC_SUPABASE_URL` note. No secret values (credentials
and the Turnstile secret "typed into the dashboard only"). It states that the person applies it and agents never do
(AGENT_RULES §4). The post-deploy proof P1 below is now item 22 (orchestrator note in the brief); checked in the
re-gate section.

## L1 decision (row 9 live check)

**Observed.** qa-test: 10 wrong-OTP `POST /auth/v1/verify` all `403 otp_expired`, no 429, no session (twice).
Security re-ran L1 under the shared lock (2026-11-25, auth container `supabase_auth_AutomationTest`, image
`public.ecr.aws/supabase/gotrue:v2.198.0`, started 15:12 UTC, API `http://127.0.0.1:55421`, key kept in a shell
variable only): attempts 1-10 all `403`, `error_code: otp_expired`, no `access_token`. Two more with
`X-Forwarded-For: 203.0.113.7`: `403`.

**Root cause (confirmed, read-only).** The container runs this branch's values (`GOTRUE_RATE_LIMIT_VERIFY=5`,
`GOTRUE_RATE_LIMIT_OTP=10`, `GOTRUE_MAILER_OTP_EXP=900`, `GOTRUE_PASSWORD_MIN_LENGTH=12`,
`GOTRUE_MAILER_AUTOCONFIRM=false`), so the config reaches the auth server. But there is **no `GOTRUE_RATE_LIMIT_HEADER`**
in its environment. The auth binary contains the setting `RateLimitHeader` and the message "first rate limit header
value is empty, rate limiting is not applied": GoTrue's per-IP limiter keys on that configured header and skips
limiting when it isn't set. The Supabase CLI's local stack doesn't set it and `config.toml` has no key for it; the
hosted platform sets it behind its gateway. So the local stack doesn't enforce `token_verifications` at any value. This
is a property of the local environment, not a defect in 2b's config, and it can't be fixed inside 2b's allowed paths.

**Decision: accepted local limitation, not a FAIL of 2b, with a required production check.** Row 9's control in this
task is the configured value plus the production checklist; both are present and proven (S5, container env). The
threat model's L1 criterion ("429 at or before attempt 6 on the local stack") is amended: locally, L1 is replaced by
S5 + the container-env evidence above; the behavioral proof moves to production as P1. No real user exists yet and no
login UI exists (task 3), so nothing is exposed meanwhile. The person may overrule this and treat it as a FAIL.

### P1: required post-deploy check (the person does this; agents never test production)

When: after the first production deploy **and** after applying checklist item 7 (token verifications = 5 per 5 min),
and before any real user signs up. Task 3 (login) must not be released to real users until P1 is recorded as passing.

1. In the dashboard (Authentication, Rate Limits), confirm token verifications shows 5 per 5 minutes.
2. From one machine, using a test email address you own (no account needed) and the project's **publishable/anon**
   key from the dashboard (keep it in a shell variable; don't paste it into any file or chat):
   ```
   for i in 1 2 3 4 5 6 7 8 9 10; do
     curl -s -o /dev/null -w "attempt $i: %{http_code}\n" -X POST "https://<your-project-ref>.supabase.co/auth/v1/verify" \
       -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
       -d '{"type":"email","email":"<your-test-address>","token":"000000"}'
   done
   ```
3. Pass: a `429` at or before attempt 6 and on every later attempt; never a `200`. Fail: no `429` by attempt 9:
   stop, no real users, tell security (row 9 FAIL in production).
4. Record the ten status codes and the date in `tasks/decisions.md`. Your IP's verification budget is used up for
   about 5 minutes afterwards.

Owners: the person runs P1 (checklist item 22 in `tasks/2b/TASK_BRIEF.md`); devops-cicd carries it into the deploy
runbook when it next touches it.

## Automated results

| Check | Result |
|-------|--------|
| `npm test` | 2 files, 44/44 pass (re-run at `fc61959`) |
| `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (with DB, under the shared lock; re-run at `fc61959` with PR #9's order) | `verify.sh: PASS 18/18 (1 skipped)`; skipped: `test:e2e` (no script). Includes allowed paths, RLS static check, no `.env` tracked, secret pattern scan, client bundle has no server secrets, no unsanitized `dangerouslySetInnerHTML`, migrations apply, `supabase test db` |
| `npm audit --audit-level=high` | 0 vulnerabilities (re-run at `fc61959`) |
| Secret scan | verify.sh basic pattern scan PASS (gitleaks not installed locally; CI runs gitleaks on push). S12 PASS. No secret printed during this gate. |
| Supabase security advisors | Not run: no DB objects changed in 2b and cloud tools are not used by this gate |
| RLS check | verify.sh static RLS check PASS (no tables changed) |

## Manual review of the diff

- New routes / server-side authorization: none added.
- Client-trusted values: none. `NEXT_PUBLIC_SUPABASE_URL` is read at build time in `next.config.ts` and reduced to an
  http(s) origin; a malformed or hostile value can't widen the CSP (H6).
- Raw SQL from strings, `dangerouslySetInnerHTML`, uploads, LLM output: none in the diff.
- New env vars reaching the client: none.
- Tests contain no keys; the only URL is the local API origin (a test value).

## Other findings (not blocking)

1. **"Five headers" wording:** resolved. The orchestrator changed AC2/AC3 to "six headers" (threat model adds HSTS);
   code and tests use six.
2. **Header values are fixed at `next build`** (devops-cicd observed): `NEXT_PUBLIC_SUPABASE_URL` must be in the
   hosting build environment or `connect-src` blocks Supabase (fails closed, as specified). Already on the checklist.
3. **`email_sent` not enforced locally** without `[auth.email.smtp]` (`GOTRUE_RATE_LIMIT_EMAIL_SENT=360000`): expected,
   not asserted by any test; production value is on the checklist.
4. **Future live auth tests (task 2c):** since the local stack doesn't rate-limit at all, automated rate-limit tests
   can't run against it; any such test must target an environment that sets the rate-limit header, or be skipped with
   a reason. Lesson L21 (renumbered from L17 by the merge) records this.
5. 'unsafe-inline' in `script-src` remains a known, accepted gap until the nonce CSP in task 3 (person's Q3).

## Re-gate after main merge

Trigger: the orchestrator merged origin/main into the branch (`fc61959`, PR #8 tasks docs and PR #9 verify.sh reorder)
after the first gate (`4e4be4a`) and the code review (`7e510e5`, APPROVE). Checked at HEAD `fc61959`, origin/main fetched:

- `git diff 4e4be4a HEAD -- next.config.ts supabase/config.toml tests/` is empty: code, config and tests are byte for
  byte what the first gate judged. All row results above stand.
- `git diff origin/main...HEAD` touches only `next.config.ts`, `supabase/config.toml`, `tests/integration/**`
  (2 files), `specs/2b/**` and `tasks/**` (2b brief, board, lessons). verify.sh scope check PASS.
- No conflict markers anywhere in the tree (`git grep` for `<<<<<<<` / `>>>>>>>` / `|||||||` at line start: none).
- AC2/AC3 now say "six headers", matching the threat model and the tests (finding 1 resolved).
- Checklist item 22 (orchestrator note in `tasks/2b/TASK_BRIEF.md`) matches P1: same timing (after first deploy, after
  the rate-limit item, before any real user), same four steps (dashboard shows 5 per 5 min; 10 wrong-OTP verify calls
  with the publishable/anon key in a shell variable only; pass = 429 at or before attempt 6 and on every later attempt,
  never 200; no 429 by attempt 9 = stop and tell security; record the codes and date in `tasks/decisions.md`), and the
  task 3 release block. It holds only placeholders (`<project-ref>`, `<publishable/anon key>`, `<own test address>`):
  no secrets.
- Lessons: L17 renumbered to L21 (references above updated); L22 (catch-up merge makes gates stale) is process only.
- PR #9's `scripts/verify.sh` change only moves the database section before the project checks; no check was added,
  removed or weakened, so it doesn't change this task's security evidence. verify.sh still runs all secret, RLS, XSS,
  scope and bundle checks.
- `npm test` 44/44; `verify.sh: PASS 18/18 (1 skipped)` (test:e2e, no script); `npm audit` 0 vulnerabilities.

Result unchanged: PASS, with P1 (checklist item 22) required post-deploy.

# Task 2b test plan: security headers + local/CI auth defaults

Author: qa-test, 2026-11-25. Inputs: `tasks/2b/TASK_BRIEF.md` (ACs, the person's answers, devops-cicd Handoff),
`specs/2b/threat-model.md` (H1-H8, S1-S12, L1), `next.config.ts`, `supabase/config.toml`.

The person decided (brief, "Answers"): auth checks are a static vitest test that parses `supabase/config.toml`,
plus manual live checks on the local stack recorded in the Handoff (verify.sh runs `npm test` before it starts the
database; task 2c fixes that). Header checks are static (import `next.config.ts`, call `headers()`); the live
header and browser-console check is manual (verify.sh doesn't serve the app).

Files:
- `tests/integration/security-headers.test.ts` (vitest, in `npm test`)
- `tests/integration/auth-config.test.ts` (vitest, in `npm test`)
- Manual: results recorded in the qa-test Handoff of `tasks/2b/TASK_BRIEF.md`.

Paths checked for AC2: `/` and `/does-not-exist` (404). Also `/_next/static/chunks/main.js` and `/next.svg`
(static pattern match only).

**Note on "five headers":** the brief's AC2/AC3 say five headers; the threat model (A2) specifies six (adds
`Strict-Transport-Security`). The tests check all six; product-spec should update the brief's wording.

## Acceptance criteria

| AC | What is checked | Test file | Test name | Level |
|----|-----------------|-----------|-----------|-------|
| AC1 | Header values copied unchanged; `cacheComponents`/`partialPrefetching` stay on | `tests/integration/security-headers.test.ts` | `H2: ...` (all), `AC1: the existing options cacheComponents and partialPrefetching stay on` | integration (static) |
| AC2 | One rule for all paths carries all six headers with exact values; `/` and `/does-not-exist` are covered | `tests/integration/security-headers.test.ts` | `H1: exactly one rule covers all paths ...`, `H1/AC2: the all-paths rule source matches %s`, `H2: Content-Security-Policy ...`, `H2: %s equals %j exactly` | integration (static) |
| AC2 (live) | `curl -sI` on a production build (`next start`) for `/` (200) and `/does-not-exist` (404) shows all six headers | manual | H8 | manual (live) |
| AC3 | A missing or changed header fails the test and names it | `tests/integration/security-headers.test.ts` | per-header `H2: <Header> equals ...` (header name in the test name and the assertion message) | integration; red run shown once, recorded in the Handoff |
| AC4 | `npm run build` passes; `/` renders and hydrates; no CSP violation in the browser console on `/` | `verify.sh` (`npm run build`) + manual | H8 | build + manual (browser) |
| AC5 | `minimum_password_length` >= 10 (12); `password_requirements` set | `tests/integration/auth-config.test.ts` | `S1: ...`, `S2: ...` | integration (static) |
| AC6 | 9-char password signup rejected, no user created; minimum-length password accepted | manual | AC6 live check | manual (local stack) |
| AC7 | `enable_confirmations = true`; unconfirmed user's password sign-in refused | `tests/integration/auth-config.test.ts` + manual | `S3: ...`; AC7 live check | integration (static) + manual (local stack) |
| AC8 | All seven `[auth.rate_limit]` keys, `otp_expiry`, `max_frequency` | `tests/integration/auth-config.test.ts` | `S5`, `S6`, `S7: [auth.rate_limit] %s is %i`, `S8`, `S9` | integration (static) |
| AC9 | No literal secret in config.toml (only `""` or `env(NAME)`); start / db reset still work | `tests/integration/auth-config.test.ts` + `verify.sh` | `S12: ...` (3 tests); verify.sh "all migrations apply to an empty database" | integration (static) + verify.sh |
| AC10 | Production dashboard checklist | n/a (document in the brief, devops-cicd) | review | review |
| AC11 | This file | n/a | n/a | n/a |
| AC12 | verify.sh, security gate, review, CI | `scripts/verify.sh` | n/a | gate |

## Security rows

| Row | Abuse test (threat model) | Test file | Test name | Level |
|-----|---------------------------|-----------|-----------|-------|
| 11 XSS / clickjacking | H1 | `security-headers.test.ts` | `H1: exactly one rule covers all paths and it carries exactly the six headers`; `H1/AC2: ...` | integration (static) |
| 11 | H2 | `security-headers.test.ts` | `H2: Content-Security-Policy (production, local API URL) equals ...`; `H2: %s equals %j exactly` (5 headers) | integration (static) |
| 11 | H3 | `security-headers.test.ts` | `H3: production CSP has no 'unsafe-eval', no wildcard or scheme script sources, and the locking directives` | integration (static) |
| 11 | H4 | `security-headers.test.ts` | `H4: with NODE_ENV=development only script-src changes, adding 'unsafe-eval'`; `H4: 'unsafe-eval' is absent when NODE_ENV=%s` | integration (static) |
| 11 | H5 | `security-headers.test.ts` | `H5: with NEXT_PUBLIC_SUPABASE_URL unset ...`; `H5: ... empty ...` | integration (static) |
| 11, 3 | H6 | `security-headers.test.ts` | `H6: a URL with a path, query and an injected directive yields the origin only`; `H6: NEXT_PUBLIC_SUPABASE_URL=%j fails closed to connect-src 'self'` | integration (static) |
| 11 | H7 (red run) | `security-headers.test.ts` run against a temporary copy of next.config.ts with one header removed / changed | see Handoff | manual red run |
| 11 | H8 | manual | `curl -sI` on `/`, `/does-not-exist`; browser console on `/` | manual (live) |
| 9 Guess the login code | S1-S11 | `auth-config.test.ts` | `S1` ... `S11` (one test each; S7 has 5 cases) | integration (static) |
| 9 | L1 | manual | 10 wrong-OTP `POST /auth/v1/verify`, expect 429 at or before attempt 6 | manual (local stack) |
| 13 `.env` in Git / secrets | S12 | `auth-config.test.ts` | `S12: every secret-like key ... is "" or "env(NAME)"`; `S12: no JWT or Supabase API key appears anywhere in the file`; scan guard `finds the secret-like keys ...` | integration (static) |
| 1 | none in this task (threat model: covered by S1-S4) | - | - | - |

Helper tests in `auth-config.test.ts` (`config.toml parser (test helper)`) prove the in-test parser is
section-aware (`[auth.email]` vs `[auth.sms]` `enable_confirmations`) and handles inline comments.

## Not automated (and why)

- H8 / AC4 browser console and AC6/AC7/L1 live checks: verify.sh runs `npm test` before the local DB/app exist
  (task 2c). They are manual and recorded in the Handoff.
- Local rate limits are per IP on a shared stack; automated live auth tests would be flaky until task 2c decides how
  tests get a stack (threat model Question 2).

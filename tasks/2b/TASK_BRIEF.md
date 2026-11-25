# Task 2b: Security headers in next.config + auth defaults in supabase/config.toml

| Field | Value |
|-------|-------|
| State | BACKLOG |
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
- [ ] AC2: Given the app, when `/` and at least one other path (listed in `specs/2b/test-plan.md`) are requested, then each response carries all five headers with exactly the values in the threat model. The test lives in `tests/integration/**` and runs in `npm test`.
- [ ] AC3 (unhappy path): Given a response where any one of the five headers is missing or has a different value, when the test runs, then it fails and names the header. qa-test shows this once (for example a red run with one header removed locally, not committed) and records it in the Handoff.
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

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/2b/TASK_BRIEF.md`, `tasks/board.md` (row 2b added).
- **Verified:** read the current `supabase/config.toml` (key names cited above exist there), `next.config.ts`, `package.json` scripts, and `scripts/verify.sh` section 5/6 order.
- **Left to do:** person answers the Questions; security writes `specs/2b/threat-model.md` (header values, auth values, row 9 limit); qa-test writes `specs/2b/test-plan.md`; orchestrator sets SPEC_READY.
- **Next role must know:**
  - `scripts/verify.sh` runs `npm test` (section 5) before it starts the local database (section 6), and no `tests/` folder or `vitest.config.*` exists yet. AC6/AC7 need the local auth service running, and AC2 may need the app served. If qa-test can't make these tests deterministic inside `npm test` in CI with the current pipeline, set BLOCKED with a handoff to devops-cicd (`scripts/**`, `.github/workflows/**` and `vitest.config.*` are outside this task's allowed paths; framework files need the person's `framework-change-approved` label).
  - With `enable_confirmations = true`, local signup tests need the confirmation email from the local mail server (`[local_smtp]`, enabled) or another way qa-test documents; no real email is sent.
  - The local and test values for the Supabase URL and anon key come from `npx supabase status`; no env var for them is listed in PROJECT_CONTEXT for tests, so don't invent one (propose it in the Handoff).

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

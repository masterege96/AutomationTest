Result: PASS

# Security gate: task 3c (task 3 post-deploy record, release checklist, PROJECT_CONTEXT refresh)

- **Role:** security (Gate), 2026-11-25, round 2, fresh context. Judged from the repo and read-only GitHub data only.
- **Branch:** `chore/3c-post-deploy`, HEAD `631d01d`, base `origin/main`. Commits: `122aeeb`, `6d65d3c` (round-1 fix),
  `631d01d`.
- **Diff (`git diff --name-only origin/main...HEAD`):** `PROJECT_CONTEXT.md`, `specs/3/post-deploy.md` (new),
  `tasks/3/TASK_BRIEF.md`, `tasks/3c/TASK_BRIEF.md` (new), `tasks/board.md`. Documentation only.
- No production access by this role: no SQL, no Supabase tools, no dashboard. `verify.sh` not re-run (git-release:
  `verify.sh: PASS 19/19 (0 skipped)`, `tasks/3c/TASK_BRIEF.md:60`).

## Applicable baseline rows

The brief lists row 13 only. No route, client-trusted value, raw SQL, `dangerouslySetInnerHTML`, env var read by code,
dependency, LLM use or upload is in the diff; no abuse test is required.

| Row | Control | Evidence | Result |
|-----|---------|----------|--------|
| #13 | No secret / key / project-ref value in changed files | Scan of every added line for JWTs (`eyJ...`), `sb_secret_`/`sb_publishable_`, `*.supabase.co`, `postgres://`, `password=`/`token=`, `sk_live`/`sk_test`, `ghp_`, `AKIA`, PEM blocks, 20-char lowercase project-ref shapes, any URL: only hits are the public GitHub PR/run URLs (`specs/3/post-deploy.md:7,29`) and the literal `https://evil.example` test origin (`tasks/3/TASK_BRIEF.md:478`). `MAILPIT_URL` appears as a name only, value "read at run time" (`PROJECT_CONTEXT.md:86`). Project named only as "AutomationTests". `sha256 e3b0c44298fc` is the empty-input hash prefix the drift log prints. | PASS |
| #13 | No `.env` tracked | `git ls-files` matches only `.env.example` | PASS |

## Scope

Allowed: `specs/3/post-deploy.md`, `PROJECT_CONTEXT.md`, plus `tasks/**`. Every changed path is in that set. No app code,
migration, test, workflow, script, rulebook or role file changed.

## Round-1 findings: fixed

| Round-1 finding | Now | Result |
|-----------------|-----|--------|
| P1-revised Fail outcome dropped | `tasks/3/TASK_BRIEF.md:475`: "no 429 by attempt 31, or any 200: stop, row 9 FAIL in production, tell security. (c) does not apply." | Fixed |
| P2 Fail action dropped | `tasks/3/TASK_BRIEF.md:476-477`: "Fail: tell security (a design change, not higher limits)." | Fixed |
| IP forwarding off / no secret API key dropped | `tasks/3/TASK_BRIEF.md:482-483` (R10): IP forwarding off, no secret API key, no new secret env var | Fixed |

## Release checklist R1-R10 vs the sources (re-checked in full)

Sources: `specs/3/security-gate.md` "Release lock (AC46)" items 1-4, `specs/3/threat-model.md` 4.4, 4.5 and 9 ("The
person"), and the devops-cicd "Production checklist for the person" (`tasks/3/TASK_BRIEF.md:301-311`).

| Source item | Checklist | Outcomes kept / weakened? |
|-------------|-----------|---------------------------|
| P1-revised procedure (35 wrong codes, anon key in shell variable only, record all, 65 s wait, 2 more; limit at 5 per 5 min) | R6 `:467-469` | Kept; adds "never pasted anywhere". Points back to the devops-cicd checklist (which carries the full (b) change list: dashboard + `config.toml` + S8 + AC texts). |
| P1 Pass (first 429 ≤ 6, all later 429, never 200) | `:470` | Identical |
| P1 Burst-bound (429 between 7 and 31, ...; at most 1 non-429 after wait; blocked until (a)/(b)/(c)) | `:471-474` | Identical; (b) still security's recommendation; (c) is the person's explicit risk acceptance with the 4.2 numbers |
| P1 Fail | `:475` | Identical, and adds "(c) does not apply": risk acceptance cannot cover Fail. Stronger than the source. |
| P2 (60 calls / 3 min, no 401 / 429; Fail → security, design change) | R7 `:476-477` | Identical |
| P4 (a) `Secure` on session cookie, (b) evil Origin 403 + same-origin works, CDN strips `x-middleware-subrequest` and keeps `_rsc` in cache key | R8 `:478-479` | Kept (see I1 on "request" vs "to-do create") |
| Item 1 SMTP (+ email rate limit after it, 2b item 2) | R2 `:462` | Kept; matches `tasks/2b/TASK_BRIEF.md:131` |
| Item 21 site URL / redirect URLs, no wildcards | R3 `:463` | Kept; matches `tasks/2b/TASK_BRIEF.md:151` |
| Item 9 + task 3b Turnstile | R5 `:466` | Kept; order (3b first, then CAPTCHA) matches `tasks/2b/TASK_BRIEF.md:139` |
| Email templates show `{{ .Token }}` | R4 `:464-465` | Kept |
| IP forwarding off, no secret API key (4.3, 4.5, release lock item 4) | R10 `:482-483` | Kept; adds "no new secret env var" (threat model 9, devops-cicd) |
| Real-user run | R9 `:480-481` | Added; git-release records it, orchestrator moves to DONE |
| P3 (info, not blocking) | not listed | Correct: the source marks it non-blocking (`tasks/3/TASK_BRIEF.md:311` still has it) |

**AC46 lock intact:** `tasks/3/TASK_BRIEF.md:457-459` "No real user signs in until every item below is recorded in
`tasks/decisions.md` (AC46). Agents never change production; each item is the person's." Same lock in
`specs/3/post-deploy.md:50-51`, which also says the threat model wins if sources differ (`:54-55`). Board shows task 3
`VERIFYING (the person: release checklist R1-R10 ...)`; nothing moves it to DONE.

## Claims of production proof (checked read-only)

- `gh pr view 14`: MERGED, merge commit `89b1c2e539c2...`, `mergedAt 2026-11-25T18:42:59Z`: matches
  `specs/3/post-deploy.md:7` and `tasks/3/TASK_BRIEF.md:456` (round-1 review's time fix holds).
- Check runs on `89b1c2e`: "Supabase Preview" success 18:43:33Z: matches `specs/3/post-deploy.md:11-12`.
- Run 45678585136: `workflow_dispatch`, `main`, head `89b1c2e`, success; log `diff: 0 non-comment lines, sha256
  e3b0c44298fc` and `No drift.`: matches `specs/3/post-deploy.md:28-31`.
- `list_migrations` (`specs/3/post-deploy.md:16-25`) not re-checked by this role (no Supabase tools); consistent with
  the empty drift diff on `89b1c2e`.
- Nothing claims real-user or production-app proof: `specs/3/post-deploy.md:12-13` (no hosting, only the DB deployed),
  `:45-46` (ACs needing a real user "not yet proven in production"), `:59-60` (VERIFYING).

## Instructions to change production

None to agents. Production actions are the person's only (`tasks/3/TASK_BRIEF.md:458`). The optional catalog check
(`specs/3/post-deploy.md:33-39`) is four read-only `select`s by the person in the SQL editor, the same precedent as 2a
(`specs/2d/security-gate.md` I1); agents are told they may not run SQL (`:35`).

## PROJECT_CONTEXT.md (no invented decision)

- zod: approved by the person, `tasks/decisions.md:16` item (1); "strict objects at the API boundary" is the task 3
  threat-model row 5 control as built (`PROJECT_CONTEXT.md:57`).
- `npm run test:e2e`: `package.json:16`; Chromium only and self-build/start: `playwright.config.ts:42-44`
  (`PROJECT_CONTEXT.md:39`).
- Test layout (`tests/integration`, `tests/e2e`, `tests/e2e/abuse`, colocated `lib/**/*.test.ts`) matches the tree;
  `tests/abuse/` does not exist. Every named example file exists.
- `MAILPIT_URL`: test/CI only, from `supabase status -o env` (`.github/workflows/ci.yml:61`); not read by app code
  (`specs/3/security-gate.md` manual review). Name only.

## Automated results

- `scripts/verify.sh`: not re-run (instructed); git-release's `verify.sh: PASS 19/19 (0 skipped)`.
- Secret scan: manual pattern scan above, clean. CI `secrets` (gitleaks) runs on the PR.
- `npm audit`, Supabase advisors, RLS: not applicable (no dependency or schema change).

## Findings (informational, not blocking)

- **I1, owner: orchestrator (optional wording).** R8 (`tasks/3/TASK_BRIEF.md:478-479`) says "a same-origin request
  works" where `specs/3/security-gate.md` P4(b) says "a same-origin **to-do create** works". A GET would pass without
  exercising the Origin check, so R8 alone would not catch a proxy that breaks `isSameOrigin` for all mutations. Not a
  weakening in effect: R9 (`:480`) requires create/toggle/edit/delete to work on the host, and that failure mode fails
  closed (403), not open. Suggest "a same-origin to-do create works" next time the brief is edited.
- **I2, owner: the person.** Threat model 9 also asks the person to decide the row 9 baseline wording proposal (4.5).
  It is a rulebook decision, not a release blocker, so its absence from R1-R10 is correct; noted so it isn't lost.

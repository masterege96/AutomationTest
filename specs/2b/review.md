Result: APPROVE

# Task 2b code review: security headers + local/CI auth defaults

Reviewer: code-reviewer, 2026-11-25, fresh context, judged from the repo only. Branch `sec/2b-headers-auth-defaults`,
diff `git diff origin/main...HEAD` (origin/main fetched first; merge base now `9f742a9` = origin/main). Round 3:
re-review after the orchestrator merged origin/main again (merge commit `329abd7`: PR #10 = task 2a's migration
`20261125150215_function_privileges.sql`, pgTAP test `02_function_privileges_test.sql`, `specs/2a/**`, tasks docs)
and added lesson L23. Security re-gated in `ec15a21` (PASS). Round 2 was `a2db9fd` (APPROVE), round 1 `7e510e5`.
Inputs read: round-2 review, `tasks/board.md`, `tasks/lessons.md`, merge commit `329abd7`, `git diff a2db9fd HEAD`.

No blockers. Round-1 should-fix items 1-3 and nit 8 are resolved; nits 4-7 and the item-22 placement nit remain
(optional, carry to later tasks).

## Round-3 checks

| Check | Result |
|-------|--------|
| `git diff a2db9fd HEAD -- next.config.ts supabase/config.toml tests/` | empty: code and tests unchanged since rounds 1-2, so the code review stands |
| `git diff a2db9fd HEAD` (everything) | only main's PR #10 content (`specs/2a/**`, the 2a migration and pgTAP test, `tasks/2a/**`, board/decisions/lessons) plus `specs/2b/security-gate.md` (security's re-gate) |
| PR net diff `git diff origin/main...HEAD` files | only `next.config.ts`, `supabase/config.toml`, `tests/integration/{auth-config,security-headers}.test.ts`, `specs/2b/**`, `tasks/2b/TASK_BRIEF.md`, `tasks/board.md`, `tasks/lessons.md` |
| Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) anywhere at HEAD | none |
| `tasks/board.md` | main's rows (0, 1, 2c, 2a) unchanged, plus one 2b row (`IN_REVIEW`); net diff is +1 line |
| `tasks/lessons.md` | L1-L20 identical to origin/main (diff is append-only after main's last line); then L21, L22, L23, each unique |
| `npm test` | 2 files, 44/44 pass |
| `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (under the shared-stack lock; now also applies and tests 2a's migration) | `verify.sh: PASS 18/18 (1 skipped)` (skipped: `test:e2e`, no script) |

## Round-2 checks (history)

| Check | Result |
|-------|--------|
| `git diff 7e510e5 HEAD -- next.config.ts supabase/config.toml tests/` | empty: code and tests unchanged since round 1, so the round-1 code review stands |
| PR net diff `git diff origin/main...HEAD` files | only `next.config.ts`, `supabase/config.toml`, `tests/integration/{auth-config,security-headers}.test.ts`, `specs/2b/**`, `tasks/2b/TASK_BRIEF.md`, `tasks/board.md`, `tasks/lessons.md` |
| Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in tasks/, specs/, scripts/, tests/, supabase/, next.config.ts | none |
| `tasks/board.md` | main's rows (0, 1, 2c) unchanged, plus one 2b row (`IN_REVIEW`); net diff is +1 line |
| `tasks/lessons.md` (round 2) | L1-L19 identical to origin/main (diff is append-only after main's last line); then L21, L22. L20 left free for the 2a branch |
| Lesson references | brief Handoff and security gate now say L21; no stale reference to this branch's lesson as L17 (other than this review's round-1 history) |
| `npm test` | 2 files, 44/44 pass |
| `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (under the shared-stack lock, main's reordered verify.sh) | `verify.sh: PASS 18/18 (1 skipped)` (skipped: `test:e2e`, no script) |

## Acceptance criteria

| AC | Code | Test / evidence | OK? |
|----|------|-----------------|-----|
| AC1 | `next.config.ts:3-30` is threat model A1 verbatim; `:41-52` A2 values exact; `cacheComponents`/`partialPrefetching` unchanged (`:34-35`) | `H2: ...` (all), `AC1: the existing options ...` | yes |
| AC2 | `headers()` one rule `source: "/(.*)"` (`:36-56`) | `H1`, `H1/AC2` (4 paths), `H2`; live `curl -sI` on `/` and `/does-not-exist` in qa-test Handoff | yes (wording now "six headers") |
| AC3 | - | one test per header, header name in test name and assertion message; red run recorded in Handoff | yes (wording now "six") |
| AC4 | - | `npm run build` passes (in verify.sh); browser-console check on `/` recorded by qa-test | yes |
| AC5 | `supabase/config.toml:187` `12`, `:190` `"letters_digits"` | `S1`, `S2` | yes |
| AC6 | - | manual live check in Handoff: 9 and 11 chars `422 weak_password`, no user; 12 chars accepted | yes |
| AC7 | `config.toml:232` | `S3`; manual: `400 email_not_confirmed`, no token | yes |
| AC8 | `config.toml:204-216`, `:239`, `:243` | `S5`-`S9` (all seven rate-limit keys pinned) | yes; row 9 live proof = security's accepted limitation + P1 (now checklist item 22) |
| AC9 | no secret, no new env var | `S12`, verify.sh migrations apply / `supabase test db` | yes |
| AC10 | checklist in `tasks/2b/TASK_BRIEF.md:130-151` (items 1-21) + item 22 in the orchestrator note | matches threat model C, values equal config.toml, no secrets (item 22 keeps the key in a shell variable only) | yes |
| AC11 | `specs/2b/test-plan.md` | maps AC1-AC12 and rows 9, 11, 3, 13 to file + test name + level | yes |
| AC12 | - | verify.sh PASS (round 3), security gate PASS (`ec15a21`), this review APPROVE; branch contains current origin/main (`9f742a9`), so it merges cleanly; CI not yet observed | pending CI |

## Code quality notes (unchanged from round 1; code not changed)

- `next.config.ts`: `headers()` shape and `source: "/(.*)"` match the Next.js 16 "Without Nonces" CSP pattern
  (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) and the `NextConfig` type;
  `supabaseOrigin()` reduces the env var to an http(s) origin and fails closed; the CSP is fixed at `next build`.
- `supabase/config.toml`: exactly nine value lines change, all equal to threat model B; nothing else touched.
- Tests: deterministic, import the real config files, hard-coded expected literals, env stubs reset; the in-test TOML
  parser fails loudly on unsupported syntax or duplicates.
- Scope per role unchanged; no dependency added; verify.sh "allowed paths" PASS.

## Findings

1. **Merge conflicts / lesson number - RESOLVED.** origin/main merged in `fc61959`; no conflict markers; the board
   keeps main's rows plus 2b; this branch's lesson is now L21 (L1-L19 identical to main, L20 reserved for 2a), plus
   L22. Round 3: 2a merged keeping L20, so the numbering holds (L1-L20 = main, then L21-L23); second merge
   `329abd7` is clean, verify.sh PASS with 2a's migration applied.

2. **Five vs six headers - RESOLVED.** `tasks/2b/TASK_BRIEF.md` AC2/AC3 now say "six headers". Remaining "five"
   mentions are historical Handoff notes (`TASK_BRIEF.md:112,176`, `specs/2b/test-plan.md:19`) that explain the
   change, and `specs/2b/security-gate.md:30` "the other five headers" (six minus the CSP), which is correct.

3. **P1 on the dashboard checklist - RESOLVED.** Item 22 (required; after the first deploy and the rate-limit item,
   before any real user; pass/stop criteria; record in `tasks/decisions.md`; task 3's login not released until it
   passes) is in the orchestrator note of the brief. Nit: it sits in the note rather than in the numbered list
   (`:130-151`); whoever next edits the checklist (devops-cicd) may move it there so the person sees all 22 items
   in one place.

4. **`specs/2b/threat-model.md:105`, `tasks/2b/TASK_BRIEF.md:65,83` - nit, open - owner: security / product-spec (task 3).**
   The nonce CSP is planned for "`middleware.ts`"; in Next.js 16 that convention is deprecated and renamed to
   `proxy.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`). Task 3's
   brief and threat model should name `proxy.ts`.

5. **`tests/integration/security-headers.test.ts:107-115` - nit, open - owner: qa-test.**
   `H1/AC2` checks paths with a plain `RegExp("^/(.*)$")`, not Next's path-to-regexp matcher; harmless for `/(.*)`
   (the live curl check covers real behavior), but a comment saying so would help a future reader.

6. **`tests/integration/auth-config.test.ts:160-167` - nit, open - owner: qa-test.**
   In `S11` the `if (captcha !== undefined)` block can never let the test pass, since `:167` asserts `captcha` is
   undefined anyway; the `secret` branch is dead code. Behavior today is correct.

7. **`tests/integration/auth-config.test.ts:15` - nit, open - owner: qa-test.**
   `CONFIG_PATH` uses `process.cwd()`; resolving from `import.meta.url` would make the test location-independent.

8. **Board / brief state - RESOLVED.** Brief state and board row are `IN_REVIEW`. The brief now states that the
   person's task 2 answers live in `tasks/decisions.md` on the 2a branch and that this brief quotes them; if 2b
   merges before 2a, the quote in the brief is the record until 2a lands. Round 3: 2a has landed;
   `tasks/decisions.md` is now on main and on this branch.

## Gate check

After committing this file, `bash scripts/gate-check.sh` was run; its result is reported to the orchestrator with
this review's commit.

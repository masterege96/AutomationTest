Result: APPROVE

# Task 2b code review: security headers + local/CI auth defaults

Reviewer: code-reviewer, 2026-11-25, fresh context, judged from the repo only. Branch `sec/2b-headers-auth-defaults`,
diff `git diff origin/main...HEAD` (origin/main fetched first; merge base `5fcb5ba`). Round 1.
Inputs read: `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `roles/devops-cicd.md`, `roles/qa-test.md`,
`PROJECT_CONTEXT.md`, `tasks/2b/TASK_BRIEF.md`, `specs/2b/threat-model.md`, `specs/2b/test-plan.md`,
`specs/2b/security-gate.md` (PASS), Next.js 16.4.6 docs in `node_modules/next/dist/docs/`.

No blockers. Three should-fix items (merge conflicts / lesson number, AC wording, P1 on the checklist) are
documentation or merge hygiene and must be handled before or at merge, but none is a defect in the code or tests.

## Commands run on this branch

| Command | Result |
|---------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 2 files, 44/44 pass |
| `npm run build` | exit 0 (`/` and `/_not-found` static) |
| `bash scripts/verify.sh --brief tasks/2b/TASK_BRIEF.md` (under the shared-stack lock) | `verify.sh: PASS 18/18 (1 skipped)` (skipped: `test:e2e`, no script) |

## Acceptance criteria

| AC | Code | Test / evidence | OK? |
|----|------|-----------------|-----|
| AC1 | `next.config.ts:3-30` is threat model A1 verbatim (checked line by line); `:41-52` A2 values exact; `cacheComponents`/`partialPrefetching` unchanged (`:34-35`) | `H2: ...` (all), `AC1: the existing options ...` | yes |
| AC2 | `headers()` one rule `source: "/(.*)"` (`:36-56`) | `H1`, `H1/AC2` (4 paths), `H2`; live `curl -sI` on `/` and `/does-not-exist` in qa-test Handoff | yes (six headers, see F2) |
| AC3 | - | one test per header, header name in test name and assertion message; red run recorded in Handoff (two variants) | yes |
| AC4 | - | `npm run build` passes (rerun here); browser-console check on `/` recorded by qa-test (no violation; `connect-src` enforcement probed) | yes |
| AC5 | `supabase/config.toml:187` `12`, `:190` `"letters_digits"` | `S1`, `S2` | yes |
| AC6 | - | manual live check in Handoff: 9 and 11 chars `422 weak_password`, no user; 12 chars accepted | yes |
| AC7 | `config.toml:232` | `S3`; manual: `400 email_not_confirmed`, no token | yes |
| AC8 | `config.toml:204-216`, `:239`, `:243` | `S5`-`S9` (all seven rate-limit keys pinned) | yes; row 9 live proof is security's accepted limitation + P1 |
| AC9 | no secret, no new env var | `S12` (3 tests), verify.sh migrations apply / `supabase test db` | yes |
| AC10 | checklist in `tasks/2b/TASK_BRIEF.md:130-153` | 21 items, matches threat model C 1:1, values equal config.toml, no secrets, "agents never apply" stated | yes (see F3) |
| AC11 | `specs/2b/test-plan.md` | maps AC1-AC12 and rows 9, 11, 3, 13 to file + test name + level | yes |
| AC12 | - | verify.sh PASS, security gate PASS, this review APPROVE; CI not yet green (see F1) | pending CI |

## Code quality notes (no change requested)

- `next.config.ts`: the `headers()` shape (`async headers()` returning `[{ source, headers: [{ key, value }] }]`,
  `source: "/(.*)"`) is exactly the "Without Nonces" pattern in
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and matches
  `headers?: () => Promise<Header[]> | Header[]` in `next/dist/server/config-shared.d.ts`. Typed via `NextConfig`.
  `supabaseOrigin()` correctly reduces the env var to an http(s) origin and fails closed; the CSP is computed once at
  module load, which is fine because `next.config.ts` is evaluated at build time (devops-cicd documented that the value
  is fixed at `next build`).
- `supabase/config.toml`: exactly nine value lines change, all equal to threat model B; no comment, port, section or
  other key touched; `[auth.sms] enable_confirmations` and the `[auth.sms]`/MFA `max_frequency` lines untouched;
  `[auth.captcha]` and `[auth.email.smtp]` still commented.
- Tests: deterministic (no network, no server, no time); they import the real `next.config.ts` and read the real
  `supabase/config.toml`; expected values are hard-coded literals from the threat model, not derived from the code
  under test; env stubs are reset in `afterEach`. The in-test TOML parser is section-aware, rejects duplicate
  sections/keys and throws with a line number on anything it does not understand (multi-line arrays, `[[tables]]`,
  inline tables, `1_000`, dates), so a format change fails loudly rather than silently passing.
- Scope per role, by commit: devops-cicd `42738dc` touched only `next.config.ts` and `supabase/config.toml`
  (`754f3c8`: its Handoff in the brief); qa-test `54f3c9e` touched only `tests/integration/**` and
  `specs/2b/test-plan.md` (`ccf7f9b`: Handoff + `tasks/lessons.md`, which AGENT_RULES §26 asks every role to write).
  No dependency added; verify.sh "allowed paths" PASS.

## Findings

1. **`tasks/lessons.md:225`, `tasks/board.md:7` — should-fix — owner: git-release (merge), qa-test (lesson text).**
   The branch is behind `origin/main` by `de0cfb9` and `69c6151` and does not merge cleanly:
   `git merge-tree --write-tree origin/main HEAD` reports content conflicts in `tasks/lessons.md` and `tasks/board.md`.
   The new lesson is numbered **L17**, but `origin/main` already has `L17` ("A post-deploy record under specs/<id>/
   makes the task's gates stale"), `L18` and `L19`, and the unmerged 2a branch also adds its own `L17` (pgTAP
   `throws_ok` role leak). Per main's L19, a PR with merge conflicts gets no `pull_request` CI run, so AC12 "CI green"
   can't be met until this is resolved. Fix: merge `origin/main` into the branch, renumber this lesson to the next free
   number at merge time (L20, or later if 2a lands first), and keep both board rows. Re-run verify.sh after the merge
   (main's verify.sh now runs the DB section first).

2. **`tasks/2b/TASK_BRIEF.md:27-28` — should-fix — owner: product-spec.**
   AC2 and AC3 still say "all five headers" / "any one of the five headers"; the threat model (A2), the code and the
   tests have six (HSTS added by security). devops-cicd (`:112`), qa-test (`:176`, test-plan) and security (gate,
   finding 1) all flagged it; no one has changed the AC text yet. Update the wording to "six" (or "every header in
   threat model A") so the brief, spec and tests agree.

3. **`tasks/2b/TASK_BRIEF.md:130-153` — should-fix — owner: devops-cicd.**
   The production checklist is the one document the person works from, but it doesn't contain security's required
   post-deploy check **P1** (10 wrong-OTP verifies on production, 429 by attempt 6, before any real user; see
   `specs/2b/security-gate.md` "P1"). Security's gate makes row 9 rest on P1. Add a checklist item 22 pointing to P1
   (when: after item 7 and the first deploy; record in `tasks/decisions.md`), so it isn't only in the gate report.
   Can be done in this task's Handoff or the next devops-cicd task, but must not be lost before task 3 ships.

4. **`specs/2b/threat-model.md:8,105`, `tasks/2b/TASK_BRIEF.md:65,83,93` — nit — owner: security / product-spec (for task 3).**
   The nonce CSP is planned for "`middleware.ts`". In Next.js 16 that convention is deprecated and renamed to
   `proxy.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`; the CSP guide's
   nonce example uses Proxy). Task 3's brief and threat model should name `proxy.ts`.

5. **`tests/integration/security-headers.test.ts:107-115` — nit — owner: qa-test.**
   `H1/AC2` checks the paths with a plain JS `RegExp("^/(.*)$")`, not with Next's path-to-regexp matcher, so it only
   approximates Next's routing. Harmless for `/(.*)` (and the live H8 `curl` check covers real behavior), but the test
   name implies more than it proves; a comment saying so would help a future reader.

6. **`tests/integration/auth-config.test.ts:160-167` — nit — owner: qa-test.**
   In `S11` the `if (captcha !== undefined) { ... }` block can never let the test pass, because line 167 then asserts
   `captcha` is undefined anyway; the `secret` branch is effectively dead. Either drop the block or make line 167
   conditional on the intended future policy. Behavior today is correct.

7. **`tests/integration/auth-config.test.ts:15` — nit — owner: qa-test.**
   `CONFIG_PATH` is built from `process.cwd()`, so the test depends on being run from the repo root (true for
   `npm test` and verify.sh). Resolving from `import.meta.url` would make it location-independent.

8. **`tasks/2b/TASK_BRIEF.md:5`, `tasks/board.md:7` — nit — owner: orchestrator.**
   State is still `BACKLOG` although the task has a gate PASS and a review; update the state when processing this
   review. Also, the brief (`:89`) points to `tasks/decisions.md` "on the 2a branch" for the person's answers; that
   record isn't on main or this branch, so if 2b merges before 2a the decision lives only in this brief's quote.

## Gate check

After committing this file, `bash scripts/gate-check.sh` was run; its result is reported to the orchestrator with
this review's commit.

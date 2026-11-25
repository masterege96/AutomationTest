Result: APPROVE

# Code review: task 3c (task 3 post-deploy record, release checklist, PROJECT_CONTEXT refresh), round 2

- **Role:** code-reviewer, 2026-11-25, fresh context, judged from the repo and read-only GitHub data only.
- **Branch:** `chore/3c-post-deploy`, base `origin/main` (`89b1c2e`). Commits reviewed: `122aeeb`, `6d65d3c`, `631d01d`.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `tasks/3c/TASK_BRIEF.md`,
  `roles/git-release.md` (Ship outputs), `ORCHESTRATOR.md` section 3, `tasks/3/TASK_BRIEF.md` (devops-cicd Handoff and
  "Production checklist for the person"), `specs/3/threat-model.md` 4.5, `specs/3/security-gate.md` release lock,
  `tasks/2b/TASK_BRIEF.md` items 1/2/9/21, `tasks/decisions.md`, `git diff origin/main...HEAD`. verify.sh not re-run
  (Handoff: `verify.sh: PASS 19/19 (0 skipped)`). No production access used.

## Round-1 items

| Item | Status | Evidence |
|------|--------|----------|
| PR #14 merge time 18:46 (should-fix) | Fixed | `specs/3/post-deploy.md:7` and `tasks/3/TASK_BRIEF.md:456` say 18:42:59 UTC; `gh pr view 14`: `mergedAt` 2026-11-25T18:42:59Z, merge commit `89b1c2e539c2…`. |
| Earlier failed merge-gate run not mentioned (nit) | Fixed | `specs/3/post-deploy.md:9-10` names run 45675569229 (18:29 UTC). Its log: `gate-check` FAIL only on "pipeline/framework files changed without the person's 'framework-change-approved' label: .github/workflows/ci.yml"; security-gate PASS and review APPROVE lines passed. |
| No run links (nit) | Fixed (mostly) | PR and drift run carry URLs (`post-deploy.md:7,29`); see nit 1 for the rest. |

## What was checked

| Check | Result | Evidence |
|-------|--------|----------|
| Scope | OK | Diff touches `PROJECT_CONTEXT.md`, `specs/3/post-deploy.md`, `tasks/3/TASK_BRIEF.md`, `tasks/3c/TASK_BRIEF.md`, `tasks/board.md` only (allowed paths + `tasks/**`). Docs only. |
| Required checks on PR #14 | OK | Labels: `framework-change-approved`. Final `verify` (45676574519), `db-check`, `secrets`, `merge-gate` (45676575388, 18:34:46-18:34:56Z) all SUCCESS on head `7f12f98`; the one FAILURE is the superseded merge-gate above. |
| Integration check on `89b1c2e` (AC1) | OK | check-runs: "Supabase Preview" success, 18:43:28-18:43:33Z, matches `post-deploy.md:11`. (Also a `drift` check-run success 18:48:03Z, the dispatch run below.) |
| Drift after deploy (AC1) | OK | Run 45678585136: `workflow_dispatch`, `main`, head `89b1c2e`, success; log `diff: 0 non-comment lines, sha256 e3b0c44298fc`, `No drift.`; 0 artifacts. Matches `post-deploy.md:29-32`, judged on content. |
| Migration history (AC1) | OK (indirect) | The four rows at `post-deploy.md:22-25` are exactly the four files in `supabase/migrations/` on `origin/main` (incl. `20261125165117_create_todos.sql`); the empty drift diff on `89b1c2e` agrees. `list_migrations` not re-run by this review (no cloud tools). |
| Proven vs open (AC1) | OK | `post-deploy.md:34-46`: pre-merge proof (counts match `specs/3/security-gate.md` automated results), production real-user ACs open under AC46, optional catalog check left to the person. AC range AC1-AC48 matches the task 3 brief. |
| VERIFYING consistent (AC2) | OK | `tasks/board.md:12`, `tasks/3/TASK_BRIEF.md:5`, `post-deploy.md:59` all VERIFYING; ORCHESTRATOR section 3 (merged, waiting for production proof). No claim of real-user proof; app not hosted (`post-deploy.md:13-14`). 3c is IN_REVIEW on board and brief. |
| Release checklist R1-R10 (AC3) | OK | `tasks/3/TASK_BRIEF.md:460-484` covers hosting build env (R1), SMTP + email rate limit (R2, 2b items 1-2), URLs (R3, item 21), templates with `{{ .Token }}` (R4), Turnstile/3b (R5, item 9), P1-revised with Pass / Burst-bound (a)(b)(c) / Fail (R6), P2 with Fail action (R7), P4 incl. CDN `x-middleware-subrequest` / `_rsc` (R8, gate item 3), real-user run (R9), IP forwarding off / no secret key (R10). Thresholds (35 attempts, 6, 7-31, 65 s, 2 more, 60 calls / 3 min) match threat model 4.5, the devops-cicd checklist (brief :301-313) and the gate release lock. |
| No secrets (row 13) | OK | Grep of changed files for JWTs, `sb_secret_`/`sb_publishable_`, DB URLs, project ref: none. Keys referred to only as "in a shell variable". |
| PROJECT_CONTEXT (AC4) | OK | `test:e2e` = `playwright test` in `package.json`; `playwright.config.ts` Chromium-only project and `webServer` build+start (`PROJECT_CONTEXT.md:39`). zod 4.6.7 pinned, approved in `tasks/decisions.md:16`; `z.strictObject` used in `lib/server/todo-schemas.ts:23` (`:57`). Folder layout matches disk: `tests/integration/`, `tests/e2e/abuse/`, colocated `lib/**/*.test.ts`, no `tests/abuse/` (`:54`). All nine example files exist (`:59`). `MAILPIT_URL` test-only, read from `supabase status -o env` in CI (`ci.yml:61`) and `tests/e2e/support/env.ts` (`:86`), as proposed in the devops-cicd Handoff; gate confirms app code never reads it. No invented decision. |
| AC5 | Local OK, CI pending | verify.sh PASS in Handoff; security gate and CI on the 3c PR still to come. |

## Findings

- **specs/3/post-deploy.md:9-10, nit, owner: git-release.** "it re-ran green at 18:34 UTC" — the green gate is a new
  run (45676575388, `pull_request_target` on the label event, attempt 1), not a re-run of 45675569229. Say "a new gate
  run (45676575388) passed at 18:34 UTC". Optionally give URLs for both gate runs and the Supabase Preview check
  (git-release Ship output "deploy run link"); the IDs are enough to find them.
- **tasks/3/TASK_BRIEF.md:475, nit (observation), owner: orchestrator.** "(c) does not apply" on the P1-revised Fail
  outcome is not literally in threat model 4.5 or the gate, but it follows from them ((a)-(c) are listed under
  Burst-bound only; Fail says stop and tell security). Correct as written; no change needed unless security wants the
  wording in the threat model too.

No blocker or should-fix. Round-1 should-fix resolved.

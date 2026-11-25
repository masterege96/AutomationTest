# Step 4 plan: tighten the framework from the pilot's real failures, then package it

Author: orchestrator, 2026-11-25. Source: every open item in `tasks/lessons.md` (L1-L27) and the open security
findings in L11 (S5, S14 and its retarget variant, S15, S16, S19, S20/S21, S26, S27).

Every PR below changes framework paths (`ORCHESTRATOR.md`, `rules/**`, `roles/**`, `scripts/**`,
`.github/workflows/**`), so **each needs the person's `framework-change-approved` label** before merge-gate passes.
`rules/**` and `roles/**` are the person's files (roles/README.md ownership map): an agent drafts the change in the
PR, the label is the person's approval of that exact text. PRs marked **Decision** need the person to choose before
the build starts.

Order: (a) first, because it removes the merge conflicts that made every later PR expensive (L19, L22, L23).

## PR list

| PR | Fixes | Changes | Needs |
|----|-------|---------|-------|
| **4a** per-task files | L23, L19, L16 (doc), L26/L25 bookkeeping | Task state lives only in each brief; `tasks/board.md` replaced by `scripts/board.sh` (prints the board from the briefs); new lessons in `tasks/<id>/lessons.md` (ids `L<id>.<n>`); new decisions as one file each in `tasks/decisions/`; `tasks/lessons.md` and `tasks/decisions.md` frozen as archives (L1-L27 and the decisions so far keep their ids); `scripts/lessons.sh` lists open lessons for the learning loop. Docs: ORCHESTRATOR.md 7-8, AGENT_RULES 7 and 26, roles git-release / product-spec / security / README. | label |
| **4b** gate freshness | L22, L17, S16, S5, S15 | `gate-check.sh`: last code change = first-parent, no-merge commits of the branch (a catch-up merge of main no longer makes gates stale); exclude `specs/<id>/post-deploy.md`; `tasks/decisions/**` counts as code (S5); protected paths add `.gitleaks.toml`, all `.github/**`, `package.json`, lockfile, `supabase/config.toml`, `templates/**`, `AGENTS.md` (S15); the label must be newer than the last protected-path commit (gate.yml reads the `labeled` event time from the timeline API; a push after labeling needs a re-label) (S16). | label |
| **4c** merge-gate spoofing | S14 + retarget variant | Options for the person: (1) a small GitHub App posts the `merge-gate` check run and branch protection pins the required check to that app's id (workflows can't imitate it; the person creates the app and stores its key as an environment secret); (2) an org-level ruleset with a required workflow (needs moving the repo to an organization); (3) interim hardening only: gate-check FAILs if any workflow at the PR head defines a job or check named `merge-gate`/`gate`, and `edited`/retarget re-runs are refused. Recommended: (1), with (3) shipped first as a stopgap. | **Decision** + label; person creates the App |
| **4d** verify.sh | L27, L15, L5, S19 | Bundle-secret scan runs after `npm run build`, reads local secret values from `supabase status -o env` itself, FAILs when there is no bundle; destructive scan ignores comments and privilege lists (`truncate` only as a statement); qa-test "Done when": no `--passWithNoTests` once tests exist; bootstrap-check verifies the `production` environment (main-only) and no repo-level `SUPABASE_*` secrets. | label |
| **4e** drift.yml | S26, S27, L12, L13 | Non-numeric diff count = check broken (exit 1, no drift issue); drift runs after each deploy (on push to main, after the integration's check completes) as well as nightly; ref-format check without printing; least-privilege token scopes documented; option to diff with a read-only DB role instead of `database_write` scope. | label; **Decision** on L13 (token scope vs read-only role) |
| **4f** production auth settings as code | L24, 2b item list, task 3 R-list | `supabase/production/auth.json` (values, no secrets) + `scripts/prod-auth.mjs` (person runs it): key-scoped Management API PATCH, units taken from the pinned CLI schema, refuses when a current value isn't the expected one (default or last applied), shows current -> new, waits for "yes", re-reads and prints the result for `tasks/decisions/`. Never `supabase config push`. | label; **Decision**: may the person's read-only verification SELECTs be written into the rules (L24 open question) |
| **4g** local DB per worktree | shared-stack collisions seen in task 3 (resets under other builders, templates loaded from a deleted worktree) | Per-worktree Supabase `project_id` and port block (derived from the worktree name) via a `scripts/worktree-env.sh`; or one stack with a lock file that `verify.sh` takes. Plus a read-only DB role for drift if chosen in 4e. | label; **Decision**: per-worktree stacks (more RAM) vs lock |
| **4h** role-contract lessons | L14, L20, L21, L25, L26, S20/S21 | db-architect: explicit grants + pgTAP grant test for every exposed object (L14); `; reset role` pattern in schema/threat-model templates (L20); security threat-model template: per-IP auth limits proven by static config + production check, not a local live test (L21), burst caveat from task 3; devops-cicd upgrade rule: re-run CSP and T1 suites and security re-check at every Next.js upgrade (L25, L26); git-release "Owns ... branch protection" wording fixed (S20/S21). | label (rules/roles text) |
| **4i** template packaging | step 4 goal | New repo layout `agent-team-framework/` (or a `template` branch): framework files only (ORCHESTRATOR, rules, roles, templates, scripts, workflows, tests of the framework), pilot app stripped; `scripts/bootstrap-new-project.sh` copies it into a new repo and fills PROJECT_CONTEXT placeholders; README with the Phase 0 checklist. | label; **Decision**: separate repo vs template branch |

## Not in a PR (the person)

- L12/L13 secrets and token scopes (done for the pilot; 4e documents the least-privilege setup).
- Task 3 release checklist R1-R10, row 9 baseline wording (threat model 4.5).
- S14 risk stays accepted for the pilot until 4c lands.

## How each PR runs

Full role flow per ORCHESTRATOR.md: product-spec brief -> builder(s) in their own worktree -> qa-test where a
script gets tests -> security gate and code review in fresh contexts, each in its own commit after the last code
change -> PR -> the person adds the label and merges. One PR at a time from 4b on, so main never moves under an
open framework PR.

## After step 4 (agreed with the person, 2026-11-25 20:21 UTC; no UI until the framework is fully finished)

| Step | Goal | Done when |
|------|------|-----------|
| **5** Second app from the template | Bootstrap a fresh project from the 4i template and build one feature end to end with something the pilot lacked (related tables, roles or sharing). | Every place where the rules were to-do-specific or needed the orchestrator's hand-holding is a lesson with a fix. |
| **6** Orchestration as scripts | The orchestrator's manual glue (routing, merging builder worktrees, conflict handling, the local DB lock from 4g) becomes a role contract plus scripts (e.g. `scripts/next-task.sh`). | A fresh agent drives a task from brief to PR with only the repo; the person only approves. |
| **7** Metrics | Per task: time, fix loops, which gate caught what, API cost (a small metrics file per task next to `board.sh` / `lessons.sh`). | Honest numbers per feature before any bigger decision. |
| **8** Multi-person hardening | GitHub App gate (4c-app) live, least-privilege tokens, secret-rotation and incident runbooks tested once, branch protection checked automatically, a second-reviewer path. | bootstrap-check covers it; one dry run of each runbook recorded. |
| **9** To-do app release (in parallel, when the person picks a host) | Host, task 3b (Turnstile), release checklist R1-R10, real-user test. | Task 3 DONE. |
| **10** UI (control panel) | Only after steps 5-9. | — |

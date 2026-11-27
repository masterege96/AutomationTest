Result: APPROVE

# Code review: task 4e (drift check with the read-only role `drift_reader`)

- **Role:** code-reviewer, 2026-11-27. Fresh context (not the builder's, not security's); judged from the repo,
  `tasks/4e/TASK_BRIEF.md`, `tasks/4e/lessons.md`, `specs/4e/security-gate.md` and `git diff origin/main...HEAD`.
- **Branch:** `ci/4e-drift-readonly`, code head `ea73293`, security gate `1954524` (`Result: PASS`), draft PR #23.
- **CI on `ea73293`** (`gh pr checks 23`): `verify` pass, `db-check` pass, `secrets` pass. `merge-gate` fails only
  because this file was missing; it also needs the person's `framework-change-approved` label (`.github/**`,
  `scripts/**`, `roles/**` changed).
- **Run here:** `npx --no-install vitest run tests/integration/drift-workflow.test.ts`: `Test Files 1 passed (1)`,
  `Tests 127 passed (127)`. `npx --no-install supabase db diff --help` (CLI 3.2.0, no DB contact): `--agent
  <auto|yes|no>` and `--output-format <text|json|stream-json>` exist, so the L4e.2 flags in `drift.yml:123` are valid
  for the pinned CLI. `git ls-files --eol`: both scripts, drift.yml and the role file are LF in index and worktree
  (`.gitattributes` `* text=auto eol=lf`), scripts committed as mode 100755. No verify.sh, no stack, no production.

## Scope

`git diff --name-status origin/main...HEAD`: `.github/workflows/drift.yml` (M), `roles/devops-cicd.md` (M, one line:
Outputs item 5), `scripts/ci/drift-judge.sh` (A), `scripts/ci/drift-url-check.sh` (A),
`supabase/production/drift-role.sql` (A), `tests/integration/drift-workflow.test.ts` (A), `specs/4e/security-gate.md`,
`tasks/4e/**`, `tasks/4c/live-checks.md`. All within the brief's allowed paths (`tasks/**` always allowed). No
migration, `supabase/tests`, seed, `scripts/bootstrap-check.sh`, ci.yml, gate.yml, package or lockfile change. No new
dependency.

## Acceptance criteria vs code and tests

| AC | Code | Test (passing) | Verdict |
|----|------|----------------|---------|
| AC1 | `supabase/production/drift-role.sql:1-13` header; name-status shows no migration/tests/seed change | AC1 x2 | OK |
| AC2 | `drift-role.sql:31-41` create, `:45-49` re-apply, settings | AC2 (also asserts no attribute is switched on) | OK |
| AC3 | `:52` only `grant connect on database postgres`; `:55-81` final check rejects any membership | AC3 | OK |
| AC4 | placeholder only `:25` | AC4 | OK |
| AC5 | guard `:32`; local double run in brief Handoff (devops-cicd AC28+AC5) | AC5 static + Handoff evidence | OK |
| AC6 | `:83-88` all comments, order terminate/revoke/drop/secret | AC6 | OK |
| AC7 | `drift.yml:88`, `:110`, `:117` step env only | AC7 (parses steps, exact set of secret steps) | OK |
| AC8 | `drift.yml:123` | AC8 + executed diff step argv check | OK |
| AC9 | `drift.yml:85-93`; later production steps have no `always()` | AC9 x2 (runs the real `run:` block) | OK |
| AC10 | ci.yml / gate.yml unchanged, no `secrets.SUPABASE_` | AC10 | OK |
| AC11-AC13 | `scripts/ci/drift-url-check.sh` | 8 good, 29 bad, 13 abuse fixtures, generated at run time; leak search per part | OK |
| AC14 | `drift.yml:107-111` before `:113`; masks only after a pass (`drift-url-check.sh:108-115`) | AC14 x2 | OK |
| AC15-AC18 | `scripts/ci/drift-judge.sh` | AC15-AC18, injection and S26 sweep; stubs for grep/sha256sum | OK (AC18 "not readable" untestable on Windows, noted by qa-test) |
| AC19 | `drift.yml:162-175` | AC19 | OK |
| AC20-AC23 | `drift.yml:21-33`, `:45-50`, `:66-83` | AC20-AC23, head-guard executed incl. crafted `head_sha` | OK |
| AC24 | kept; concurrency moved to the job per orchestrator decision L4e.1 (recorded in brief Handoff and lessons) | AC24 x4, L4e.1 | OK |
| AC25 | no gate names/text | AC25; gate-spoof AC1 not re-run here (security/CI) | OK |
| AC26/AC27 | `drift.yml:5-20`; `roles/devops-cicd.md:53` only line changed | AC26, AC27 | OK (see R2 on "restricted to main") |
| AC28 | brief Handoff devops-cicd AC28 (identical diffs, abuse writes/selects fail); probe undone by hand instead of a reset (orchestrator instruction, recorded) | local evidence | OK |
| AC29 | `bootstrap-check.sh:182` greps `schedule` and `db diff`, both present; script unchanged | AC29 | OK |
| AC30 | CI green (above); fixtures generated at run time | - | OK once `merge-gate` passes |
| AC31-AC33 | live, the person after merge | - | pending (post-deploy) |

## Bash and Actions semantics checked

- **Diff step `drift.yml:118-127`:** GitHub's `bash -e` shell is switched off with `set +e` only around the CLI, so a
  non-zero CLI exit reaches the judge (tested with `--noprofile --norc -eo pipefail`, the runner's shell); `set -e` is
  restored, so the judge's exit 1 fails the step after its outputs were written. The judge is a separate `bash`
  process and uses `set -uo pipefail` without `-e`, so `grep -c`'s exit 1 on zero matches is handled explicitly
  (`drift-judge.sh:67-69`).
- **Judge:** exit code checked first (non-numeric code -> `unknown`, never written anywhere); file checks; JSON
  first-line check in pure bash; count validated `^[0-9]+$` before `-gt`; hash validated; only fixed strings go to
  `GITHUB_OUTPUT`. CRLF: `\r` is `[[:space:]]`, so `\r`-only and `-- x\r` lines are blank/comment (tested).
- **URL check:** all values quoted, regex matches use `[[ =~ ]]` with `LC_ALL=C`; whitespace/CR/LF rejected first;
  nothing but fixed texts printed; masks only on success. Metacharacters never executed (tested).
- **Job `if:`** compares only payload values; for `check_run`, `github.ref` is the default branch and `github.sha`
  its last commit, so the head guard and the main-only rule hold. Head guard output sanitized with `tr -cd '0-9a-f'`.
- **Upload / issue steps:** `always()` + `diff_ok == 'true'` for the S28/S29 chain; issue on `failure() && drift ==
  'yes'` only. A failing require or URL-check step skips the diff step, so neither output is set: no upload, no issue.
- **Job-level concurrency:** a job skipped by its `if:` doesn't join the group (L4e.1). See R1 for the one case that
  still joins.

## Findings

| # | Severity | File:line | Finding | Owner |
|---|----------|-----------|---------|-------|
| R1 | nit | `.github/workflows/drift.yml:45-58`, `:71-83` | The stale-commit case of AC22 is decided in a step, not in the job `if:`, so a `check_run` for an **older main commit** (same app, name, `head_branch: main`, e.g. a late or re-requested `Supabase Preview` on A after B merged) passes the job `if:`, joins the `drift` group and, while another drift run is in progress, cancels a pending after-deploy run for main's head B; it then only skips. Same failure mode as L4e.1, narrower trigger; the nightly run still covers it. Fixing it in the job `if:` (`github.event.check_run.head_sha == github.sha`) would lose AC22's notice, so this is a trade-off for a later task, not a change here. Add it to `tasks/4e/lessons.md` (L4e.1 follow-up) and watch AC32. | devops-cicd (later) / orchestrator (lesson) |
| R2 | should-fix (not code) | `tasks/4e/TASK_BRIEF.md:386-396` "After merge" steps 2 and 3 | Security conditions G1 (run `show log_statement;` first, record the value; password flow by value; a failed password query means a new password) and G2 (main-only deployment branch policy **mandatory** before or with adding the secret; until then `drift.yml:51-52` and `roles/devops-cicd.md:53` "restricted to main" are not true) are only in `specs/4e/security-gate.md`; the person's steps in the brief still show step 3's branch policy as an optional "(Q3: also ...)" and step 2 without the `log_statement` check. Put both into the brief's steps (or the Q1 decision file) before the person runs step 1. `tasks/**` only, so it doesn't make the gates stale. | orchestrator |
| R3 | nit | `scripts/ci/drift-url-check.sh:45-66` | Extends security G3: besides `@`, `%` and inner spaces, a `?` or `#` inside the password is accepted by the check (authority is cut at the first `/`), while a URL parser cuts the authority at the first `?`/`#`, so the CLI would see a different host/user (it then fails to connect: "broken", fail closed, no leak). Tightening the password to `[A-Za-z0-9]+` (G3's recommendation) closes all of these; the person's procedure already requires letters and digits. Track G3 and this in `tasks/4e/lessons.md` or the backlog so the "later task" isn't lost. | devops-cicd (later) / orchestrator (tracking) |
| R4 | nit | `supabase/production/drift-role.sql:55-81` | The final check asserts attributes and memberships but not the role settings (`rolconfig` holding `default_transaction_read_only=on` and `statement_timeout=120s`). They are set unconditionally two lines above, so the risk is nil; mention only for completeness if the file is touched again. | devops-cicd (optional) |
| R5 | nit | `tasks/4e/TASK_BRIEF.md:5`, `:472` | Brief `State` still says `SPEC_READY`; the qa-test Handoff entry reports 114 tests, the file now has 127 (L4e.2 tests from `ea73293` have no Handoff line). Update the state and add a one-line Handoff entry for the L4e.2 test change. | orchestrator / qa-test |
| R6 | nit | `tasks/4c/live-checks.md` | A task-4c record (commit `62889c1`) travels in the 4e PR. Allowed (`tasks/**`), harmless, but unrelated to this task's scope; mention it in the PR description so the merge history is clear. | git-release |
| R7 | info | `tasks/4e/lessons.md:32-37` | L4e.2 says the flags are "unproven": `--agent` and `--output-format text` are confirmed to exist in CLI 3.2.0 `db diff --help` (above); whether they alone yield SQL remains for AC31, and the judge fails closed either way. | - |

No blocker. Open questions Q1-Q6 and the out-of-scope handoffs (`rules/database-and-deploy.md`, `PROJECT_CONTEXT.md`
env table, `roles/README.md` ownership of `supabase/production/**`, deletion of the old secrets and the closing
decision for `2026-11-25-4d-supabase-secrets-accepted-until-step4.md`) are tracked in the brief's "Open questions" and
"Handoff notes for others"; R2 and R3 add the two items that are tracked only in the security gate so far.

Before merge: the person's `framework-change-approved` label after the last protected-path push; then `merge-gate` on
the final head.

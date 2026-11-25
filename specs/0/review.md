Result: APPROVE

# Code review: task 0, PR #2 (gate hardening)

- **Reviewer:** code-reviewer (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-hardening` @ `73f1e68`, diff `git diff origin/main...HEAD` (16 files, +267/-117)
- **Security gate:** `specs/0/security-gate.md` = PASS (pass 3, commit `5db044c`, after the last code commit `09a0f56`). Read; this review was done independently.

## Verdict

The PR does what the brief (AC3, AC5, AC8 as updated) and the handoff say. No blockers. No should-fix
findings beyond the items already recorded as open for the person in `tasks/lessons.md` L11; this PR
does not make any of them worse (before it, a PR could edit the `gate` job and `gate-check.sh` that
judged it; now that is only true for this PR itself, through the temporary `gate` job). Nits below are
doc wording only and can go in the follow-up PR that removes the temporary `gate` job.

## What was checked

| Claim | Evidence | Result |
|---|---|---|
| `gate.yml` `merge-gate` on `pull_request_target`, scripts from main, PR head only read with git | `gate.yml:6-9`, `:27-30` (checkout without `ref`, so the base commit; `persist-credentials: false`), `:31-39` (fetch `refs/pull/N/head`, pinned to `head.sha`), `:40-46`. No step installs or runs PR content. | OK |
| Always judged against `origin/main`, other bases fail, re-runs on `edited` | `gate.yml:9` (`edited` in types), `:20-26` (base_ref != main exits 1), `:46` (`--base origin/main` hard-coded) | OK |
| Check name matches branch protection | js-yaml parse: gate.yml jobs `["merge-gate"]` (no `name:`, so the check is `merge-gate`); ci.yml jobs `verify, db-check, secrets, gate` | OK |
| Workflow YAML valid | `js-yaml` (node_modules) loads ci.yml, gate.yml, drift.yml; triggers as intended | OK |
| gate-check.sh: first non-empty line is the Result | scratch clone: `\nResult: CHANGES_REQUESTED\nResult: APPROVE` FAILs; CRLF + `**Result:** APPROVE` passes | OK |
| Fails without a merge-base | `--base nonexistent` and `--head deadbeef` both FAIL rc 1 | OK |
| Argument checks | `--base` (no value) rc 2 "needs a value"; `--foo bar` rc 2 "unknown argument"; `--branch main` FAIL bad branch name | OK |
| Reads the head with git, not the worktree | scratch clone checked out on `origin/main`, `--head <sha> --branch ci/0-test`: judged the PR commit correctly | OK |
| Freshness | gate file in the same commit as code FAILs; gate file in its own later commit passes; `tasks/**` commits after the gate don't invalidate it (S5, L11) | OK |
| `framework-change-approved` for `.github/workflows`, `scripts`, `rules`, `roles`, `ORCHESTRATOR.md` | this branch without the env var lists all 11 protected files and FAILs; `FRAMEWORK_CHANGE_APPROVED=1` passes that check | OK |
| On this branch now | `gate-check.sh`: FAIL only on review freshness (fixed by this commit) and the missing label (the person's) | as expected |
| Temporary `gate` job kept, checks out the PR head | `ci.yml:102-120`, `ref: head.sha`, `fetch-depth: 0`, label env; ci.yml triggers include `labeled`/`unlabeled` | OK |
| verify.sh gitleaks `--exit-code 99` | `verify.sh:155-160`: 0 ok, 99 leaks, anything else "could not run" | OK (gitleaks not installed locally, so the 99 path wasn't exercised; the `secrets` CI job is unchanged) |
| drift.yml: `environment: production`, step-level secrets, `persist-credentials: false`, no diff in log/issue, fails closed | `drift.yml:24`, `:31-33`, `:36-39` (presence only), `:59-69`, `:73-84` (count + hash only, passes on exact `0` only), `:93-95` (issue links the run) | OK |
| CLI flags exist in the pinned Supabase CLI 3.2.0 | `npx --no-install supabase db diff --help`: `--remote`, `--schema` present; `link --help`: `--project-ref` present (DB password from env is unconfirmed, as the comment at `drift.yml:63` says; covered by Blocked item 2, the first green drift run) | OK |
| AGENT_RULES 18a | `rules/AGENT_RULES.md:41` | OK |
| Docs consistent with code | ORCHESTRATOR 3a, roles/code-reviewer.md, security.md, devops-cicd.md, git-release.md, brief AC5/AC8, decisions.md all say `merge-gate`, first non-empty line, label, no bypass | OK, except the nits below |
| PROJECT_CONTEXT deploy path | `PROJECT_CONTEXT.md:14` `Supabase GitHub integration` (matches bootstrap-check's integration test and devops-cicd.md:50); no project ref or secret in any changed file | OK |
| Scripts syntax | `bash -n` on gate-check.sh and verify.sh | OK |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker): `verify.sh: PASS 18/18 (1 skipped)` | OK |
| Scope | all changed files are inside the brief's allowed paths (`tasks/*` and this task's gate files are always allowed) | OK |

## Findings

No `blocker`, no `should-fix`.

| # | File:line | Severity | What is wrong | Owner |
|---|---|---|---|---|
| N1 | `roles/devops-cicd.md:48` | nit | Says gate.yml passes `--head refs/pr/head`; `gate.yml:46` passes `--head "$HEAD_SHA"` (same commit after the pin check at `:37`, but the doc should match the code). | the person (roles/**), via devops-cicd |
| N2 | `scripts/gate-check.sh:5-9` | nit | Header still says each file "has a line" `Result: ...`; the script now requires the first non-empty line, fails without a merge-base, and checks the `framework-change-approved` label. Update the header so a reader doesn't assume the old semantics. | devops-cicd |
| N3 | `.github/workflows/ci.yml:3` | nit | Header lists the required checks as `verify, db-check, secrets` plus `merge-gate`, while until the follow-up PR the required check is still `gate` (this file's job). Fine once the follow-up removes the job; mention it there. | devops-cicd |
| N4 | `tasks/0/TASK_BRIEF.md:7` | nit | Branch field still says `main` (Phase 0 initial commit); later work happens on `ci/0-*` branches through PRs. Add the current branch. | git-release |
| N5 | `.github/workflows/gate.yml:36` | nit | The PR head is fetched without credentials (`persist-credentials: false`). Works because the repo is public; if it ever goes private this step fails (closed, so safe), and the fix is an explicit token for the fetch only. Worth one comment line. | devops-cicd |

## Open items for the person (not blockers here, already in L11)

S14 (check-name spoofing, both variants), S5, S15, S16, S19, S20/S21, S26, S27. With the Supabase GitHub
integration connected, S14 is a path to a production write; `PROJECT_CONTEXT.md:104` and brief Blocked
item 5 already require the person's decision before the first real table.

## Before merge (from the brief, not review findings)

The person adds `framework-change-approved`; the temporary `gate` job then goes green. After merge: the
person makes `merge-gate` required (bypass off), then the follow-up PR removes the `gate` job; git-release
gets one green drift run on main.

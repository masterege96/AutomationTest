Result: PASS

# Security gate: task 0, PR #2 (gate hardening), re-run

- **Reviewer:** security (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-hardening` @ `157efb0`, diff `git diff origin/main...HEAD` (base `main` @ `35a461c`)
- **Previous gate:** `330e6c9` (FAIL for F1). This re-run reviews the whole PR diff again, with focus on `157efb0`.

F1 is closed. `157efb0` adds no new exploitable hole. The open items in `tasks/lessons.md` L11 are
residual risks that already existed before this PR (the old gate was fully PR-controlled). They are
not regressions, so they don't fail this PR. They are recorded below for the person to decide. One
of them (S14) is wider than L11 says. See the base-branch variant below.

## Applicable baseline rows

Row 13 (brief), plus the merge-approval control (ORCHESTRATOR 3a) this PR changes. Rows 1-12 and
14: nothing new in this diff (no app code, routes, tables or migrations).

### Row 13: `.env` in Git

| Control | Where | Proof | Result |
|---|---|---|---|
| verify.sh gitleaks exit mapping | `scripts/verify.sh` (gitleaks block) | Unchanged since the first pass: 99 = leaks, other non-zero = could not run, both fail. gitleaks isn't installed locally, so the fallback scan ran and passed. | PASS |
| CI secret scan | `ci.yml` `secrets` job | unchanged | PASS |
| no `.env` tracked | verify.sh | "no .env files tracked" PASS | PASS |
| No project ref, keys or passwords in docs | `PROJECT_CONTEXT.md:12` | Only the project name and region are written. Grep of all `*.md` for `*.supabase.co` hosts, JWTs, `sb_secret`/`sb_publishable`: no hits. | PASS |

### Merge-approval control (`gate.yml` + `gate-check.sh`)

| Control | Where | Proof | Result |
|---|---|---|---|
| F1: always judged against `main` | `gate.yml:46` | `--base origin/main` is hard-coded and no longer comes from `github.base_ref`. Scratch clone: the first gate's attack (head = `staging` + unreviewed code + a `tasks/**` commit) gives `gate-check: PASS` with `--base origin/staging` and `FAIL` (both freshness checks) with `--base origin/main`. | PASS |
| F1: other bases fail | `gate.yml:20-26` | `BASE_REF` is passed via `env:` and quoted. Any value other than `main` exits 1 before checkout. The `::error::` text can't inject a workflow command because branch names can't contain newlines. | PASS |
| F1: a retarget re-runs the gate | `gate.yml:9` | `edited` is added. GitHub sends it when the base changes, and the run uses `main`'s `gate.yml`. Title or body edits also trigger a re-run, which does no harm. | PASS |
| S17: judges the reported commit | `gate.yml:31-39`, `:43`, `:46` | `HEAD_SHA` comes from `github.event.pull_request.head.sha` via `env:` and is quoted. It is a 40-hex value set by GitHub, so it can't inject anything. The fetched `refs/pr/head` must equal it, otherwise exit 1. `--head "$HEAD_SHA"` then resolves to the fetched object. Scratch clone: `git cat-file`/`git show "$SHA:path"`, `merge-base` and `log MB..SHA` all work on a detached base checkout with the SHA. Bad values (`deadbeef;id`) give FAIL "missing", and an empty value exits 2. | PASS |
| Concurrency | `gate.yml:12-14` | One group per PR, `cancel-in-progress`. A cancelled run is not a success, and the newest event gets its own run. | PASS |
| Gate code from base, PR code never executed | `gate.yml:1-46` | Unchanged from the first pass: `pull_request_target`, `contents: read`, no secrets, `persist-credentials: false`. The PR is only read with git. The action pin `3d3c42e…` matches v7.0.1. | PASS |
| Verdict line, freshness, label | `gate-check.sh:34-73` | Unchanged since the first pass, which ran the scratch tests. Local run on this branch: FAIL as expected. This file's old first line was FAIL, both gate files are older than `157efb0`, and the label is missing (11 files listed). | PASS |

### Drift workflow changes (`157efb0`)

| Check | Where | Proof | Result |
|---|---|---|---|
| Diff kept out of the public log (S18) | `drift.yml:73-78` | stdout goes to `diff.sql` and stderr to `diff.err`. Neither is printed on success. The log gets only a line count and a 12-hex sha256. The issue body (`:94`) links the run and has no diff. | PASS |
| Judged by content | `drift.yml:77-83` | Step copied into a scratch script with a fake CLI. Empty output: `0`, `drift=no`, exit 0. Comments, blank lines and CRLF only: `0`, pass. One SQL line: `1`, `drift=yes`, exit 1. Stderr noise plus SQL: drift. CLI exit 1 or 3: `::error::… did not run`, exit 1, no `drift` output, so no issue (the run is red). | PASS (see S22) |
| CLI error output | `drift.yml:74` | `tail -20 diff.err` only runs on failure. Registered secrets (token, password, project id) are masked in the whole job log, so a `db.<ref>.supabase.co` host would show as `***`. | PASS (see S23) |

## Automated results (local, HEAD `157efb0`)

| Check | Result |
|---|---|
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker) | `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) |
| `bash scripts/gate-check.sh --base origin/main --head HEAD --branch ci/0-gate-hardening` | FAIL as expected: this file's first line was `Result: FAIL` before this commit, both gate files are older than `157efb0`, and the `framework-change-approved` label is missing. |
| Supabase security advisors | N/A: no cloud project is linked to this repo yet, and none was touched |
| RLS check | verify.sh static check PASS, `supabase test db` PASS (no tables) |

## Findings

### FAIL-worthy

None. F1 (from `330e6c9`) is closed by `gate.yml:9`, `:20-26` and `:46`.

### Should-fix (residual risks; not regressions of this PR unless stated)

| # | File:line | Severity | Problem | Fix | Owner |
|---|---|---|---|---|---|
| S14 (open, wider than L11 says) | `gate.yml` (all), branch protection; `tasks/lessons.md` L11 | High (pre-existing) | **Check-name spoofing.** Any GitHub Actions job named `merge-gate` reports under the same check name and the same app as the real gate. L11 names one variant: a `pull_request` job in the PR head. There is a second one that L11's suggested fix doesn't catch. Push a branch `x` whose `gate.yml` (`pull_request_target`) always passes. Open the PR (head = `main` + code) with base `x`. The `pull_request_target` workflow comes from the **base** branch, so `x`'s spoof runs. The `main`-only step at `:20-26` exists only in `main`'s copy, so it never runs. The spoof reports green on the head SHA. Retarget to `main`: the real gate re-runs on `edited` and fails. Then re-run the old spoof run (a re-run keeps the original event and workflow) to get the newest `merge-gate` result. The PR head tree has no spoof workflow, so a scan of the head for `merge-gate` jobs doesn't see it. Not verified on GitHub (no pushes allowed): which result counts and how re-runs behave are GitHub behaviors. Who could do it: anyone with push access (agents). Fork authors can't merge. | Partial fixes: (a) gate-check FAILs when any workflow in the PR head other than `gate.yml` defines `merge-gate`/`gate` (covers the head variant). (b) A ruleset that limits who can create branches, or the person checks a PR's base history before merging (covers the base variant). A full fix needs a check source that workflows can't imitate (a GitHub App or an org-level required workflow). The person decides and records the accepted risk in `tasks/decisions.md`. `ORCHESTRATOR.md:69-70` should name both variants. | devops-cicd; the person decides |
| S5 (open) | `gate-check.sh:51` | Medium (pre-existing) | A PR that changes only `tasks/**` (including `tasks/decisions.md`) passes with stale gate files. | As in L11: protect `tasks/decisions.md` and require gate commits in `MB..HEAD` even when nothing else changed. | devops-cicd |
| S15 (open) | `gate-check.sh:64` | Medium (pre-existing) | The protected-path list misses `.gitleaks.toml`, the rest of `.github/**`, `package.json`/lockfile, `supabase/config.toml`, `templates/`, `AGENTS.md`. | Extend the pathspec (L11). | devops-cicd |
| S16 (open) | `gate-check.sh:66`, `gate.yml:44` | Medium (pre-existing) | The label isn't tied to a commit, so pushes after labeling still pass. | The person removes and re-adds the label after each push, or the gate records the approved SHA. | the person; devops-cicd |
| S19 (open) | `drift.yml:24` | Medium (pre-existing) | Nothing checks that the `production` environment exists with a main-only policy, or that there are no repo-level `SUPABASE_*` secrets. | bootstrap-check, read-only `gh api`. | devops-cicd |
| S20/S21 (open) | `roles/git-release.md:19`, `ORCHESTRATOR.md:69` | Low | `git-release.md:19` "Owns … branch protection, labels, merge settings" contradicts AGENT_RULES 18a and `:32`. `ORCHESTRATOR.md:69` "can't edit the gate that judges it" overstates the control (now partly qualified). | Reword. | the person |
| S22 (new in `157efb0`) | `drift.yml:77-79` | Low | Fails open if the count isn't a number. If `grep` errors (exit 2, empty stdout), `CHANGED_LINES` is empty, `[ "" -gt 0 ]` errors, the `if` is false, and the step prints "No drift." with exit 0 (reproduced with `bash -e`). This is unlikely because the shell always creates `diff.sql`, but a drift check should only pass on a proven zero. | `if [ "$CHANGED_LINES" != "0" ]; then` treat it as drift/fail (or `case` on `^[0-9]+$` first). | devops-cicd |
| S23 (new in `157efb0`, accepted) | `drift.yml:74` | Low | On a CLI failure, the last 20 stderr lines go to the public log. Registered secrets are masked, but values derived from them aren't (for example a URL-encoded password, or a pooler user `postgres.<ref>` split differently). | Keep it, or print only the first error line. Re-check the first real failing run's log. | devops-cicd |
| S24 (info) | `drift.yml:78` | Info | The 12-hex sha256 of a non-empty diff lets someone confirm a guessed small diff. Negligible. | None needed. | none |
| S25 (new in `157efb0`) | `PROJECT_CONTEXT.md:12`, `:14` vs `:104`, `tasks/0/TASK_BRIEF.md` Blocked (1) | Low (doc/scope) | The deploy path is now "Supabase GitHub integration" and a cloud project is named. But `:104`, AC3 and Blocked (1) still say this waits for the person, and `tasks/decisions.md` has no entry. Once the integration is ON, every merge to `main` applies migrations to production. Then `merge-gate` is the last control before a production write, and S14/S5 become paths to production. | Record the person's decision in `tasks/decisions.md` and update `:104`/Blocked. Close S14/S5 or accept them before turning on "Deploy to production". | git-release; the person |

### Temporary state (unchanged from the first pass)

Until this PR is merged, the required check is still the old `gate` job in `ci.yml`, which runs the
PR's own `gate-check.sh`. For this PR it proves nothing. The real control for PR #2 is the person
reading the diff and adding `framework-change-approved` (Blocked 4). Conditions: (1) right after
the merge, the person makes `merge-gate` the required check instead of `gate` and turns bypassing
off; (2) the follow-up PR that removes the `gate` job is merged under the new `merge-gate`.

## Secret exposure

None found. No secret values were read, used or printed. No Supabase cloud, GitHub settings or
labels were touched, and nothing was pushed.

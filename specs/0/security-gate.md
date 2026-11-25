Result: FAIL

# Security gate: task 0, PR #2 (gate hardening)

- **Reviewer:** security (fresh context, no builder conversation)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-hardening` @ `5a28aaf`, diff `git diff origin/main...HEAD` (base `main` @ `35a461c`)
- **Scope reviewed:** `.github/workflows/gate.yml` (new), `.github/workflows/ci.yml`, `.github/workflows/drift.yml`, `scripts/gate-check.sh`, `scripts/verify.sh`, `rules/AGENT_RULES.md`, `ORCHESTRATOR.md`, `roles/{security,code-reviewer,devops-cicd,git-release}.md`, `tasks/0/TASK_BRIEF.md`, `tasks/decisions.md`, plus what they interact with on `main`.

One hole in the new trusted gate (F1) lets a PR reach `main` with a green `merge-gate` and no
fresh gate files and no `framework-change-approved` label. The fix is small. Everything else is
should-fix.

## Applicable baseline rows

Row 13 (brief) and the merge-approval control itself (ORCHESTRATOR 3a, the control this PR
changes). Rows 1-12 and 14 have nothing new in this diff (no app code, no route, no table, no
migration).

### Row 13: `.env` in Git

| Control | Where | Proof | Result |
|---|---|---|---|
| verify.sh gitleaks exit mapping | `scripts/verify.sh:156-161` | `--exit-code 99` makes 99 mean "leaks found"; gitleaks' own fatal errors exit 1 and now land in `*) could not run`, which is also `bad`, so both fail closed and are told apart. Mapping correct. gitleaks not installed locally, so the fallback scan ran (PASS). | PASS |
| CI secret scan | `ci.yml` `secrets` job (unchanged) | default exit code, any non-zero fails | PASS |
| no `.env` tracked | verify.sh | "no .env files tracked" PASS | PASS |

### Merge-approval control (gate.yml + gate-check.sh)

| Control | Where | Proof | Result |
|---|---|---|---|
| Gate runs from base, PR code never executed | `gate.yml:6-29` | `pull_request_target`, checkout of base with `persist-credentials: false`, `permissions: contents: read`, no secrets; PR head only fetched (`:23`) and read with `git cat-file`/`git show`/`git log`/`git diff --name-only` (no textconv, no hooks, no checkout). Scratch test: PR replacing `scripts/gate-check.sh` with `exit 0` is still judged by the base script and FAILs. | PASS |
| No script injection | `gate.yml:21-29` | PR number, `base_ref`, `head.ref` and the label boolean go through `env:` and quoted `"$VAR"`, never `${{ }}` inside `run:`. Branch `feat/9-evil$(id)\`id\`` printed literally; ID limited to `[A-Za-z0-9]+` (`gate-check.sh:28`), `feat/../../x` rejected. | PASS |
| Action pin | `gate.yml:16` | `git ls-remote --tags https://github.com/actions/checkout v7.0.1` = `3d3c42e5aac5ba805825da76410c181273ba90b1`, matches. | PASS |
| First non-empty line is the verdict | `gate-check.sh:38-40` | Scratch: `Result: PASS`, leading blank lines + CRLF, `**Result:** PASS`, extra spaces: PASS. `Result: FAIL` then `Result: PASS`, BOM, heading first, `PASSED`: FAIL. | PASS |
| Freshness | `gate-check.sh:47-58` | Scratch: code after gate (linear), backdated code commit, backdated side branch merged after the gate, gate edited inside the merge commit: all FAIL; re-gate in a later commit: PASS. | PASS |
| No merge-base fails | `gate-check.sh:47-49` | `--base nonexistent` → FAIL. | PASS |
| Label for framework paths | `gate-check.sh:61-73` | This branch: FAIL listing 11 files without the label; PASS on that line with `FRAMEWORK_CHANGE_APPROVED=1`. Rename out of `scripts/` still listed. | PASS |
| **Base branch the gate judges against** | `gate.yml:8`, `:26`, `:29` | **F1 below** | **FAIL** |

## Automated results (local, HEAD `5a28aaf`)

| Check | Result |
|---|---|
| `npm audit --audit-level=high` | `found 0 vulnerabilities`, exit 0 |
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker) | `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) |
| `bash scripts/gate-check.sh` | FAIL as expected: gate files older than the last code commit, label absent. With `FRAMEWORK_CHANGE_APPROVED=1`: only the two freshness FAILs remain. Bad args (`--base` without value, `--foo`) exit 2. |
| Supabase security advisors | N/A: no cloud project yet (unchanged from the PR #1 gate) |
| RLS check | verify.sh static check PASS, `supabase test db` PASS (no tables) |

## Findings

### FAIL-worthy

**F1. A PR can get a green `merge-gate` by being judged against a branch other than `main`,
then retargeted to `main`.**
`.github/workflows/gate.yml:26` takes `BASE_REF` from `github.base_ref` and `:29` passes
`--base "origin/${BASE_REF}"`; `:8` doesn't list the `edited` event, which is what GitHub sends
when a PR's base branch is changed.

How: push branch `staging` = `main` + unreviewed code (and/or workflow/script edits). Open the
task PR `feat/0-x` = `staging` + one commit under `tasks/**`, with base `staging`. The merge-base is
the tip of `staging`, so `LAST_CODE` is empty (only `tasks/**` changed) and the protected-path diff
is empty; `specs/0/security-gate.md` and `review.md` from PR #1 already say PASS/APPROVE. Result:
`merge-gate` PASS. Then change the PR's base to `main`: no `merge-gate` re-run (no `edited`
trigger), so the green check stays on the head SHA. `verify`, `db-check`, `secrets` don't depend on
the base (verify.sh diffs against `origin/main` and its scope check reads the PR's own brief, S5),
and the head is up to date with `main`, so the PR is mergeable with no fresh gate files and no
label. Reproduced in a scratch clone: the same head gives `gate-check: PASS` with
`--base origin/staging` and `FAIL` (both freshness checks + label) with `--base origin/main`. The
retarget-keeps-the-check step is GitHub behavior that I couldn't run here (no pushes); it is how
check runs work (bound to the head SHA, not the base).

Who could do it: any agent with push access (git-release merges, per `roles/git-release.md:8`).
This PR introduces it: the old gate always used `origin/main`.

Fix (devops-cicd; framework file, so the person approves): judge every PR against `main` no matter
what its base is, e.g. `gate.yml:29` `--base origin/main` (or the default branch via
`github.event.repository.default_branch` in `env:`), and add `edited` to `types` at `:8` so a
retarget re-runs the gate. Optionally FAIL outright when `BASE_REF` isn't `main`.

### Should-fix

| # | File:line | Problem | Why it matters | Fix | Owner |
|---|---|---|---|---|---|
| S14 | `.github/workflows/ci.yml` (any job), branch protection | **Check-name spoofing.** A PR can add a job named `merge-gate` to a `pull_request` workflow; it runs the PR's code and reports success under the same check name and the same app (GitHub Actions). The "expected source" setting can't tell two Actions workflows apart. If GitHub counts the newest run of that name (re-running the spoof after the real gate is easy), the real gate's FAIL, including the label check, is overridden. Not verified on GitHub. | It undoes the "a PR can't edit the gate that judges it" claim in `ORCHESTRATOR.md:69`. Not a regression: before this PR the whole gate was PR-controlled. | No clean fix for a personal repo (ruleset "require workflows" is org-only). Partial: make the trusted `gate-check.sh` FAIL when any workflow at the PR head other than `gate.yml` defines a job id or `name:` `merge-gate` (or `gate`). The person decides whether to accept the rest of the risk in `tasks/decisions.md`. | devops-cicd; the person decides |
| S5 (open, now reproduced) | `scripts/gate-check.sh:51` (`:(exclude)tasks/**`) | A PR changing only `tasks/**` passes `merge-gate` with no fresh gate files: it reuses any old PASS/APPROVE under `specs/<id>/` from `main`. Scratch: branch `feat/0-sneaky` adding a row to `tasks/decisions.md` → `gate-check: PASS`. | `tasks/decisions.md` is where the person "accepts" a high vulnerability (`roles/security.md` rule 3) or a framework change; it can be written and merged with no gate at all. | Add `tasks/decisions.md` to the protected paths (`:64`), and when `LAST_CODE` is empty still require both gate files to be committed in `MB..HEAD`. | devops-cicd |
| S15 | `scripts/gate-check.sh:64` | The protected list misses other control files: `.gitleaks.toml` (a PR can allowlist its own secret), `.github/**` outside `workflows/` (e.g. `CODEOWNERS`), `package.json` `scripts` and the lockfile (they run in `verify`), `supabase/config.toml`, `templates/**`, `AGENTS.md`. | Lets a PR weaken the checks that run on it without the person's label. | Extend the pathspec: `.github .gitleaks.toml package.json package-lock.json supabase/config.toml templates AGENTS.md tasks/decisions.md`. | devops-cicd |
| S16 | `scripts/gate-check.sh:66`, `gate.yml:28` | The label isn't bound to a commit. Once the person adds `framework-change-approved`, later pushes with more workflow/script changes still pass the label check (only the gate files must be redone). | The person's approval covers a diff they may not have seen. | Process: the person removes and re-adds the label after reviewing each push. Or record the approved head SHA (e.g. in the label-add comment) and compare. | the person (process); devops-cicd |
| S17 | `gate.yml:21-23` | Fetches `refs/pull/N/head` (whatever the head is *now*), not `github.event.pull_request.head.sha` (the commit the check is reported on). With fast pushes and no `concurrency`, a run can judge a newer commit than the one it reports on. | Low: the last push always gets its own run. Still, the check should judge exactly the commit it marks. | Pass `HEAD_SHA: ${{ github.event.pull_request.head.sha }}` via `env:`, fetch the PR ref, then FAIL unless `git rev-parse refs/pr/head` equals `$HEAD_SHA` (or `--head "$HEAD_SHA"`). Add `concurrency: merge-gate-${{ github.event.pull_request.number }}`, cancel in progress. | devops-cicd |
| S18 | `.github/workflows/drift.yml:72-73` | The issue no longer pastes the diff (good), but the step `tee`s the diff and `cat`s `diff.err` into the run log, and run logs of a public repo are public. `roles/devops-cicd.md` (step 5) and the issue text say the diff is kept out of public view. | Same reconnaissance value as S8 (production schema, a policy or RLS that differs from migrations); error text may carry host/user details. No secret values: registered secrets are masked (an URL-encoded password in an error would not be). | Don't print the diff: write it to a file, print only line count and a hash; the person runs `db diff` locally to read it. Or upload it as a short-retention artifact only if the repo is private. | devops-cicd (the person decides on visibility) |
| S19 | `drift.yml:24`, `tasks/0/TASK_BRIEF.md` Blocked (2) | `environment: production` on a job auto-creates the environment **without** branch restrictions if it doesn't exist yet; and if the secrets are put at repo level instead of in the environment, any same-repo PR workflow can read them (`ci.yml` runs on `pull_request`). Nothing checks either. | The protection described in the comment at `:22-23` depends on settings no script verifies. | bootstrap-check (read-only `gh api`): environment `production` exists, deployment branch policy = `main` only, and no repo-level secrets named `SUPABASE_*`. | devops-cicd |
| S20 | `roles/git-release.md:19` | "Owns ... GitHub repository settings: branch protection, labels, merge settings" contradicts AGENT_RULES 18a and the same file's line 32 ("the person sets it"). | An agent reading only the "Owns" list may change protection. | Reword `:19` to "labels (creating only); branch protection and merge settings are the person's (AGENT_RULES 18a)". | the person (roles/** owner) |
| S21 | `ORCHESTRATOR.md:69` | "A PR therefore can't edit the gate that judges it" is stronger than the behavior (F1, S14, S5). | Docs overstate the control. | After F1 and S14: "can't edit the gate script or workflow"; list S14 as accepted risk if it stays. | the person |

Temporary state (asked explicitly): while this PR is open, the required check is still the old
`gate` job (`ci.yml:107-120`), which runs the PR's own `gate-check.sh` from the PR head. For this
PR that check proves nothing: the PR controls the script. That is acceptable only because the
real control for PR #2 is the person reading the diff and adding `framework-change-approved`
(Blocked item 4), and `gate.yml` can't run before it is on `main`. Conditions: (1) right after the
merge the person swaps the required check `gate` → `merge-gate` and turns bypassing off, and (2) the
follow-up PR removing the `gate` job is merged under the new `merge-gate`. Until (1) is done, S1
from the PR #1 gate stays open for every PR. bootstrap-check should verify the required contexts
(S3, still open).

Checked and fine: AGENT_RULES 18a matches the gate (the label check trusts only the label, which
only the person adds) and the role docs; `ci.yml` temporary job uses `head.sha` only in `with:` and
the label boolean only in `env:`; drift secrets are now step-scoped to `link` and `db diff`
(`drift.yml:56-69`), the presence check passes only booleans (`:35-38`), checkout has
`persist-credentials: false`, and `npm ci` gets no secrets; `issues: write` is the only write
permission and it doesn't reach PR code (drift runs on schedule/dispatch only).

## Secret exposure

None found. No secret values were read, used or printed during this gate.

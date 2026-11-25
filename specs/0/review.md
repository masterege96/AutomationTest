Result: APPROVE

# Code review: task 0, drift artifact (`ci/0-drift-artifact`), re-run after the main merge

- **Reviewer:** code-reviewer (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-drift-artifact` @ `b4614f8` (security gate) on top of `772a10d` (merge of `origin/main` @ `05cc5d9`, PR #3). Merge-base with `origin/main` = `05cc5d9` = `origin/main`.
- **Why re-run:** the merge commit counts as a code change, so the previous review (`b228e84`, APPROVE, nits N1-N3, N5, N6) no longer counts.
- **Security gate:** `specs/0/security-gate.md` = PASS (`b4614f8`, after the merge). Read; this review was done independently.
- **Decision implemented:** `tasks/decisions.md:12` (repo stays public; a manual run with `upload_diff=true` may upload the raw diff as a 1-day artifact; schedule and default runs never expose it).

## Verdict

The merge is clean and changes nothing in the PR's own code: `drift.yml` is byte-identical to what
`b228e84` approved, both conflict resolutions keep both sides, and PR #3's changes (removal of the
temporary in-PR `gate` job, comments in `gate.yml` and `gate-check.sh`, item-3 wording in
`roles/devops-cicd.md`) do not touch anything drift.yml or its docs rely on. The drift.yml analysis
from `b228e84` (step order, conditions, gitleaks exit-code handling, failure-path table) still holds.
No blockers, no should-fix.

## Merge check

| Check | Evidence | Result |
|---|---|---|
| PR net change | `git diff --stat origin/main...HEAD`: `.github/workflows/drift.yml` (+40), `roles/devops-cicd.md` (1 line, item 5), `tasks/decisions.md` (+1 row), `specs/0/review.md`, `specs/0/security-gate.md`. Nothing else. | OK |
| drift.yml unchanged since last review | `git diff b228e84 HEAD -- .github/workflows/drift.yml`: empty | OK |
| What the merge brought in | `git diff b228e84 HEAD --stat`: `ci.yml`, `gate.yml`, `roles/devops-cicd.md`, `scripts/gate-check.sh`, `tasks/0/TASK_BRIEF.md`, `tasks/decisions.md`, `tasks/lessons.md` (all PR #3 = `05cc5d9`), plus `specs/0/security-gate.md` (the new gate). | OK |
| `tasks/decisions.md` | net change vs main is exactly one added row (`:12`, drift artifact); main's S14 row kept (`:13`). See N7 for order. | OK |
| `roles/devops-cicd.md` | `:48` has PR #3's item-3 `merge-gate` wording (`--head "$HEAD_SHA"`); `:53` has the branch's item-5 upload paragraph. Only item 5 differs from main. | OK |
| Conflict markers | `grep -rn '^<<<<<<<\|^=======$\|^>>>>>>>'` over the repo (excl. `.git`, `node_modules`): none. `git diff --check origin/main...HEAD`: clean. | OK |
| `specs/0/*` | branch's files kept; security gate re-run after the merge, this file rewritten after it. Each has exactly one `Result:` line, on line 1. | OK |

## PR #3 interaction with drift.yml and the docs

| PR #3 change | Effect on this PR | Result |
|---|---|---|
| `ci.yml`: in-PR `gate` job removed, header comment +1 line | No drift reference. `GITLEAKS_VERSION: 8.30.1` now at `ci.yml:19` (was `:18`), value unchanged, so `drift.yml:34` "same pin as ci.yml" still true. Same installer `scripts/ci/install-gitleaks.sh` (`ci.yml:43, 98`), not changed by PR #3. `ci.yml:101` still uses `gitleaks detect`, matching `drift.yml:110` (N5). | OK |
| `gate.yml`: comment only (credential-less fetch works because the repo is public) | Consistent with `tasks/decisions.md:12` (repo stays public). No behavior change. | OK |
| `scripts/gate-check.sh`: header comment only (first non-empty line rule, framework label) | Both gate files start with their `Result:` line; this PR touches `.github/workflows` and `roles`, so it needs `framework-change-approved`. | OK |
| `roles/devops-cicd.md` item 3 | Different paragraph from item 5; no overlap. | OK |
| `tasks/0/TASK_BRIEF.md`, `tasks/lessons.md` | Docs only; brief's allowed paths still cover this PR's files (verify.sh scope check passes). | OK |

## Other checks

| Check | Evidence | Result |
|---|---|---|
| YAML parses | js-yaml (node_modules): `ci` jobs `verify,db-check,secrets`; `gate` job `merge-gate`; `drift` job `drift`, 10 steps: 5 `diff` (id `diff`), 6 install gitleaks, 7 scan (id `scan`), 8 upload, 9 issue; `if:` expressions on 6-9 as approved in `b228e84` | OK |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker): `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) | OK |
| Docs match behavior | `roles/devops-cicd.md:53` and `drift.yml:96-98` agree with `drift.yml:79-126` (diff_ok after CLI exit 0, gitleaks clean, message at `:115`, 1-day retention, delete after download) | OK |

## Findings

No `blocker`, no `should-fix`. N1-N3, N5, N6 carried from `b228e84` (code unchanged); N7 new.

| # | File:line | Severity | What is wrong | Owner |
|---|---|---|---|---|
| N1 | `.github/workflows/drift.yml:135` | nit | Issue body says "The run log shows only a line count and hash" and points db-builder at a local `db diff`; a manual `upload_diff=true` run (gitleaks-checked) is the other way to see the diff. Optional one-line mention, still never pasting the diff. | devops-cicd |
| N2 | `.github/workflows/drift.yml:103-117` | nit | On a no-drift opt-in run, a gitleaks hit, a gitleaks error or an upload failure turns the run red with no issue. The error lines say why and a manual run has someone watching, so fine; but a hit means a secret-looking string sits in the production schema, worth following up by hand even with no drift. | devops-cicd |
| N3 | `.github/workflows/drift.yml:123` | nit | Fixed artifact name `drift-diff` with the default `overwrite: false`; unverified whether "Re-run failed jobs" conflicts with the first attempt's artifact. If it does, the re-run's upload fails (closed, harmless); `overwrite: true` would avoid it. | devops-cicd |
| N5 | `.github/workflows/drift.yml:110` | nit | `gitleaks detect --no-git --source` is the legacy form (current: `gitleaks dir`). Works in the pinned 8.30.1 and matches `ci.yml:101`; revisit when the pin is bumped. | devops-cicd |
| N6 | `.github/workflows/drift.yml:110, 116` | nit | All gitleaks output goes to `/dev/null`, so "gitleaks could not run (exit N)" gives only the exit code to debug from. Deliberate (public log, S18) and fails closed; noting it so a future fix does not just drop the redirect. | devops-cicd |
| N7 | `tasks/decisions.md:12-13` | nit | The file says "Newest last", but the merge put the drift-artifact row before main's S14 row, which landed on main first. Same date, so harmless; if order matters, move `:12` below `:13` in a later docs change (not worth a re-gate now). | git-release |

## Carried

Security items from the PR #2 gates (S14, S5, S15, S16, S19, S20/S21, S23, S24, S26, S27) are
unchanged by this PR. S14 is now recorded as accepted for the pilot (`tasks/decisions.md:13`). S19
(nothing verifies the `production` environment's main-only policy) also guards this artifact path.

## Before merge

The person adds `framework-change-approved` (this PR changes `.github/workflows/drift.yml` and
`roles/devops-cicd.md`).

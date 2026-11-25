Result: APPROVE

# Code review: task 0, PR #3 (gate cleanup)

- **Reviewer:** code-reviewer (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-cleanup` @ `27b7b64` (code commit `ece4704`, security gate `27b7b64`), diff `git diff origin/main...HEAD` excluding `specs/0/security-gate.md` (7 files)
- **Security gate:** `specs/0/security-gate.md` = PASS, committed in `27b7b64` after the last code commit `ece4704`. Read; this review was done independently.

## Verdict

The PR does what it claims: the temporary in-PR `gate` job is gone, `merge-gate` (gate.yml, from main) is
the only approval check, and the other changes are comments and docs. No blockers. One should-fix (the
brief's Handoff/Blocked sections weren't updated for PR #3) and some nits; none needs another round.

## What was checked

| Claim | Evidence | Result |
|---|---|---|
| `gate` job removed from ci.yml, nothing depends on it | `ci.yml` diff removes lines 102-120 only; no `needs:` anywhere refers to `gate` | OK |
| Workflow YAML parses, job names the docs rely on unchanged | js-yaml (node_modules): ci.yml jobs `verify, db-check, secrets`, trigger `pull_request` unchanged; gate.yml `merge-gate`, `pull_request_target` incl. `edited`; drift.yml `drift`. Matches ORCHESTRATOR 3a (`:83-85`), brief AC5/AC8, roles/devops-cicd.md:45-48 | OK |
| ci.yml header accurate | `ci.yml:3-4` lists `verify, db-check, secrets` + `merge-gate`, notes the old `gate` job's removal and why | OK |
| gate.yml change is comment-only | `gate.yml:31-32` are `#` lines; the fetch step is unchanged | OK |
| gate-check.sh change is comment-only and the header now matches the code | Diff touches only `#` lines 5-12; `bash -n` OK. First non-empty line (`:40-43`), no merge-base = FAIL (`:50-52`), later-commit freshness (`:54-60`), protected paths + `FRAMEWORK_CHANGE_APPROVED=1` (`:64-76`) all as described. Small omissions: see N7 | OK |
| roles/devops-cicd.md `--head` wording | `:48` now says fetched to `refs/pr/head`, checked against and passed as `--head "$HEAD_SHA"`; matches `gate.yml:38-41`, `:48` | OK |
| Brief Branch field | `TASK_BRIEF.md:7` lists `main` (first two commits) and the three PR branches | OK |
| S14 decision recorded | `tasks/decisions.md:12`, same form as the other person decisions, names both variants and the planned fix | OK |
| L11 link, L12 | `lessons.md:139` links the decision; L12 at `:159-171` | OK (see N6, N8) |
| L12 CLI claim | `npx --no-install supabase --version` = 3.2.0; `supabase link --help`: argument "Project ref, or the name (or UUID) of a branch of the currently linked project. Values that are exactly 20 lowercase letters are always treated as project refs"; `--project-ref` "Project ref ... or the name of one of its branches". drift.yml:63 passes the secret as `--project-ref`. The quoted error lists `SUPABASE_PROJECT_ID` among the sources it checked, which supports "the CLI also reads it from the environment" | OK (wording, N8) |
| Scope | verify.sh scope check PASS; every changed file is in the brief's allowed paths or `tasks/**` / this task's gate files | OK |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker): `verify.sh: PASS 18/18 (1 skipped)` | OK |

## Previous review nits (PR #2 review, N1-N5)

| Nit | Status |
|---|---|
| N1 `roles/devops-cicd.md:48` `--head refs/pr/head` vs `"$HEAD_SHA"` | Fixed, wording matches gate.yml |
| N2 `scripts/gate-check.sh` header semantics | Fixed (first non-empty line, merge-base FAIL, label); two small gaps left, N7 |
| N3 `ci.yml:3` required-checks header | Fixed; the job is gone and the header says so |
| N4 brief Branch field | Fixed |
| N5 gate.yml credential-less fetch comment | Fixed (`gate.yml:31-32`) |

## Findings

No `blocker`.

| # | File:line | Severity | What is wrong | Owner |
|---|---|---|---|---|
| F1 | `tasks/0/TASK_BRIEF.md:95`, `:100` | should-fix | No Handoff entry for PR #3 (AGENT_RULES 24: changed files, what was verified, what's left). "Left to do" still says "After PR #2 merges: a tiny PR removing the temporary `gate` job", which this PR is. Blocked item 2 (green drift run) doesn't mention it now fails at `supabase link` (L12), and item 5 (decide L11 risks) doesn't say S14 is accepted for the pilot (decisions.md:12). Append a PR #3 handoff entry and update those Blocked items. Doesn't block merge; do it in this PR or the next task-0 PR. | git-release / devops-cicd |
| N6 | `tasks/lessons.md:139-140`, `:151` | nit | L11's S14 line still ends "Suggested: ... or the person accepts the risk" although it is now accepted; the "S14 second variant" bullet (`:151`) isn't marked accepted, though decisions.md:12 covers it. One "(accepted, see S14 above)" would avoid a reader thinking it's still open. | devops-cicd |
| N7 | `scripts/gate-check.sh:8-9` | nit | Header says "the last code change" without saying `tasks/**` commits don't count as code (`:54` excludes them, the known S5 gap); it also doesn't mention that a bold `**Result:** PASS` first line is accepted (`:42`). Worth half a line each so the header is complete. | devops-cicd |
| N8 | `tasks/lessons.md:163-164` | nit | "treats ... anything else as a branch name" goes slightly further than `link --help`, which only says 20-lowercase-letter values are always project refs (other values may be a ref or a branch). The diagnosis and fix stand: the error shows the value was resolved as a branch. Suggest "treats ... as a project ref; other values can be read as a branch name". | devops-cicd |

## Before / after merge (not review findings)

- The person adds `framework-change-approved` (this PR changes `.github/workflows`, `scripts`, `roles`).
- If branch protection on `main` still lists `gate` as a required check, the person removes it (security's note too): no workflow produces it any more. Not checked here; GitHub settings are out of scope.
- L12: the person fixes the `SUPABASE_PROJECT_ID` environment secret; then one green drift run on main (Blocked item 2).

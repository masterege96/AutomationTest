Result: APPROVE

# Code review: task 0 (Phase 0 bootstrap)

- **Reviewer:** code-reviewer (fresh context, no builder or security conversation)
- **Date:** 2026-11-25
- **Reviewed:** branch `ci/0-phase0-fixes` @ `a09cd67`, full tree, with extra attention to `git diff origin/main...HEAD` (`d2a77b5`, `10f8be1`, `1c80e60`, `195834a`; `a09cd67` is the security gate only).
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `roles/README.md`, `PROJECT_CONTEXT.md`, `tasks/0/TASK_BRIEF.md`, `ORCHESTRATOR.md`, `roles/git-release.md`, `roles/devops-cicd.md`, `rules/database-and-deploy.md`, `specs/0/security-gate.md` (PASS), `tasks/lessons.md`, `tasks/decisions.md`. No `schema.md`, `threat-model.md` or `test-plan.md` exist; none is required for Phase 0 (no table, no auth, no feature).

## Checks run locally (read-only)

| Command | Result |
|---|---|
| `bash -n` on `scripts/verify.sh`, `bootstrap-check.sh`, `gate-check.sh`, `ci/install-gitleaks.sh` | all parse |
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase on 55420-55429) | `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, not required) |
| `bash scripts/bootstrap-check.sh` | `FAIL 1 of 31` (only "DB deploy path connected", accepted: waits on the person) |
| `bash scripts/gate-check.sh` (before this file existed) | FAIL on `review.md` missing, as expected |
| `npx supabase --version`, `db diff --help`, `db lint --help`, `link --help` | CLI 3.2.0; `db diff --remote --schema` and `db lint --level error --fail-on error` exist, so the commands in `ci.yml` and `drift.yml` are real for the pinned CLI |
| gate-check simulation in a scratch clone (PR branch with gates after code; `main` advanced; checkout of a `--no-ff` merge of the PR into `main`, which is what `actions/checkout` gives on `pull_request`) | FAIL on the merge ref; PASS on the PR head; PASS on the merge ref after rebasing the branch. See R1. |

## Acceptance criteria

| AC | Met? | Evidence |
|---|---|---|
| AC1 | yes | root commit `d3aa366` holds only `.gitattributes` (`* text=auto eol=lf`) and `.gitignore` (`.env*`, `!.env.example`) |
| AC2 | yes | `app/`, `public/`, `next.config.ts`, `supabase/config.toml`, framework `scripts/ rules/ roles/ templates/ ORCHESTRATOR.md` tracked |
| AC3 | yes | `PROJECT_CONTEXT.md:9` hosting type, `:13` Deploy path line as in the template |
| AC4 | yes | `.nvmrc` 24.11.0, `engines`, `packageManager` npm@11.6.1, `supabase` 3.2.0 exact, lockfile tracked, scripts `typecheck lint test build` |
| AC5 | yes | PR template, `CHANGELOG.md` 0.1.0, `ci.yml` jobs `verify db-check secrets` (+ `gate`), `drift.yml` nightly read-only; actions pinned to SHAs, gitleaks 8.30.1, CLI from lockfile |
| AC6 | yes | `supabase/migrations/20261125104017_init.sql` (`select 1;`), `supabase/tests/00_bootstrap_test.sql` (3 pgTAP assertions, passes) |
| AC7 | yes | local verify.sh PASS 18/18 (above) |
| AC8 | partly | pushed and protected; GitHub still shows 1 review and no `gate` check (accepted, the person changes it). The AC text itself is now out of date, see R5. |
| Row 13 | yes | `.gitignore`, gitleaks in `secrets` job and in verify.sh |

Scope: every changed file is inside the brief's allowed paths (verify.sh scope check PASS). The edits to `rules/`, `roles/` and `ORCHESTRATOR.md` are person-owned files; `tasks/lessons.md:114` says the person approved them, see R6.

## Findings

Security's findings S1-S13 in `specs/0/security-gate.md` are not repeated here. I agree in particular with S3 (bootstrap-check doesn't check the required check names) and S4 (gate-check accepts the verdict on any line); both are correctness issues too.

### R1. should-fix: `gate` falsely fails whenever `main` has moved since the branch point
- **Where:** `scripts/gate-check.sh:37` with `.github/workflows/ci.yml:110-112`
- **What:** On `pull_request`, `actions/checkout` checks out the merge commit of the PR into `main` (`refs/pull/N/merge`). When `main` has commits the branch doesn't have yet, that merge commit isn't TREESAME to either parent, so `git log "$MB"..HEAD -- . ':(exclude)…'` returns it first and `LAST_CODE` becomes the merge commit. No gate commit can ever be its descendant, so both gates FAIL with "re-run that gate in its own commit". Re-running the gates won't help, because only a rebase does (reproduced in a scratch clone: FAIL on the merge ref, PASS on the PR head, PASS after rebase). The message sends security and code-reviewer into pointless re-runs that count toward the 3-bounce rule (ORCHESTRATOR §4).
- **Fix:** run gate-check against the PR head: `ref: ${{ github.event.pull_request.head.sha }}` on the `gate` job's checkout (keep `fetch-depth: 0`). Or, in the script, use `HEAD^2` when HEAD is a merge whose first parent is the base. If staying behind `main` should fail on purpose, say "branch is behind main: rebase" instead.
- **Owner:** devops-cicd

### R2. should-fix: gate-check silently skips the ordering check when the base isn't found
- **Where:** `scripts/gate-check.sh:35-36`
- **What:** If `git merge-base "$BASE" HEAD` fails (shallow clone, no `origin/main`, a typo in `--base`), `MB` is empty and the whole "gates were written after the last code change" check is skipped, so the script reports PASS on the two `Result:` lines alone. This merge-approval check fails open. CI uses `fetch-depth: 0` today, so it doesn't fire yet, but one changed checkout line would turn it off silently. verify.sh handles the same case with a required skip (`verify.sh:116`).
- **Fix:** if `MB` is empty, `FAIL` ("base $BASE not found; fetch it"). Also guard `--base` without a value (`:14`, `$2` is unbound under `set -u`).
- **Owner:** devops-cicd

### R3. should-fix: gitleaks exit 1 still can't tell "found secrets" from "failed to run"
- **Where:** `scripts/verify.sh:155-160`
- **What:** The L8 fix treats exit 1 as "found secrets" and any other code as "could not run". gitleaks exits 1 on leaks by default **and** on fatal errors (bad config, not a git repo, git missing), so an error still shows up as "gitleaks found secrets. STOP and tell the person", which under AGENT_RULES §15 stops all work as a secret exposure. Lesson L8 (`tasks/lessons.md:94`) already says exit 1 only means leaks when `--exit-code` is set; the fix didn't set it.
- **Fix:** add `--exit-code 99` (any value gitleaks doesn't use) and map 99 to "found secrets", 0 to PASS, anything else to "could not run (exit N)". Keep the output tail.
- **Owner:** devops-cicd

### R4. should-fix: task brief Handoff and Blocked sections don't match the branch
- **Where:** `tasks/0/TASK_BRIEF.md:87-89`, `:93`
- **What:** The only Handoff entry still reports `verify.sh: FAIL 1/17` and lists L1/L2/L3/L8 fixes and the L10 decision as left for the person. All of those landed in `10f8be1` and `195834a`, and there's no Handoff entry for those commits. The Blocked "Missing" line still lists "verify.sh fixes L1, L8; reviewer decision L10". AGENT_RULES §20 and §24 need the current verify.sh summary line and what changed. git-release reads this brief when it merges.
- **Fix:** append a Handoff entry for the fix commits with `verify.sh: PASS 18/18 (1 skipped)`, the CI run on the branch, and what's left (deploy path, drift secrets and first run, branch protection to 0 reviews + `gate`). Trim the Blocked line to what is still missing.
- **Owner:** git-release + devops-cicd (the builders of task 0)

### R5. should-fix: AC5 and AC8 describe the old approval model
- **Where:** `tasks/0/TASK_BRIEF.md:22`, `:25`
- **What:** AC8 asks for "1 review" and required checks `verify, db-check, secrets`. AC5 lists only those three CI jobs. After the L10 decision (`tasks/decisions.md:7`, `ORCHESTRATOR.md` §3a, `roles/git-release.md` Phase 0 outputs), the target is 0 reviews plus a required `gate` check. As written, the person could set protection to exactly what AC8 says and still not match the framework, and bootstrap-check wouldn't notice (security S3).
- **Fix:** update AC5 to include `gate` and AC8 to "PR required, 0 approvals, required checks `verify`, `db-check`, `secrets`, `gate`; labels … `drift`", with a pointer to the decision.
- **Owner:** product-spec (brief contents), with the person's OK

### R6. should-fix: person approval for the framework-file edits isn't in `decisions.md`
- **Where:** `tasks/decisions.md:7`; changed files `rules/database-and-deploy.md:54-57`, `roles/README.md:37`, `roles/devops-cicd.md:22-29`, `roles/git-release.md:32-33`, `ORCHESTRATOR.md:37`, `:63-77`, `scripts/verify.sh` (framework file per L1/L8)
- **What:** `rules/**`, `roles/**` and `ORCHESTRATOR.md` belong to the person only (`roles/README.md`), and changing a rulebook in `rules/` must be escalated (ORCHESTRATOR §6). The only record of approval for L1/L2/L3/L6/L8 and the rule/role text changes is a sentence in `tasks/lessons.md:114`. `decisions.md` only records L10. AGENT_RULES (intro) says person decisions go into `decisions.md`.
- **Fix:** add a `decisions.md` row: date, "framework fixes L1, L2, L3, L6, L8 applied to verify.sh, bootstrap-check.sh, rules/database-and-deploy.md, roles/README.md, roles/devops-cicd.md, roles/git-release.md", who.
- **Owner:** git-release (records it; the person confirms)

### Nits (don't block)

| # | Where | What | Owner |
|---|---|---|---|
| N1 | `.github/workflows/drift.yml:52` | The comment says `supabase link` "reads SUPABASE_DB_PASSWORD from env"; `supabase link --help` for 3.2.0 shows no password flag or env var, so this is unverified until the first drift run. Confirm on that run and fix the comment (or move the password to the `db diff` step) if it's wrong. | devops-cicd |
| N2 | `scripts/verify.sh:208-209` vs `:232` | Script logs go to `/tmp/verify-*.log` while the DB log uses `${TMPDIR:-/tmp}`. Pick one (security S13 asks for the same). | devops-cicd |
| N3 | `scripts/verify.sh:81-82` | The gate-report exemption works only when `--brief` is spelled exactly `tasks/<id>/TASK_BRIEF.md`; `./tasks/0/TASK_BRIEF.md` makes `TID` empty and `specs/0/review.md` becomes "outside the allowed paths". Strip a leading `./`. Also `TID` doesn't depend on `$f`, so compute it once, outside the loop. | devops-cicd |
| N4 | `scripts/gate-check.sh` (whole) | ORCHESTRATOR §3a says the two gates go "each in its own commit"; the script accepts both in one commit. Either enforce `G_sec != G_rev` or drop the sentence. | devops-cicd (script) / the person (text) |
| N5 | `.github/workflows/ci.yml:44-48` | `verify` runs the full DB build again (verify.sh section 6) on top of `db-check`. Correct, but it doubles CI time. Fine as is; noting it so nobody adds `--no-db` (not allowed in CI) to speed it up. | devops-cicd |
| N6 | `CHANGELOG.md:8` | `[Unreleased]` is empty although this PR adds the `gate` check and the verify.sh/bootstrap-check fixes. The `[0.1.0]` link points at tag `v0.1.0`; make sure it's created at release. | git-release |
| N7 | `tasks/lessons.md:19-22`, `:41-43`, `:51`, `:102` | L1 is marked fixed but still says "verify.sh is copied unmodified". L3 is marked fixed but suggestion (b) (port-range rule in `roles/devops-cicd.md`, record the range in `PROJECT_CONTEXT.md`) wasn't applied, and `PROJECT_CONTEXT.md` doesn't mention 55420-55429. L4 and L9 are "closed" with framework fixes only suggested. ORCHESTRATOR §8: a lesson without its fix stays open. | devops-cicd / the person |
| N8 | `.env.example:1-5` | Lists the app vars only; the CI-only names `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` from `PROJECT_CONTEXT.md` aren't there (`roles/devops-cicd.md` output 6 says "every env var name"). Add them as commented CI-only names, or note that the file covers runtime vars only. | devops-cicd |
| N9 | `roles/README.md:37`, `roles/devops-cicd.md:24` | `next-env.d.ts` is assigned to devops-cicd but is in `.gitignore` and untracked. Harmless, but an owner for an untracked file is confusing. | the person |
| N10 | commit `1c80e60` | The planted-CR commit and its revert stay in the branch history. Squash-merge (git-release rule) removes them from `main`. Make sure the PR is squash-merged and not rebase-merged. | git-release |

## Verdict

No blockers. Every acceptance criterion is met or waits on the person as the brief says (deploy path, drift run, branch protection). The scripts and workflows do what they say, with the gaps listed above. R1-R3 are real defects in the merge-approval and secret-scan paths. They don't block Phase 0: R1 and R3 fail closed, and R2 can't fire with today's `fetch-depth: 0` checkout. Fix them before the person sets required reviews to 0 and the `gate` check becomes the only approval. R4-R6 are record-keeping that git-release needs at merge time.

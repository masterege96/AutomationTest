Result: PASS

# Security gate: task 0, PR #2 (gate hardening), pass 3

- **Reviewer:** security (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-hardening` @ `09a0f56`, diff `git diff origin/main...HEAD` (16 files)
- **Previous gate:** `7390bbd` (PASS, reviewed `157efb0`). This pass re-runs the gate because `09a0f56` changed code after it.

## Scope of change since the last gate

`git diff 7390bbd HEAD --stat` lists exactly the 4 files of `09a0f56` (`drift.yml`, `PROJECT_CONTEXT.md`,
`tasks/0/TASK_BRIEF.md`, `tasks/decisions.md`, +9/-7), and `7390bbd` itself only touched this file. So
the rest of the PR diff is byte-identical to what `7390bbd` reviewed, and its evidence for
`gate.yml`, `gate-check.sh`, `verify.sh` and `ci.yml` still holds. This pass re-checks `09a0f56` in full.

## Applicable baseline rows

Row 13 (brief), plus the merge-approval control (ORCHESTRATOR 3a) and the drift check this PR
changes. Rows 1-12 and 14: nothing new (no app code, routes, tables or migrations).

### Row 13: `.env` in Git / no secrets in files

| Control | Where | Proof | Result |
|---|---|---|---|
| verify.sh secret checks | `scripts/verify.sh` | "no .env files tracked", "basic secret pattern scan" PASS (gitleaks not installed locally; fallback scan). Unchanged since `7390bbd`. | PASS |
| CI secret scan | `ci.yml` `secrets` job | unchanged | PASS |
| No project ref, key or password in any file | whole tree at HEAD | `git grep` at HEAD for `<20-char ref>.supabase.co`, JWTs (`eyJ…`), `sb_secret_`/`sb_publishable_`, `postgres://user:pass@`, literal `SUPABASE_DB_PASSWORD=`: no hits. `09a0f56` adds only the project name (AutomationTests), the region (Europe) and the environment name `production`. No 20-char lowercase ref string in `PROJECT_CONTEXT.md`, `tasks/` or `specs/`. | PASS |

### Drift check (`drift.yml`, changed in `09a0f56`)

| Check | Where | Proof | Result |
|---|---|---|---|
| S22: fails closed on a non-numeric count | `drift.yml:77-86` | The test is now `[ "$CHANGED_LINES" != "0" ]`, so only an exact `0` passes. Step logic copied into a scratch script (run under `bash -e`, as Actions does): empty diff: `drift=no`, exit 0. Comments, blank lines and CRLF only: `0`, pass. One SQL line: `drift=yes`, exit 1. Missing `diff.sql` (grep exit 2, empty output): exit 1. Non-numeric output `abc`, blank output, `" 0"`: all exit 1. `grep -c` prints `0` and exits 1 on no match, and `|| true` keeps the `0`, so the clean case still passes. | PASS (S22 closed) |
| Nothing new in the public log | `drift.yml:72-78`, `:94-95` | Unchanged by `09a0f56` apart from the `if` and a comment. The log still gets only a count and a 12-hex sha256. On odd output the count line echoes the odd value; it comes from `grep -c` on the diff file, so it is a number or empty, never diff content. Issue body still has no diff. | PASS |
| Secrets scoping | `drift.yml:24`, `:35-69` | unchanged: `environment: production`, secrets only on the link and diff steps, `persist-credentials: false`. | PASS |

### Merge-approval control (`gate.yml` + `gate-check.sh`)

Unchanged since `7390bbd`; its proofs (F1 closed: `--base origin/main` hard-coded, non-`main` bases exit,
`edited` trigger; S17 head-SHA pin; concurrency; PR code never executed) carry forward.

### S25: documentation consistency (changed in `09a0f56`)

| Check | Where | Result |
|---|---|---|
| Hard constraint no longer says "no cloud project until the person decides" | `PROJECT_CONTEXT.md:104` | Now states the person connected the project and integration on 2026-11-25, that agents never write to production, and that L11 risks need a decision before the first real table. PASS |
| Secrets table | `PROJECT_CONTEXT.md:82-84` | Drift secrets listed as `production` environment secrets (main only), consistent with `tasks/decisions.md` and `drift.yml:24`. PASS |
| AC3 and Blocked | `tasks/0/TASK_BRIEF.md:20`, `:100` | AC3 records the deploy path; Blocked (1) marked done by the person; remaining items (green drift run, branch protection, label, L11 decision) listed. PASS |
| Decision recorded | `tasks/decisions.md:11` | New row: project created, integration connected, drift secrets stored, by the person. PASS |

S25 is closed. Two small doc leftovers are listed as S27 below.

## Automated results (local, HEAD `09a0f56`)

| Check | Result |
|---|---|
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker) | `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) |
| Supabase security advisors | Not run: agents don't touch the cloud project in this task, and the PR adds no schema |
| RLS check | verify.sh static check PASS, `supabase test db` PASS (no tables) |

## Findings

### FAIL-worthy

None. F1 stays closed (see `7390bbd`). `09a0f56` adds no exploitable hole and no secret.

### Should-fix (carried from `7390bbd` unless marked new)

| # | File:line | Severity | Problem (short; full text in `7390bbd`) | Fix | Owner |
|---|---|---|---|---|---|
| S14 (open, now more urgent) | `gate.yml`, branch protection, `tasks/lessons.md` L11 | High (pre-existing) | Check-name spoofing: any Actions job named `merge-gate` reports under the same check. Two variants: a `pull_request` job in the PR head (in L11) and a spoof `gate.yml` on a pushed base branch, then retarget to `main` and re-run the old spoof run (not in L11; L11's suggested fix misses it). Not verified on GitHub. With the Supabase GitHub integration now connected, a merge to `main` applies migrations to production, so this is a path to a production write. | Partial: gate-check fails on other `merge-gate`/`gate` jobs in the head; restrict branch creation or check base history before merging. Full: a check source workflows can't imitate (GitHub App / required workflow). Add the base-branch variant to L11 and `ORCHESTRATOR.md:69-70`. The person decides before the first real table (as `PROJECT_CONTEXT.md:104` now says). | devops-cicd; the person |
| S5 (open) | `gate-check.sh:51` | Medium (pre-existing) | A `tasks/**`-only PR (incl. `tasks/decisions.md`) passes with stale gate files. | As in L11. | devops-cicd |
| S15 (open) | `gate-check.sh:64` | Medium (pre-existing) | Protected-path list misses `.gitleaks.toml`, rest of `.github/**`, `package.json`/lockfile, `supabase/config.toml`, `templates/`, `AGENTS.md`. Note `supabase/config.toml` and `supabase/migrations` now feed production directly. | Extend the pathspec. | devops-cicd |
| S16 (open) | `gate-check.sh:66`, `gate.yml:44` | Medium (pre-existing) | Label not tied to a commit. | Re-add after each push, or record the approved SHA. | the person; devops-cicd |
| S19 (open) | `drift.yml:24` | Medium (pre-existing) | Nothing checks the `production` environment's main-only policy or the absence of repo-level `SUPABASE_*` secrets. | bootstrap-check, read-only `gh api`. | devops-cicd |
| S20/S21 (open) | `roles/git-release.md:19`, `ORCHESTRATOR.md:69` | Low | Ownership wording contradicts AGENT_RULES 18a; "can't edit the gate" overstates the control. | Reword. | the person |
| S23 (accepted) | `drift.yml:74` | Low | `tail -20 diff.err` on CLI failure; derived values of secrets aren't masked. | Keep, or print the first error line only; re-check the first failing run. | devops-cicd |
| S24 (info) | `drift.yml:78` | Info | 12-hex hash of a non-empty diff allows confirming a guessed diff. Negligible. | None. | none |
| S26 (new, `09a0f56`) | `drift.yml:80-83`, `:89` | Low | Failing closed is correct, but an odd count (missing file, grep error) is reported as `drift=yes`, so the job opens a drift issue saying "production differs" and triggers stop rule 1 for what is really a broken check. | Optional: `case "$CHANGED_LINES" in ''|*[!0-9]*) echo "::error::could not count diff lines"; exit 1;; esac` before the drift test, so odd output fails without `drift=yes`. | devops-cicd |
| S27 (new, `09a0f56`) | `drift.yml:9`, `tasks/lessons.md` L11 | Low (doc) | `drift.yml:9` still says to add a post-deploy `workflow_run` trigger "once the deploy path exists"; it exists now (the integration has no workflow to hook, so it stays nightly). L11 still lacks S14's base-branch variant. | Reword the comment; add the variant to L11. | devops-cicd |

S22 and S25 (from `7390bbd`) are closed by `09a0f56`.

### Temporary state (unchanged from `7390bbd`)

Until this PR merges, the required check is the old `gate` job in `ci.yml`, which runs the PR's own
`gate-check.sh` and proves nothing for this PR. The real control for PR #2 is the person reading the
diff and adding `framework-change-approved`. After the merge: the person makes `merge-gate` required
instead of `gate` with bypass off, and the follow-up PR removing the `gate` job merges under `merge-gate`.
Since the integration is connected, merging this PR applies the `init` migration (no schema change)
to production; that is expected and harmless.

## Secret exposure

None found. No secret values were read, used or printed. No Supabase cloud, GitHub settings or labels
were touched, and nothing was pushed.

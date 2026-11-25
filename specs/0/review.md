Result: APPROVE

# Code review: task 0, drift artifact (`ci/0-drift-artifact`), re-run

- **Reviewer:** code-reviewer (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-drift-artifact` @ `21b0e2c`; whole diff `git diff origin/main...HEAD` (`.github/workflows/drift.yml`, `roles/devops-cicd.md`, `tasks/decisions.md`, plus the gate files), focus on `e643765` (S28: gitleaks scan of `diff.sql` before upload; S29: upload only if `supabase db diff` exited 0).
- **Previous review:** `a4d1885` (APPROVE, nits N1-N4).
- **Security gate:** `specs/0/security-gate.md` = PASS (re-run `21b0e2c`, after the code commit). Read; this review was done independently.
- **Decision implemented:** `tasks/decisions.md:12` (repo stays public; a manual run with `upload_diff=true` may upload the raw diff as a 1-day artifact; schedule and default runs never expose it).

## Verdict

`e643765` does what it says. The upload now needs three things on an opt-in manual run: the CLI
exited 0 (`diff_ok`), gitleaks ran and found nothing (`clean`), and the earlier conditions. Every
failure path (CLI error, gitleaks hit, gitleaks error, gitleaks not installed) skips the upload. The
drift issue still opens on every drift run, whatever the scan does. No blockers, no should-fix.

## Step order and conditions (drift.yml)

Steps as parsed by js-yaml: 5 `diff` (id `diff`), 6 install gitleaks, 7 scan (id `scan`), 8 upload, 9 issue.
Steps 6-8 all start with `always() && github.event_name == 'workflow_dispatch' && inputs.upload_diff && steps.diff.outputs.diff_ok == 'true'`; step 8 adds `&& steps.scan.outputs.clean == 'true'`.
Both `steps.diff.*` and `steps.scan.*` point at real step ids that run earlier in the job.

| Case (opt-in manual run unless stated) | Install | Scan | Upload | Issue | Run |
|---|---|---|---|---|---|
| Schedule / default dispatch | skipped | skipped | skipped | only on drift (as before) | as before |
| No drift (`diff_ok=true`, `drift=no`, step 0) | runs | runs, `clean=true` | runs | no (`drift != yes`) | green |
| Drift (`diff_ok=true` written at `:83` before `drift=yes` + `exit 1` at `:89-91`) | runs (`always()`) | runs | runs if clean | yes: `failure()` true, `drift == 'yes'` | red |
| CLI failure (`:79-80` exits before `:83`) | skipped | skipped | skipped | no (`drift` empty) | red |
| Earlier step fails (secrets, `npm ci`, link) | skipped (`diff_ok` empty) | skipped | skipped | no | red |
| gitleaks hit (RC 99, `:115`) | ran | fails, no `clean` | skipped | drift run: yes; no-drift run: no | red |
| gitleaks error (RC 1, unknown flag 126, other) | ran | fails, no `clean` (`:116`) | skipped | as above | red |
| Install fails | fails | still runs (`always()`); `gitleaks` missing, RC 127, `:116` | skipped | as above | red |

`failure()` in the issue step (`:129`) is true whenever any earlier step failed; a failed scan or
upload on a drift run cannot hide the issue, and on a no-drift run the `drift == 'yes'` term keeps
the issue closed. Outputs written before a step exits non-zero are kept, which the issue step
already relied on for `drift=yes`, so `diff_ok` from the failed drift step is usable too.

## Other checks

| Claim | Evidence | Result |
|---|---|---|
| `GITLEAKS_VERSION` matches ci.yml | `drift.yml:34` `8.30.1` (job env); `ci.yml:18` `8.30.1`; same installer `scripts/ci/install-gitleaks.sh` (pinned tarball, release checksum `sha256sum -c`, `set -euo pipefail`) as `ci.yml:41-42, 96-97` | OK |
| gitleaks flags valid for v8.30.1 | `cmd/detect.go@v8.30.1`: `--no-git` (Bool), `--source`/`-s`; `cmd/root.go`: persistent `--exit-code` (Int, default 1), `--redact` (Uint, `NoOptDefVal` 100), `--no-banner`, `--log-level` (`error` valid). Exit codes: findings, `os.Exit(exitCode)` = 99; scan error, `os.Exit(1)` (checked before findings, so an erroring scan is never read as clean); unknown flag, 126; fatal, 1 | OK |
| Config / ignore files | no `GITLEAKS_CONFIG*` env in the job; `root.go` loads `.gitleaks.toml` from `--source`, which is the fresh `mktemp -d` holding only `diff.sql`, so the default rules apply with no allowlist and no `.gitleaksignore` | OK |
| `set +e` / `set -e` under `bash -e` | `:109-112`: every RC reaches the `case`; `mktemp`/`cp` failures fail the step without `clean` | OK |
| Nothing printed | `>/dev/null 2>&1` at `:110`, no report path; only fixed messages reach the public log | OK |
| YAML parses | js-yaml (node_modules): 10 steps in the order above, job env `{"DRIFT_SCHEMAS":"public","GITLEAKS_VERSION":"8.30.1"}` | OK |
| Docs match behavior | `roles/devops-cicd.md:53`: upload only if `supabase db diff` exited 0 and gitleaks finds it clean, message "possible secret in production schema, not uploaded" (= `drift.yml:115`), delete after download, schedule/default never expose it. Comment `drift.yml:96-98` says the same. `tasks/decisions.md:12` states the person's decision; the extra guards only narrow it | OK |
| Scope | `.github/workflows/*`, `roles/*`, `tasks/*`, all in the brief's allowed paths. Framework/pipeline files, so the PR needs the person's `framework-change-approved` label (AGENT_RULES 18a) | OK (label is the person's) |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker): `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) | OK |

## Earlier nits

| # | Status |
|---|---|
| N1 (issue body says the log shows only a line count and hash; the artifact is the other way to see the diff) | still applies, see N1 below |
| N2 (red no-drift opt-in run without an issue) | still applies, and now also covers a gitleaks hit/error on a no-drift run, see N2 below |
| N3 (fixed artifact name, `overwrite: false`, re-run) | still applies, see N3 below |
| N4 ("deletes" read as a fact) | fixed: `drift.yml:98` now says "must delete" |

## Findings

No `blocker`, no `should-fix`.

| # | File:line | Severity | What is wrong | Owner |
|---|---|---|---|---|
| N1 | `.github/workflows/drift.yml:135` | nit | Issue body says "The run log shows only a line count and hash" and points db-builder at a local `db diff`; a manual `upload_diff=true` run (now gitleaks-checked) is the other way to see the diff. Optional one-line mention, still never pasting the diff. | devops-cicd |
| N2 | `.github/workflows/drift.yml:103-117` | nit | On a no-drift opt-in run, a gitleaks hit, a gitleaks error or an upload failure turns the run red with no issue. The error lines say why ("possible secret in production schema, not uploaded" / "gitleaks could not run"), and a manual run has someone watching, so fine; but a hit means a secret-looking string sits in the production schema, which is worth following up by hand even with no drift. | devops-cicd |
| N3 | `.github/workflows/drift.yml:123` | nit | Fixed name `drift-diff` with the default `overwrite: false`; unverified whether "Re-run failed jobs" on the same run conflicts with the first attempt's artifact. If it does, the re-run's upload fails (closed, harmless); `overwrite: true` would avoid it. | devops-cicd |
| N5 | `.github/workflows/drift.yml:110` | nit | `gitleaks detect --no-git --source` is the legacy form (`cmd/detect.go@v8.30.1` marks it "OLD CMD"; the current one is `gitleaks dir`). It works in the pinned 8.30.1 and matches the `detect` usage in `ci.yml:100`, so no change now; revisit when the pin is bumped. | devops-cicd |
| N6 | `.github/workflows/drift.yml:110, 116` | nit | All gitleaks output goes to `/dev/null`, so "gitleaks could not run (exit N)" gives only the exit code to debug from. Deliberate (public log, S18) and fails closed; noting it so a future fix does not just drop the redirect. | devops-cicd |

## Carried

Security items from the PR #2 gates (S14, S5, S15, S16, S19, S20/S21, S23, S24, S26, S27) are
unchanged by this PR. S19 (nothing verifies the `production` environment's main-only policy) also
guards this artifact path.

## Before merge

The person adds `framework-change-approved` (this PR changes `.github/workflows/drift.yml` and
`roles/devops-cicd.md`).

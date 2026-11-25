Result: APPROVE

# Code review: task 0, drift artifact (`ci/0-drift-artifact`)

- **Reviewer:** code-reviewer (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-drift-artifact` @ `0f0a026` (code commit `8a353f3`), diff `git diff origin/main...HEAD` excluding `specs/0/security-gate.md`: `.github/workflows/drift.yml` (+16), `roles/devops-cicd.md` (1 line), `tasks/decisions.md` (+1)
- **Security gate:** `specs/0/security-gate.md` = PASS (commit `0f0a026`, after the code commit). Read; this review was done independently.
- **Decision implemented:** `tasks/decisions.md:12` (repo stays public; a manual drift run may upload the raw diff as a 1-day artifact with `upload_diff=true`; schedule and default runs never expose it).

## Verdict

The change does what the decision says and nothing more. The upload step runs exactly on a manual
dispatch with `upload_diff=true` (whether the diff step passed or failed on drift), never on the
schedule or a default dispatch, and it does not change when the drift issue is opened. No blockers,
no should-fix. A few nits below.

## What was checked

| Claim | Evidence | Result |
|---|---|---|
| Input is a real boolean, default off | `drift.yml:9-13` `type: boolean`, `default: false`; js-yaml load gives `{"type":"boolean","default":false}` | OK |
| Condition uses the typed context | `drift.yml:96` uses `inputs.upload_diff` (boolean), not `github.event.inputs.upload_diff` (string `'false'`, truthy) | OK |
| Schedule never uploads | `github.event_name == 'workflow_dispatch'` false (and `inputs.upload_diff` is null) | skipped, OK |
| Default dispatch never uploads | `inputs.upload_diff` = `false` | skipped, OK |
| Opt-in run, diff step fails with drift (`exit 1` at `:88`) | `always()` overrides the implicit `success()`; `diff.sql` exists | runs, OK |
| Opt-in run, diff step passes (no drift) | all terms true, `diff.sql` exists (possibly empty or comments only) | runs, OK |
| Opt-in run, an earlier step fails (secrets missing, `npm ci`, link) | `diff.sql` never created, `hashFiles('diff.sql')` = `''` | skipped, OK (so `if-no-files-found: error` cannot fire on those runs) |
| Opt-in run, CLI error in the diff step (`:78-79`) | the shell redirect has already created `diff.sql`, so a partial/empty file is uploaded; the run still fails. Same as security S29 | acceptable |
| Position before the issue step | `failure()` at `:105` reflects any earlier failed step; a successful upload does not clear it, and `steps.diff.outputs.drift` is unchanged. Drift run: issue still opened. If the upload itself fails on a drift run, `failure()` is still true and the issue still opens. No-drift run: `drift == 'yes'` false, no issue (as before) | OK |
| upload-artifact v7 inputs | `action.yml` at `cf430e03...` (`gh api`): `name`, `path` (required), `if-no-files-found` (`warn`/`error`/`ignore`), `retention-days` (min 1) all exist; runs on `node24`. No unknown inputs | OK |
| Pin | `drift.yml:97` full SHA with `# v7.0.2`, same style as the other actions; security confirmed the tag points to this SHA | OK |
| Only `diff.sql` uploaded | single literal path, no glob; `diff.err` and `supabase/.temp` not matched | OK |
| YAML parses | js-yaml (node_modules): `on` = `schedule` + `workflow_dispatch.inputs.upload_diff`; steps 0-7 in order, step 6 = upload, step 7 = issue | OK |
| Docs match behavior | `roles/devops-cicd.md:53` and `decisions.md:12` both say: manual run with `upload_diff=true`, raw `diff.sql`, 1-day artifact, delete after download, schedule/default never expose it. Matches `drift.yml:93-102`. The rest of item 5 (issue never pastes the diff) still holds | OK |
| rules/database-and-deploy.md rule 7 | still read-only (upload adds no write to production), still judged on content, still nightly; unchanged | OK |
| Scope | all files in the brief's allowed paths (`.github/workflows/*`, `roles/*`, `tasks/*`). `drift.yml` and `roles/devops-cicd.md` are framework/pipeline files, so the PR needs the person's `framework-change-approved` label (AGENT_RULES 18a) | OK (label is the person's) |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker): `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script) | OK |

## Findings

No `blocker`, no `should-fix`.

| # | File:line | Severity | What is wrong | Owner |
|---|---|---|---|---|
| N1 | `.github/workflows/drift.yml:111` | nit | The issue body says "The run log shows only a line count and hash" and tells db-builder to reproduce locally; on an opt-in run the diff is also in the `drift-diff` artifact for a day. Optional: mention that a manual `upload_diff=true` run is the other way to see it (keeps the "never paste the diff" rule). | devops-cicd |
| N2 | `.github/workflows/drift.yml:95-102` | nit | If the upload itself fails on a no-drift opt-in run, the run is red without drift and no issue is opened. Fine for a manual run the person is watching; worth knowing so a red manual run is not read as drift (the diff step's log line says "No drift."). | devops-cicd |
| N3 | `.github/workflows/drift.yml:99` | nit | Fixed name `drift-diff` with the default `overwrite: false`. Unverified whether "Re-run failed jobs" on the same run hits a name conflict with the first attempt's artifact; if it does, the re-run's upload step fails (closed, harmless). `overwrite: true` would avoid it if that ever shows up. | devops-cicd |
| N4 | `.github/workflows/drift.yml:93-94` | nit | Comment says whoever triggers it "deletes the artifact right after downloading"; that is a manual step nothing enforces (security S28 also covers this). Wording could say "must delete" so it reads as a duty, not a fact. | devops-cicd |

## Carried

Security S28/S29 and the open items from the PR #2 gates (S14, S5, S15, S16, S19, S20/S21, S23, S24,
S26, S27) are unchanged by this PR. S19 (nothing verifies the `production` environment's main-only
policy) now also guards this artifact path.

## Before merge

The person adds `framework-change-approved` (this PR changes `.github/workflows/drift.yml` and
`roles/devops-cicd.md`).

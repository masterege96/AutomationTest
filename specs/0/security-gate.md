Result: PASS

# Security gate: task 0, drift artifact (`ci/0-drift-artifact`)

- **Reviewer:** security (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-drift-artifact` @ `8a353f3`, diff `git diff origin/main...HEAD` (3 files, +18/-1): `.github/workflows/drift.yml`, `roles/devops-cicd.md`, `tasks/decisions.md`
- **Decision this relies on:** `tasks/decisions.md:12` (the person keeps the repo public and allows a manual drift run to upload the raw diff as a 1-day artifact with `upload_diff=true`; schedule and default runs never expose it).

## Applicable baseline rows

Row 13 (no secrets in files / logs / artifacts) and the drift check (rules/database-and-deploy.md rule 7). Rows 1-12 and 14: nothing new (no app code, routes, tables, migrations, env vars or client code).

### The upload step can't run on schedule or a default dispatch

Step: `drift.yml:95-102`, `if: always() && github.event_name == 'workflow_dispatch' && inputs.upload_diff && hashFiles('diff.sql') != ''`.

| Case | Evaluation | Result |
|---|---|---|
| `schedule` | `github.event_name == 'workflow_dispatch'` is false; also `inputs` is empty on schedule, so `inputs.upload_diff` is null (falsy). Two independent false terms. | skipped. PASS |
| `workflow_dispatch`, default | input is `type: boolean`, `default: false` (`drift.yml:9-13`). The `inputs` context keeps the boolean type, so `inputs.upload_diff` is `false`. The classic pitfall (`github.event.inputs.upload_diff` is the string `'false'`, which is truthy) is avoided: the expression uses `inputs.`, not `github.event.inputs.`. | skipped. PASS |
| `workflow_dispatch`, `upload_diff=true` | all terms true if `diff.sql` exists. | runs (intended, accepted) |
| `always()` | Needed so the step still runs after the diff step exits 1 on drift (the case worth investigating). It does not widen the trigger: the other three terms are ANDed. If an earlier step failed before the diff (missing secrets, `npm ci`, link), `diff.sql` does not exist, `hashFiles` returns `''`, step skipped. On cancel, same terms apply. | PASS |
| Effect on the drift issue | The upload step does not change `failure()`/`steps.diff.outputs.drift`, so the issue step (`drift.yml:104`) behaves as before; the issue body still has no diff. | PASS |

Workflow parses: loaded with `js-yaml` from `node_modules`; `on` has `schedule` + `workflow_dispatch.inputs.upload_diff {type: boolean, default: false}`, and the step's `if`/`with` come out as written.

### Only `diff.sql` is uploaded

| Check | Proof | Result |
|---|---|---|
| Path | `path: diff.sql` (single literal file, no glob, no directory). `diff.err` (CLI stderr, may hold connection detail) and `.git` are not matched. | PASS |
| `supabase/.temp` (link data) | `supabase link` writes the project ref, pooler URL (host and `postgres.<ref>` user, no password), service versions and linked-project metadata into `supabase/.temp/` (gitignored, `supabase/.gitignore:3`). It is a different path from `diff.sql`, so it is not in the artifact; upload-artifact v7 also excludes hidden files/dirs by default. Access token and DB password are passed by env only (`drift.yml:63-66`, `:71-73`), not written by this workflow. | PASS |
| Content of `diff.sql` | stdout of `supabase db diff --remote --schema public` (`drift.yml:78`); CLI progress and errors go to `diff.err`. So it is schema SQL for `public` only. | PASS |
| `if-no-files-found: error`, `retention-days: 1`, fixed name `drift-diff` | `drift.yml:99-102` | PASS |

### Action pin

`git ls-remote https://github.com/actions/upload-artifact`: `refs/tags/v7.0.2` = `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (lightweight tag, same as `refs/tags/v7` and `main`), matching `drift.yml:97` `@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`. PASS

### Who can trigger it

| Check | Proof | Result |
|---|---|---|
| `workflow_dispatch` needs write access | GitHub only lets users with write (or higher) on the repo dispatch a workflow (UI, `gh workflow run`, or REST). Read-only users and the public can't. | PASS |
| A PR can't trigger it | `pull_request`/`pull_request_target` don't fire `drift.yml`. A token could dispatch only with `actions: write`; no workflow in the repo grants it (`ci.yml:9-10`, `gate.yml:10-11` `contents: read`; `drift.yml:16-18` `contents: read`, `issues: write`), and fork PR tokens are read-only. A PR that edits `drift.yml` changes nothing until merged (gate + `framework-change-approved`, which agents never add). | PASS |
| Dispatch on a non-main ref | the job uses `environment: production` (`drift.yml:29`), restricted to `main` (decisions.md:10), so a dispatch from another branch (with an edited workflow) can't get the environment or its secrets. Not verified on GitHub (S19 carries). | PASS (by config) |

### Secrets and residual exposure (accepted)

- **No secrets in the artifact:** the artifact holds schema SQL only; no token, password or `.temp` link data (see above). The upload action gets the runner's `ACTIONS_RUNTIME_TOKEN`, not the Supabase secrets (step-level env only on link/diff).
- **Residual exposure during the window (accepted by the person, decisions.md:12):** on a public repo, any signed-in GitHub user (and anyone with a token via the API) can download `drift-diff` from the run page until it is deleted or expires (retention 1 day; the "delete right after download" step is manual and not enforced). What leaks is the diff between production and `supabase/migrations` for `public`: table/column/index names, RLS policies (which reveal access logic and any gaps in it), function and trigger bodies, grants, defaults. If someone put a literal secret in production SQL (a function body, a column default, a `comment on`), it would be in the diff; nothing scans the artifact. If the drift is malicious (attacker-made object), the artifact shows the attacker that it was detected. The run's existence and the `drift-diff` artifact name are also public.
- **S28 (new, Low, should-fix):** before uploading, the person (whoever dispatches) should know the above; the input description says the download is public (`drift.yml:11`). Optional hardening, not required: run the existing secret pattern scan (or gitleaks) on `diff.sql` before upload and skip the upload on a hit; or encrypt `diff.sql` with a key held only by the person. Owner: devops-cicd; the person decides.
- **S29 (new, Low, doc):** if the CLI fails part-way, a partial `diff.sql` can still be uploaded on an opt-in run (the `always()` path). Still schema SQL only; no action needed beyond knowing it.

## Automated results (local, HEAD `8a353f3`)

| Check | Result |
|---|---|
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker) | `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script); secret pattern scan on changed files PASS (gitleaks not installed locally) |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| Workflow parse (js-yaml) | parses; see above |
| Supabase security advisors | Not run: agents don't touch the cloud project; the PR adds no schema |
| RLS check | verify.sh static check PASS, `supabase test db` PASS (no tables) |

## Findings

### FAIL-worthy

None. The upload runs only on a write-access user's manual dispatch on `main` with `upload_diff=true`, uploads only schema SQL, and the remaining exposure is exactly what the person accepted.

### Should-fix

New: S28, S29 (above). Carried open from the previous gate (`specs/0/security-gate.md` at `origin/main`'s PR #2 pass, unchanged by this PR): S14 (check-name spoofing of `merge-gate`), S5, S15, S16, S19 (nothing verifies the `production` environment's main-only policy; this PR now also relies on it), S20/S21, S23, S24, S26, S27. Note for S15: `roles/devops-cicd.md` is a framework file, so this PR needs the person's `framework-change-approved` label.

## Secret exposure

None found. No secret values were read, used or printed. No Supabase cloud, GitHub settings, labels or workflows were touched or triggered, and nothing was pushed.

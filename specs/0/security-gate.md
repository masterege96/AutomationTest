Result: PASS

# Security gate: task 0, drift artifact (`ci/0-drift-artifact`), re-run

- **Reviewer:** security (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-drift-artifact` @ `e643765`, diff `git diff origin/main...HEAD` (`.github/workflows/drift.yml`, `roles/devops-cicd.md`, `tasks/decisions.md`, `specs/0/review.md`, `specs/0/security-gate.md`). Focus: `e643765` (fix for S28 and S29 from the previous gate, `0f0a026`).
- **Decision this relies on:** `tasks/decisions.md:12` (repo stays public; a manual run with `upload_diff=true` may upload the raw diff as a 1-day artifact; schedule and default runs never expose it).

## Applicable baseline rows

Row 13 (no secrets in files / logs / artifacts) and the drift check (rules/database-and-deploy.md rule 7). Rows 1-12 and 14: nothing new (no app code, routes, tables, migrations, env vars or client code).

## S29 (partial diff upload): fixed

| Check | Proof | Result |
|---|---|---|
| `diff_ok` set only after a successful CLI run | `drift.yml:79-83`: `if ! npx ... supabase db diff ... >diff.sql 2>diff.err; then ... exit 1; fi`, then `echo "diff_ok=true" >> "$GITHUB_OUTPUT"`. Any non-zero CLI exit leaves the step before `diff_ok` is written. | PASS |
| No-drift case | `diff_ok=true`, `drift=no`, step exits 0. | PASS |
| Drift case | `diff_ok=true` is written before the content check, then `drift=yes` and `exit 1`. Outputs written before a step fails are kept (the issue step already relies on `drift=yes` from the same failed step), so the opt-in upload path still works for the drift case. | PASS |
| CLI failure never uploads | `diff_ok` absent, so install, scan and upload (`drift.yml:100, 105, 120`) all require `steps.diff.outputs.diff_ok == 'true'` and are skipped. If the diff step never ran (secrets missing, `npm ci`/link failed), the output is empty: skipped too. The old `hashFiles('diff.sql') != ''` term is gone. | PASS |
| Scratch test (diff step extracted verbatim from the parsed YAML, fake `npx`, `bash -e`) | CLI exit 1 with partial stdout: exit 1, outputs empty. CLI exit 2 with SQL on stdout: exit 1, outputs empty. Exit 0 comment-only: `diff_ok=true drift=no`, exit 0. Exit 0 with SQL: `diff_ok=true drift=yes`, exit 1. | PASS |

## S28 (no secret scan before upload): fixed

Scan step `drift.yml:103-117`, install step `drift.yml:99-101` (`scripts/ci/install-gitleaks.sh`: pinned `8.30.1`, same as `ci.yml:18`, release checksum verified with `sha256sum -c`, `set -euo pipefail`).

| Check | Proof | Result |
|---|---|---|
| Scans a directory holding only `diff.sql` | `SCAN_DIR=$(mktemp -d); cp diff.sql "$SCAN_DIR/"`; `--source "$SCAN_DIR"`. Scratch test (fake gitleaks listing its `--source`): the dir contains only `diff.sql`; `diff.err`, `supabase/.temp` and the repo are not in it. | PASS |
| Flags | `detect --no-git --source <dir> --redact --no-banner --log-level error --exit-code 99` (as seen by the fake binary). | PASS |
| `set +e` / `set -e` under the default `bash -e {0}` shell | `set +e` before the gitleaks call, `RC=$?`, `set -e` after, then `case`. Without `set +e` a non-zero exit would kill the step before `RC` is read; with it, every code reaches the `case`. A failing `mktemp`/`cp` (before `set +e`) fails the step without writing `clean`. | PASS |
| Output not printed | `>/dev/null 2>&1` on the gitleaks call; no report file (`--report-path` not used). Scratch test: a fake gitleaks printing a fake finding to stdout and stderr left nothing in the step log. | PASS |
| Exit 0 | `clean=true` written, "gitleaks: diff.sql clean", step exit 0. | PASS (tested) |
| Exit 99 | `::error::possible secret in production schema, not uploaded`, exit 1, no `clean`. | PASS (tested) |
| Exit 1 (gitleaks error) | `::error::gitleaks could not run (exit 1), diff not uploaded`, exit 1, no `clean`. | PASS (tested) |
| Exit 127 (gitleaks not installed, e.g. the install step failed; the scan step still runs via `always()`) | same message with `exit 127`, exit 1, no `clean`. | PASS (tested) |
| Upload requires the scan | upload `if:` ends `&& steps.scan.outputs.clean == 'true'`; `clean` is written only on RC 0. Scan skipped or failed: empty, upload skipped. | PASS |
| Config | no `.gitleaks.toml` in the repo, and the temp dir has none, so gitleaks uses its default rules with no allowlist (nothing can be allowlisted from a PR branch). | PASS |

Scratch scripts: `C:\Users\tubae\AppData\Local\Temp\claude\e4b8eed453e91105\e97f8da3-6e6c-41cc-8dbd-b960c5b83aaf\scratchpad\t\` (`scan.sh`, `diffstep.sh` extracted from the parsed YAML).

## The schedule and the default dispatch never install, scan or upload

All three new steps share the prefix `always() && github.event_name == 'workflow_dispatch' && inputs.upload_diff && steps.diff.outputs.diff_ok == 'true'`.

| Case | Evaluation | Result |
|---|---|---|
| `schedule` | `github.event_name == 'workflow_dispatch'` false; `inputs.upload_diff` null. Install, scan, upload skipped. | PASS |
| `workflow_dispatch`, default | `upload_diff` is `type: boolean`, `default: false` (`drift.yml:9-13`); `inputs.upload_diff` keeps the boolean (the expression uses `inputs.`, not the string-typed `github.event.inputs.`), so `false`. All three skipped. | PASS |
| `workflow_dispatch`, `upload_diff=true`, CLI failed | `diff_ok` empty: all three skipped. | PASS |
| `workflow_dispatch`, `upload_diff=true`, CLI exit 0 | install + scan run; upload only with `clean == 'true'`. | intended |
| `always()` | lets the steps run after the diff step's drift `exit 1` (or a cancel); every other term is ANDed, so it never widens the trigger. | PASS |
| Issue step `failure() && steps.diff.outputs.drift == 'yes'` | a scan failure without drift does not open an issue (`drift` is `no`); the issue body still never contains the diff. | PASS |

Workflow parses with `js-yaml` from `node_modules`: `on` = `schedule` + `workflow_dispatch.inputs.upload_diff {type: boolean, default: false}`; step `id`s `diff` and `scan` and all `if:` strings come out as written.

## Unchanged from the previous gate (re-checked)

Upload `path: diff.sql` only, `retention-days: 1`, `if-no-files-found: error`, name `drift-diff`; `upload-artifact@cf430e03...` = v7.0.2 (previous gate checked the tag). Secrets only on the link and diff steps (step env); `persist-credentials: false`; `environment: production` (main only, by config). Only a write-access user can dispatch; no workflow grants `actions: write`.

## Automated results (local, HEAD `e643765`)

| Check | Result |
|---|---|
| `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase in Docker) | `verify.sh: PASS 18/18 (1 skipped)` (`test:e2e`, no script); basic secret pattern scan PASS (gitleaks not installed locally) |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| Workflow parse (js-yaml) | parses (see above) |
| Supabase security advisors | not run: agents don't touch the cloud project; the PR adds no schema |
| RLS check | verify.sh static check PASS, `supabase test db` PASS |

## Findings

### FAIL-worthy

None.

### Closed

- **S28** (no secret scan before upload): closed by `e643765` (see above).
- **S29** (partial diff upload): closed by `e643765` (see above).

### Should-fix (new, Low)

- **S30 (Low):** a gitleaks hit (exit 99) prints "possible secret in production schema, not uploaded" in a public run log and does nothing else: no issue (unless there is also drift) and no stop. It tells the public that production SQL probably holds a secret, and nobody is asked to act. The person who dispatched sees it; they should treat it as AGENT_RULES 15 / stop rule 2 (find it locally with the read-only `supabase db diff --remote`, rotate). Optional: make the message neutral ("secret scan failed") and open an issue that names no detail. Owner: devops-cicd; the person decides.
- **S31 (Low, accepted residual):** gitleaks matches known key patterns and entropy; a secret that matches no rule (e.g. a plain password in a column default or function body) still passes and would be uploaded. The rest of the accepted exposure from the previous gate stays (schema names, RLS logic, function bodies are downloadable by any signed-in user until the artifact is deleted or expires; deletion is manual). Also `gitleaks detect` is the deprecated 8.x subcommand (same as `ci.yml:100`); if it ever stops working, the scan fails closed (no upload). Confirm on the first opt-in run.

### Carried open (unchanged by this PR)

S14 (check-name spoofing of `merge-gate`), S5, S15, S16, S19 (nothing verifies the `production` environment's main-only policy; this PR relies on it), S20/S21, S23, S24, S26, S27. Note for S15: `roles/devops-cicd.md` and `.github/workflows/drift.yml` are framework/pipeline files, so this PR needs the person's `framework-change-approved` label.

## Secret exposure

None found. No secret values were read, used or printed. No Supabase cloud, GitHub settings, labels or workflows were touched or triggered, and nothing was pushed.

Result: PASS

# Task 4ea security gate: drift.yml `issues: write` exception to merge-gate spoof rule B2

- Date: 2026-11-27. Reviewed head: `68317dd` (branch `ci/4ea-drift-issues-exception`, PR #24), diff `origin/main...HEAD`.
- Inputs read: `rules/AGENT_RULES.md`, `roles/security.md`, `rules/security-baseline.md`, `tasks/4ea/TASK_BRIEF.md`,
  `tasks/decisions/2026-11-27-4ea-drift-issues-write-exception.md`, `tasks/decisions/2026-11-27-4e-drift-reader-created-by-hand-once.md`,
  `tasks/4c/TASK_BRIEF.md`, `scripts/gate-check.sh`, `.github/workflows/gate.yml`, `tests/integration/gate-spoof.test.ts`,
  `origin/ci/4e-drift-readonly:.github/workflows/drift.yml`.

## Applicable rows

| Row | Control (file:line) | Abuse tests | Result |
|-----|---------------------|-------------|--------|
| Merge-gate bypass (L11 S14, 4c B2) | `scripts/gate-check.sh:578` (exception condition), `:358`/`:364` (W fact carries scope), `:389-408` (`onval`), `:486`, `:521` (block-mapping triggers), `:417` (allowlist) | `tests/integration/gate-spoof.test.ts`, blocks "drift.yml issues: write exception" (AC1-AC13, 71 cases) | PASS (CI `verify`: `npm run test` PASS, verify.sh PASS 20/20) |
| 13 (secrets in Git) | CI gitleaks | CI `secrets` job | PASS: gitleaks 8.30.1, 260 commits scanned, "no leaks found" |

All other baseline rows: N/A (CI gate logic and tests only; no route, input, DB, upload, AI or client change).

## Narrow and fail-closed

1. **Exact path** (`gate-check.sh:578`): `[ "$p" = ".github/workflows/drift.yml" ]`, byte comparison on the
   `ls-tree` path (`core.quotePath=true`; quoted paths and symlinks/submodules already FAIL earlier, `:600-605`).
   `Drift.yml`, `drift.yaml`, `sub/drift.yml`, `drift2.yml` get the normal B2 FAIL (AC9).
2. **Only `issues: write`, once** (`:578`): exactly one `W` fact and its scope is `issues`. Any other B2 scope,
   `write-all` (`:364`, scope `write-all`), or a second `issues: write` (same mapping, other case `Issues:`, or job
   level) gives 2+ facts or a different scope -> FAIL. Checked by hand: `issues: write` + `Issues: write` -> two W
   facts -> FAIL. The FAIL text and line number (first grant) are unchanged from 4c.
3. **Trigger allowlist** {`schedule`, `workflow_dispatch`, `check_run`} (`:417`), case-sensitive. `DMODE` starts
   `no` (`:417`, `:390`); `ok` only for: a plain/single/double-quoted scalar without escapes in the list (`:394`),
   a one-line flow sequence whose every item (plain or quoted `[a-z_]+`) is in the list (`:397-406`; empty list,
   empty item, nested list or mapping -> `no`), or a block mapping with >=1 key at the first indent, all in the list,
   no sequence item (`:486`, `:521`). Flow mapping, block scalar, missing `on:` -> `no`.
4. **Other spoof rules unchanged**: B1, S14-A and B3 run before/after B2 as in 4c (AC10, AC11); the exception only
   replaces the B2 FAIL line.

## Tricky YAML (reader run directly on crafted inputs, extracted awk, no gate run)

| Input | Reader result |
|-------|---------------|
| `on: schedule` + `On: [push]` (duplicate key, case) | U: duplicate top-level key (`:466`) |
| `"on": schedule` (quoted key) | U: not a plain key line |
| `on: !!str schedule` (tag), `schedule: *a` (alias), `on: &t [...]` (anchor, AC12) | U: YAML indicator (`:347`) |
| `<<: *a` merge key, `? pull_request` complex key under `on:` | U: not a plain key line |
| `schedule:` at 4 spaces then `pull_request:` at 2 | U: bad indentation under on: |
| tab in indentation | U: tab outside a block scalar (`:434`) |
| CRLF line ends | read as LF (trailing CR stripped; lone CR -> U, `:422`) |
| `on: "sch\x65dule"` (escape) | D no |
| `on: \|` block scalar | D no |
| `on: [ schedule , "workflow_dispatch" ] # c` | D ok (correct) |
| `on: [schedule, [pull_request]]` | D no |
| duplicate `schedule:` keys under `on:` | D ok: harmless, both names allowed |
| `on:` last in file, `workflow_dispatch.inputs.pull_request:` nested | D ok: correct, nested keys are not triggers |
| `on: schedule` plus a top-level `true: [pull_request]` | D ok (reader ignores `true:`); see residual R3 |

## Does any allowed trigger run a PR's copy with the write token?

GitHub docs ("Events that trigger workflows", read 2026-11-27):

- `schedule`, `check_run`: `GITHUB_SHA` "Last commit on default branch", `GITHUB_REF` "Default branch"; runs only
  if the workflow file exists on the default branch. A PR's edited drift.yml never runs for these until merged
  (i.e. after review and a green merge-gate). No PR copy, no PR SHA.
- `workflow_dispatch`: runs the copy on the dispatched branch/tag (`GITHUB_SHA` = that ref). Starting it needs
  repo write, or a token with `actions: write`. Residual R1.
- GITHUB_TOKEN-made events don't start runs except `workflow_dispatch`/`repository_dispatch`. So a workflow token
  with `actions: write` could dispatch a branch copy; `actions: write` is a B2 scope (FAIL for every changed
  workflow, no exception), and no workflow on main grants it (`grep write .github/workflows/*.yml`: only
  `drift.yml:18 issues: write`).
- 4e's drift.yml content (not under this gate, noted for 4e): `check_run` job is gated to the Supabase app check
  on `main` (`if:` lines 45-50); `actions/checkout` (line 66) has no `ref:`, so it checks out the default branch;
  `head_sha` is only compared (lines 70-75), never checked out. So no PR code runs with `issues: write` today.

## Can a PR abuse `issues: write` to approve itself?

No. `.github/workflows/gate.yml:82` counts the `framework-change-approved` time only from `labeled` events where
`actor.type == "User"` and `actor.login == owner`; `:83` any `unlabeled` event (any actor) at the same time or later
voids it. A label added by `github-actions[bot]` (type `Bot`) never counts; a bot remove only fails closed. The
"label present now" check plus the owner-time check are both required. A bot label also can't trigger `gate.yml`
(GITHUB_TOKEN events start no runs). Gate re-runs read labels from the API, never the payload.

## Non-B2 write scopes next to `issues: write`

`contents: write`, `id-token: write`, `packages: write` etc. are not B2 scopes and B2 never read them, for any
workflow; the exception doesn't widen that. They give no path to a green merge-gate: posting checks/statuses,
re-running the gate (`actions`), PR labels/reviews (`pull-requests`) stay blocked. `contents: write` could push to
a PR branch (moves the head, which voids an earlier label time: fail closed) or attempt a merge (still blocked by
the required `merge-gate` check). 4e's drift.yml uses `contents: read`. Not a blocker; see R2.

## Residuals (accepted by the decision / informational, not FAILs)

- R1: a writer can `workflow_dispatch` a branch's copy of drift.yml, which runs with `issues: write`. Writers can
  already push and open issues; bot labels don't count. Noise only (open/edit/close issues, comment), no approval.
- R2: the exception checks the scope set and triggers, not the steps. A future reviewed change to drift.yml on main
  could check out `github.event.check_run.head_sha` and run PR code with `issues: write`. The impact stays as R1
  (bot labels never count) but it would break the decision's "never runs PR code" condition; code-reviewer should
  reject any drift.yml step that checks out or runs an event-provided SHA/ref.
- R3: the reader ignores unknown top-level keys such as `true:` (also in 4c). GitHub's workflow parser treats `on`
  as a string key and rejects unexpected top-level keys, so such a file doesn't run; no change asked.

## Automated results

- Secret scan: CI `secrets` job (run 45994142604, job 140489168797): PASS, gitleaks 8.30.1 full history,
  260 commits scanned, no leaks found.
- `npm audit --audit-level=high` (local, this worktree): "found 0 vulnerabilities", exit 0.
- CI `verify` (job 140489168856): PASS, `verify.sh: PASS 20/20 (0 skipped)` (includes `npm run test` with
  `gate-spoof.test.ts`). CI `db-check`: PASS. `merge-gate`: FAIL at this head only because `security-gate.md`,
  `review.md` and the person's label are still missing (expected; its spoof line is PASS).
- Supabase advisors / RLS: N/A (no DB change; verify.sh RLS check passed in CI).

## Manual diff review

Diff touches only `scripts/gate-check.sh`, `tests/integration/gate-spoof.test.ts`, `tasks/4ea/TASK_BRIEF.md` and two
decision files (allowed paths). No route, client value, raw SQL, `dangerouslySetInnerHTML`, env var, LLM or upload
change. No token or secret value in the diff or fixtures.

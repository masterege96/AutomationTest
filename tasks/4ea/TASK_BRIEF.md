# Task 4ea: drift.yml may keep `issues: write` under merge-gate spoof rule B2

| Field | Value |
|-------|-------|
| State | IN_PROGRESS |
| Owner role | devops-cicd (build: `scripts/gate-check.sh`), qa-test (tests: `tests/integration/gate-spoof.test.ts`) |
| Branch | `ci/4ea-drift-issues-exception` |
| Worktree | `../wt-4ea-devops-cicd` |
| Depends on | 4c (merged, `34fcc34`); unblocks 4e (PR #23, branch `ci/4e-drift-readonly`) |

## Request

The person's decision `tasks/decisions/2026-11-27-4ea-drift-issues-write-exception.md` (option A, "keep it, narrow
exception"): "A small gate PR first (needs your label) lets only drift.yml open issues, and only if it still never
runs on PR code". The 4c stopgap's B2 rule FAILs any new or changed workflow that grants write on checks, statuses,
issues, pull-requests, actions or security-events (tasks/4c/TASK_BRIEF.md, AC19 amendment). 4e changes
`.github/workflows/drift.yml`, which needs `issues: write` to open the `drift` issue (ORCHESTRATOR stop rule 1).

## Goal

A PR that changes `.github/workflows/drift.yml` and keeps `issues: write` as its only B2 write grant, with only
default-branch triggers, passes the spoof check with one PASS line naming the decision. Every other file, scope or
trigger fails B2 exactly as before.

## Definitions (used by every AC; terms from tasks/4c/TASK_BRIEF.md "Definitions" unchanged)

- **B2 write grant**: one fact the 4c reader already reports for B2: a workflow- or job-level `permissions` entry
  granting `write` on `checks`, `statuses`, `issues`, `pull-requests`, `actions` or `security-events`, or a
  `permissions: write-all`. Each such entry counts once. Other scopes (`contents`, `id-token`, `packages`, ...) are
  not B2 scopes and don't count either way (B2 never looked at them).
- **Drift exception**: applies to a changed workflow file only when all three hold:
  1. its path at the head is exactly `.github/workflows/drift.yml` (byte for byte; `drift.yml` at any other path,
     `.github/workflows/sub/drift.yml`, `.github/workflows/Drift.yml`, `.github/workflows/drift.yaml` don't qualify);
  2. the file has exactly one B2 write grant, and it is `issues: write` (workflow or job level, any spelling the 4c
     reader accepts). A second B2 write grant of any scope, including a second `issues: write`, or `write-all`, means
     no exception;
  3. every trigger in its `on:` is in the allowlist {`schedule`, `workflow_dispatch`, `check_run`}: events GitHub
     runs only from the default branch's workflow file (`schedule`, `check_run`), or that only someone with write
     access can start (`workflow_dispatch`). Forms read: a plain or quoted scalar (`on: schedule`), a one-line flow
     sequence (`on: [schedule, workflow_dispatch]`), a block mapping of event keys (nested settings such as
     `types: [completed]` or `inputs:` are not trigger names). Any other trigger (`pull_request`,
     `pull_request_target`, `push`, `workflow_run`, `workflow_call`, `issue_comment`, `check_suite`,
     `repository_dispatch`, anything unknown, a different case such as `Schedule`), a flow mapping `on: {...}`, a
     block sequence under `on:`, an empty or missing `on:`, or anything the reader can't read means no exception
     (fail closed). `push` is deliberately not allowed (drift.yml doesn't need it, and a push runs the pushed
     branch's own copy of the file).
- **Exception line** (stable, tests match it whole):
  `  PASS  merge-gate spoofing: .github/workflows/drift.yml: issues: write allowed (decision 2026-11-27-4ea-drift-issues-write-exception.md; triggers schedule/workflow_dispatch/check_run only)`
  printed instead of the B2 FAIL line when the drift exception applies. B1, B3 and S14-A still apply to drift.yml
  in full; the exception line doesn't stop them failing.
- **Unchanged files**: B2 (and so the exception) applies only to changed workflow files (4c). An unchanged drift.yml
  gets neither the B2 FAIL nor the exception line.

## Acceptance criteria

Fixture setup: as tasks/4c/TASK_BRIEF.md (throwaway repo per test in the OS temp dir, `main` holds the worktree's
current `gate.yml`, `ci.yml`, `drift.yml` plus `app/page.tsx`, branch `ci/9x-demo`, label current so any FAIL comes
from the spoof check). "Drift file" means a commit (before the gates) that sets `.github/workflows/drift.yml` (or the
named path) to the named content. "Base drift" = a valid workflow with `permissions:` at the workflow level
(`contents: read`, `issues: write`), one job without its own permissions, no `merge-gate` text, and the named
`on:`. Run as in 4c.

Happy paths:

- [ ] AC1 (4e's file): Given the drift file = `.github/workflows/drift.yml` from `origin/ci/4e-drift-readonly` (triggers
  `schedule`, `workflow_dispatch` with inputs, `check_run` with `types: [completed]`; workflow-level `contents: read`,
  `issues: write`), Then the exception line, no `  FAIL  merge-gate spoofing:` line, the spoof PASS line
  (`  PASS  merge-gate spoofing: no workflow at the head can report merge-gate`), `gate-check: PASS`, exit 0.
  (Fixture: a copy of that file committed into the test, or read from the ref when present; not fetched at test time.)
- [ ] AC2 (forms of the allowlist): Given base drift with, one test each, `on:` as block mapping `schedule:` only;
  `workflow_dispatch:` only; `check_run:` only; all three; `on: schedule`; `on: "workflow_dispatch"`;
  `on: [schedule, workflow_dispatch, check_run]`; `on: ['schedule', "check_run"]`, Then the exception line, no
  spoof FAIL, exit 0.
- [ ] AC3 (job level): Given base drift whose `issues: write` is on its only job instead (workflow level
  `permissions: { contents: read }`), Then the exception line, exit 0.
- [ ] AC4 (main unaffected): Given main's current drift.yml unchanged at the head (AC1 of 4c), Then no exception
  line, no B2 FAIL, spoof PASS line, exit 0. Given only a comment line added to main's drift.yml (changed, triggers
  `schedule` + `workflow_dispatch`, `issues: write`), Then the exception line, exit 0.

Abuse cases (each: `  FAIL  merge-gate spoofing: <path>: grants write access to checks, statuses, issues,
pull-requests, actions or security-events (line <n>)`, no exception line, exit 1):

- [ ] AC5 (PR-code and other triggers): base drift plus, one test each, a `pull_request:` key; `pull_request_target:`;
  `push:` (also `push: { branches: [main] }` / block `branches: [main]`); `workflow_run:`; `workflow_call:`;
  `issue_comment:`; `check_suite:`; `repository_dispatch:`; an unknown key `made_up_event:`; `Schedule:` (case).
- [ ] AC6 (list and flow forms): `on: [schedule, pull_request]`; `on: [schedule, push]`; `on: pull_request`;
  `on: { schedule: [{ cron: "1 1 * * *" }] }` (flow mapping, even with only allowed keys); `on:` with a block
  sequence `- schedule`; `on: []`.
- [ ] AC7 (another B2 scope): base drift plus, one test each at the workflow level, `checks: write`,
  `statuses: write`, `pull-requests: write`, `actions: write`, `security-events: write`; and `permissions: write-all`
  instead of the mapping.
- [ ] AC8 (job level adds a scope): base drift (workflow `issues: write`) whose job has `permissions:` with
  `checks: write` (block and flow forms); and one whose job has `issues: write` again (two B2 grants).
- [ ] AC9 (wrong path or name): the 4e drift.yml content (AC1) added, one test each, as `drift.yml` at the repo root
  (not a workflow file: no spoof line for it at all, exit 0; listed to show only the workflows dir is read),
  `.github/workflows/sub/drift.yml`, `.github/workflows/Drift.yml`, `.github/workflows/drift.yaml`,
  `.github/workflows/drift2.yml`: the B2 FAIL for that path, no exception line, exit 1.
- [ ] AC10 (B1 still applies): base drift (allowed triggers) containing `merge-gate` in a comment or a step `run:`,
  Then the exception line AND `  FAIL  merge-gate spoofing: .github/workflows/drift.yml: contains the text
  'merge-gate' (line <n>)`, exit 1.
- [ ] AC11 (S14-A and B3 still apply): base drift with a job id `gate` → the S14-A FAIL (plus the exception line),
  exit 1. Base drift whose `issues: write` is job level on job `a`, with a second job `b` without permissions and no
  workflow-level `permissions:` → the B3 FAIL, exit 1.
- [ ] AC12 (unreadable stays unreadable): base drift with an anchor in `on:` (e.g. `on: &t [schedule]`) → the
  `can't be read safely` FAIL, no exception line, exit 1.

Done gate:

- [ ] AC13: gate-check.sh's header comment states the exception (path, single `issues: write`, allowlist, the
  decision file); the existing 4c tests in `tests/integration/gate-spoof.test.ts` and
  `tests/integration/gate-check.test.ts` pass unchanged (the B2 FAIL text and line number are unchanged); new tests
  in `tests/integration/gate-spoof.test.ts`; `bash scripts/verify.sh` passes; security gate PASS; review APPROVE.

## Security rows that apply

This changes the merge-approval control (ORCHESTRATOR 3a, task 4c B2).

- [ ] Merge-gate bypass (L11 S14, 4c B2; not a numbered row): abuse tests AC5-AC12.
- [ ] Row 13: no secret or token value in any file, fixture or log.

**Why this is safe** (security confirms): `issues: write` lets a workflow token add labels to PRs, but the gate
counts the `framework-change-approved` label only from `labeled` events by the repository owner with actor type
User (gate.yml, task 4c), so a label added by `github-actions[bot]` never counts. With only `schedule`,
`check_run` (both run main's copy of the file) and `workflow_dispatch`, drift.yml never runs PR code or a PR's copy
of itself, and the exact-path rule stops a PR from adding a second file that borrows the exception. B2's other
scopes (posting checks/statuses, re-running the gate) stay blocked even for drift.yml.

**Residual:** anyone with write access can `workflow_dispatch` drift.yml on a branch, which runs that branch's copy
with `issues: write`. Writers can already push and open issues themselves, and the bot's labels don't count, so this
adds no path to a green merge-gate. A branch copy could also open or edit issues (noise, not approval).

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
# devops-cicd (build)
scripts/gate-check.sh
# qa-test (fixture tests)
tests/integration/gate-spoof.test.ts
tasks/4ea/**
```

**Protected-path note:** changes `scripts/**`, so the person's `framework-change-approved` label is needed after the
last push to it (agents never add it, AGENT_RULES 18a). This PR is judged by main's current (4c) gate; the exception
applies to 4e only after this merges and 4e gets a fresh gate run.

**Out of scope:**

- `.github/workflows/drift.yml` itself (task 4e), `gate.yml`, `ci.yml`.
- Widening the exception: other files, other scopes, `push` (even to main only), `workflow_run`.
- The GitHub App (4c-app).

## Inputs

- Decision `tasks/decisions/2026-11-27-4ea-drift-issues-write-exception.md`.
- `tasks/4c/TASK_BRIEF.md` (definitions, spoof rules S14-A/B1/B2/B3, AC19 amendment, devops-cicd interface entry).
- `scripts/gate-check.sh` (spoof reader), `tests/integration/gate-spoof.test.ts`.
- `origin/ci/4e-drift-readonly:.github/workflows/drift.yml` (the file that must pass, AC1).

## Destructive change?

- [x] No (CI gate logic and tests only)
- [ ] Yes

## Open questions

None: the design above is the person's option A as relayed; nothing widens it.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-27

- **Changed:** `tasks/4ea/TASK_BRIEF.md` (new).
- **Verified:** read the decision, the 4c brief (B2 and its AC19 amendment), `scripts/gate-check.sh` spoof reader
  (`permlevel`/`permval`, `onval`, B2 in `spoof_file`), `tests/integration/gate-spoof.test.ts`, main's `drift.yml`
  and the 4e `drift.yml` on `origin/ci/4e-drift-readonly` (no `merge-gate` text, workflow-level permissions only).
- **Left to do:** build (devops-cicd), tests (qa-test), security, review.
- **Next role must know:** the exception is stricter than the coordinator's first sketch (no `push`). "Exactly one
  B2 write grant, `issues`" means a duplicate `issues: write` at job level also loses the exception.

### devops-cicd, 2026-11-27

- **Changed:** `scripts/gate-check.sh`: the awk reader's `W` fact now carries the scope (`W<TAB><line><TAB><scope>`,
  `write-all` for write-all); new fact `D<TAB>ok|no` from `on:` (scalar, one-line flow sequence with plain or
  quoted lower-case names, block-mapping keys at the first indent; every name must be in {schedule,
  workflow_dispatch, check_run}, compared case-sensitively; flow mapping, block sequence, `[]`, no `on:` → `no`).
  In `spoof_file`, B2 prints the exception line instead of the FAIL only when `$p` is exactly
  `.github/workflows/drift.yml`, there is exactly one `W` fact with scope `issues`, and `D` is `ok`. The B2 FAIL text
  and its line number (first B2 grant) are unchanged. Header comment and the reader's fact list updated.
- **Verified:** `bash -n scripts/gate-check.sh` OK. Reader only (awk program extracted, fed directly, no
  gate-check run): the 4e drift.yml gives `W 37 issues`, `D ok`, `TP`; `on: [schedule, pull_request]` with
  `issues` + `checks` write gives two `W` facts and `D no`. No tests, verify.sh or stack run (per instructions).
- **Left to do:** qa-test writes AC1-AC12 tests in `tests/integration/gate-spoof.test.ts`; then verify.sh,
  security, review; the person's label after the last `scripts/**` push.
- **Next role must know:** exception line, matched whole:
  `  PASS  merge-gate spoofing: .github/workflows/drift.yml: issues: write allowed (decision 2026-11-27-4ea-drift-issues-write-exception.md; triggers schedule/workflow_dispatch/check_run only)`.
  It is printed even when B1/B3/S14-A FAIL the same file (AC10, AC11). Non-B2 write scopes (`contents: write`,
  `id-token: write`) don't affect the exception (B2 never read them).

### qa-test, 2026-11-27

- **Changed:** `tests/integration/gate-spoof.test.ts` (appended only; no existing 4c test changed): three
  `describe.concurrent` blocks "drift.yml issues: write exception" (happy paths AC1-AC4; abuse AC5-AC8; path and
  the other rules AC9-AC13), same fixture style (throwaway repo per case, gate-check run on it, label current).
  AC1 uses a copy of 4e's drift.yml (`origin/ci/4e-drift-readonly` at `dfc6bc5`, 175 lines, sha256 `9aa3063d...`)
  as an in-file string, so nothing is fetched. AC9's `.github/workflows/Drift.yml` is committed as an index-only
  blob (core.ignorecase off) so it sits next to `drift.yml` on case-insensitive file systems.
- **AC -> test:** AC1 "AC1: 4e's drift.yml ..."; AC2 8 forms "AC2: base drift with ..." plus 4 spellings
  "AC2/AC3 (Definitions)" (flow mapping, `Issues: 'Write'`, job-level flow, with `contents`/`id-token: write`);
  AC3 "AC3: ... only job"; AC4 two tests (unchanged main drift.yml; comment-only change); AC5 13 triggers
  (pull_request, pull_request_target, push x3 forms, workflow_run, workflow_call, issue_comment, check_suite,
  repository_dispatch, made_up_event, `Schedule:`, `Workflow_Dispatch:`); AC6 12 forms (the brief's 6 plus
  `[Schedule]`, `"Schedule"`, quoted bad item, empty item, empty `on:`, no `on:`); AC7 9 scope cases (5 scopes,
  checks before issues, flow with statuses, checks instead of issues, write-all) plus a duplicate `issues:` key;
  AC8 5 job cases (block/flow checks, second issues, two jobs each issues, job write-all); AC9 root drift.yml
  (no spoof line, PASS) plus 4 wrong paths (sub/, Drift.yml, .yaml, drift2.yml) in one run; AC10 comment and
  step run (exception line AND exact B1 FAIL); AC11 job id gate, job named gate (S14-A + exception line) and B3
  (exact B3 FAIL + exception line); AC12 `on: &t [...]`, `on: &t` block, `permissions: &p`, quoted block key
  `"issues": write` (all "can't be read safely", no exception); AC13 header static test. Abuse cases assert the
  exact 4c B2 FAIL line with its line number (first B2 grant), no exception line, exit 1.
- **Verified:** first full-file run (before fixing my one wrong test): `Tests  1 failed | 264 passed (265)` (all 4c
  tests passed unchanged). After the fix, per the orchestrator, only the new cases:
  `npx --no-install vitest run tests/integration/gate-spoof.test.ts -t "drift\.yml issues: write exception"` ->
  `Test Files  1 passed (1)`, `Tests  71 passed | 194 skipped (265)`. GitHub's Linux CI runs the full file.
  `tsc --noEmit` and `eslint` on the file clean. gate-check.test.ts not run (no shared helper touched).
  verify.sh and the stack not run (per instructions).
- **Bugs found:** none in gate-check.sh. One test of mine was wrong and was fixed: a quoted block key
  `"issues": write` is outside the 4c reader's subset (4c already expects a FAIL for `"checks": write` block), so
  it is now an AC12 fail-closed case, not a happy path.
- **Left to do:** verify.sh, security gate, review; the person's label after the last `scripts/**` push.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

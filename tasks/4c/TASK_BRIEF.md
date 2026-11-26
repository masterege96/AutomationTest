# Task 4c: merge-gate spoofing stopgap (S14, retarget variant, F2)

| Field | Value |
|-------|-------|
| State | IN_REVIEW |
| Owner role | devops-cicd (build: `scripts/gate-check.sh`, `.github/workflows/gate.yml`), qa-test (tests: `tests/integration/**`) |
| Branch | `ci/4c-gate-spoofing-stopgap` |
| Worktree | `../wt-4c-devops-cicd` |
| Depends on | 4b (merged, `26119bc`) |

## Request

Orchestrator, step 4 plan row 4c, the person's decision `tasks/decisions/2026-11-25-4-step4-choices.md` item 1
("Yes, all five"): ship the **stopgap first**, the GitHub App later (4c-app). The stopgap:

- **S14** (`tasks/lessons.md` L11): gate-check FAILs when any workflow file at the PR head (read from the PR commit
  with git, never executed) defines a job id or job `name:` equal to `merge-gate` or `gate`, or a step/check that
  could report a check run named `merge-gate`, except `.github/workflows/gate.yml` as it exists on main (compared
  with main, so a PR that changes gate.yml itself can't whitelist itself). Cover YAML spellings (quotes, anchors,
  matrix-generated names, `name: ${{ ... }}` expressions fail closed), multiple documents, nested directories.
- **Retarget variant** (L11, second S14 variant): an `edited` (retarget) event re-runs the gate, and a previously
  green run on another base can't be re-used; state what is checkable.
- **F2** (`specs/4b/security-gate.md`, round 2): gate.yml reads the current labels from the GitHub API
  (`GET .../issues/{pr}/labels`) in the read step instead of the event payload, failing closed if that read fails;
  re-running an old `labeled` run after the person removed the label FAILs.

## Goal

A PR whose head contains any workflow that could post a `merge-gate` (or `gate`) check gets a red `merge-gate`
with a line naming the file and the reason, even when the person's label is on it. The gate decides on the PR's
current labels and base as GitHub reports them when the run starts, not on a re-used event payload.

## Definitions (used by every AC)

- **Base**: the `--base` ref (`origin/main` in CI, `main` in fixtures). **Head**: the `--head` commit.
- **Workflow file at the head**: every blob in the head commit's tree under `.github/workflows/` whose name ends in
  `.yml` or `.yaml` (any case), **including nested directories** (GitHub only runs the top level; scanning the
  rest too fails closed, see Q3). Read with git from the head commit only; the working tree, the index and
  untracked files are never read.
- **Exempt gate file**: `.github/workflows/gate.yml` at the head, when (a) its blob id equals the base's
  `.github/workflows/gate.yml` blob id, or (b) it differs but its only trigger is `pull_request_target` (so the
  head's copy can't run for this PR; see Q1). Only that exact path can be exempt; the same content at any other path
  is checked like every other file.
- **Changed workflow file**: a workflow file at the head that doesn't exist at the base or whose blob id differs
  from the base's blob at the same path.
- **Reserved name**: `merge-gate` or `gate`, compared case-insensitively after trimming whitespace and YAML quotes
  (Q2).
- **Spoof rules**: S14-A (job identity) applies to every workflow file at the head except the exempt gate file.
  S14-B (reporting) applies to every changed workflow file; for an exempt gate file under (b) only S14-B2/B3 apply.
- **Output** (as in 4b: indented `  PASS  ` / `  FAIL  ` lines, last line `gate-check: PASS` exit 0 or
  `gate-check: FAIL` exit 1, bad arguments exit 2). New line prefixes the tests match (wording after them is free):
  - `  FAIL  merge-gate spoofing: <path>: ` + reason (one line per file and reason).
  - `  PASS  merge-gate spoofing: no workflow at the head can report merge-gate` when no spoof rule fails.
  The spoof check always runs: it does not depend on the label, on whether the PR's net change touches workflows,
  or on the other checks' results.

## Acceptance criteria

Fixture setup (qa-test, as in 4b: a throwaway git repo per test in the OS temp dir, no network, no GitHub): `main`
holds copies of the repo's current `.github/workflows/gate.yml`, `ci.yml` and `drift.yml` plus `app/page.tsx`;
branch `ci/9x-demo` with one code commit then valid gates (4b fixture). "Spoof file" means a commit (before the
gates, so the gates stay fresh) adding `.github/workflows/x.yml` with the content named in the AC. Run as
`bash <worktree>/scripts/gate-check.sh --base main --head <sha> --branch ci/9x-demo`. Unless stated the label is
current (4b inputs set so the protected-path rule PASSes), so any FAIL comes from the spoof check.

S14-A, job identity:

- [ ] AC1 (baseline, no regression): Given the head's workflow files are main's unchanged `gate.yml`, `ci.yml`,
  `drift.yml`, Then `  PASS  merge-gate spoofing:` and `gate-check: PASS`, exit 0. (Deleting a workflow is left
  to 4b's label rule; AC1 asserts only the unchanged case.)
- [ ] AC2 (job id): Given a spoof file with job id `merge-gate:` (one test) and job id `gate:` (one test), with a
  `pull_request` trigger and a harmless step, Then `  FAIL  merge-gate spoofing: .github/workflows/x.yml:` and
  `gate-check: FAIL`, exit 1.
- [ ] AC3 (job name): Given a spoof file with job id `build` and job `name: merge-gate` (and one test with
  `name: gate`), Then the AC2 FAIL line, exit 1.
- [ ] AC4 (spellings, one test each, all FAIL as AC2): job id or job name written as `"merge-gate"`, `'merge-gate'`,
  `Merge-Gate`, `MERGE-GATE`, `name:   merge-gate   ` (extra spaces), `name: merge-gate # comment`,
  `"name": merge-gate` (quoted key), `name : merge-gate` (space before the colon), `name: "merge\x2dgate"` and
  `name: "merge-gate"` (escapes), `name: >-` / `name: |` block scalar with `merge-gate` on the next line,
  a job id with an anchor `merge-gate: &j` and a second job `<<: *j` (merge key), a job name via alias
  (`name: *n` with `&n merge-gate` defined elsewhere in the file), a flow mapping `jobs: { merge-gate: {...} }`,
  a job written as `build: { name: merge-gate, runs-on: ubuntu-24.04, steps: [...] }`, an explicit key
  `? merge-gate`, and each of the above with CRLF line endings and with a UTF-8 BOM.
- [ ] AC5 (expressions, fail closed): Given a job `name: ${{ matrix.n }}` with `matrix: { n: [merge-gate] }`, and
  separately `name: build-${{ github.run_id }}` (harmless value), Then the AC2 FAIL line for both, exit 1: any job
  name containing `${{` FAILs, whatever it evaluates to.
- [ ] AC6 (matrix without a name): Given job id `build` with a matrix and no `name:`, Then no spoof FAIL (GitHub
  names it `build (<values>)`), `gate-check: PASS`, exit 0. Given job id `merge-gate` with a matrix, Then FAIL (AC2).
- [ ] AC7 (can't read it safely, fail closed): Given a workflow file at the head that the checker can't read with
  certainty, Then a `  FAIL  merge-gate spoofing: <path>:` line saying it can't be read safely, exit 1. Cases, one
  test each: a second YAML document (a `---` line after content, and a `...` end marker); tab indentation inside
  `jobs:`; a YAML tag (`!!str merge-gate`) on a job key or name; duplicate job `name:` keys in one job (`name: ok`
  then `name: merge-gate`); duplicate `jobs:` keys; a file that isn't valid UTF-8. A false FAIL here is acceptable;
  a PASS for a file that defines a reserved job is not.
- [ ] AC8 (where files are found): Given the AC2 job in, one test each, `.github/workflows/x.yaml`,
  `.github/workflows/X.YML`, `.github/workflows/sub/x.yml` (nested, Q3), Then the AC2 FAIL line naming that path,
  exit 1. Given the same content in `.github/x.yml`, `docs/x.yml` or `.github/workflows/x.yml.txt`, Then no spoof
  FAIL (4b's protected-path rule still applies to `.github/**`), exit 0 with the label current.
- [ ] AC9 (symlinks, fail closed): Given `.github/workflows/x.yml` committed as a symlink (mode 120000), or
  `.github/workflows` itself a symlink or a submodule at the head, Then a `  FAIL  merge-gate spoofing:` line, exit 1.
- [ ] AC10 (head only, read with git): Given the fixture's working tree checked out at `main` and `--head` a commit
  with a spoof file, Then FAIL (AC2). Given a clean head but an uncommitted or untracked spoof file in the working
  tree, Then no spoof FAIL, exit 0. The checker never writes into, checks out or runs anything from the head.
- [ ] AC11 (label doesn't help): Given a spoof file and the person's label current for it (4b inputs PASS), Then the
  AC2 FAIL line and `gate-check: FAIL`, exit 1.
- [ ] AC12 (other step and job names are fine): Given a changed workflow file (not `x.yml` spoof) whose job is
  `build` and which has a **step** `name: check gate config` and no `merge-gate` text, Then no spoof FAIL, exit 0.

The exempt gate file (S14 "except gate.yml as on main"):

- [ ] AC13 (unchanged gate.yml exempt): Given only main's unchanged `gate.yml` (job `merge-gate`) and a spoof-free
  head, Then no `  FAIL  merge-gate spoofing: .github/workflows/gate.yml` line (same fixture as AC1, asserted by name).
- [ ] AC14 (same content elsewhere): Given a copy of main's `gate.yml` added as `.github/workflows/gate2.yml` (and,
  separately, `gate.yml` renamed to `.github/workflows/merge.yml`), Then
  `  FAIL  merge-gate spoofing: .github/workflows/gate2.yml:` (resp. `merge.yml`), exit 1.
- [ ] AC15 (changed gate.yml can't whitelist itself): Given the head's `gate.yml` changed so that it also triggers on
  `pull_request` (one test), `push` (one test), `workflow_dispatch` (one test), or its trigger list can't be read
  with certainty (e.g. triggers given through an anchor/alias), Then
  `  FAIL  merge-gate spoofing: .github/workflows/gate.yml:`, exit 1, label current or not.
- [ ] AC16 (changed gate.yml, `pull_request_target` only, Q1 default): Given the head's `gate.yml` differs from
  main's only in a comment line and still triggers only on `pull_request_target`, Then no spoof FAIL; the 4b
  protected-path rule decides (FAIL `without the person's 'framework-change-approved' label` when no label, PASS
  with a current label).
- [ ] AC17 (main moved on): Given the branch was cut before main changed `gate.yml` (head's copy = main's old
  version, `pull_request_target` only, PR net change doesn't touch it), Then no spoof FAIL and no label needed,
  `gate-check: PASS`, exit 0.

S14-B, steps that could report a check or status named `merge-gate` (changed workflow files only):

- [ ] AC18 (B1, the text): Given a changed workflow file that contains `merge-gate` anywhere (case-insensitive:
  a step `name:`, a `run:` line such as `gh api .../statuses/$SHA -f context=merge-gate`, an action input
  `name: merge-gate`, an `env:` value, a comment), Then `  FAIL  merge-gate spoofing: <path>:`, exit 1. Not applied
  to an exempt gate file (it names its own job).
- [ ] AC19 (B2, write access to checks or statuses): Given a changed workflow file whose `permissions` (workflow or
  any job level) grants `checks: write`, `statuses: write`, or is `write-all` (each spelling of AC4 that applies:
  quotes, case, flow mapping), Then `  FAIL  merge-gate spoofing: <path>:`, exit 1. `contents: read`,
  `pull-requests: read`, `issues: write` alone don't trigger it.
- [ ] AC20 (B3, token permissions left to the repo default): Given a changed workflow file with no `permissions:`
  at the workflow level and at least one job without its own `permissions:`, Then
  `  FAIL  merge-gate spoofing: <path>:`, exit 1 (the repo default may include write access to checks/statuses;
  fail closed, Q6). Given `permissions: {}` or `permissions: read-all` at the workflow level, Then no B3 FAIL.
- [ ] AC21 (unchanged files keep working): Given the head's `ci.yml` unchanged from main (it contains the text
  `merge-gate` in a comment), Then no B1 FAIL (AC1). Given `ci.yml` changed only by an extra comment line elsewhere,
  Then the B1 FAIL line for `ci.yml` (its existing comment mentions `merge-gate`), exit 1: accepted, the builder
  removes the word when touching ci.yml (note for devops-cicd).

Retarget variant (what main's gate can check):

- [ ] AC22 (re-run on retarget, static): `.github/workflows/gate.yml` still triggers on `pull_request_target` with
  types including `opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`, `edited` (4b AC23 unchanged).
- [ ] AC23 (current base, not the payload): gate.yml reads the PR's current base branch from the GitHub API at run
  time (read-only, the workflow's own token) and the gate job FAILs unless both that value and the payload's base
  are `main`; if the read fails, the job FAILs. Static check by qa-test (the read exists, no write call, the Gate
  step depends on it), plus AC31.
- [ ] AC24 (a retargeted head that carries another branch's gate): Given a head whose `gate.yml` was replaced by an
  always-pass version that also triggers on `pull_request` (the version a side branch would carry), Then AC15's
  FAIL. If that version triggers only on `pull_request_target`, Then 4b's label rule FAILs it without a current label
  (AC16). Fixture test.
- [ ] AC25 (documented residual, not testable here): the brief's Handoff and the gate-check.sh header state that a
  green `merge-gate` produced by **another base branch's** `gate.yml` (PR opened against a side branch, then
  retargeted to main, then the old run re-run) is not visible to main's gate and stays possible until 4c-app pins
  the required check to the App. Same for a check run or commit status named `merge-gate` posted onto the PR's head
  SHA by a workflow on another branch (not at the head). Security confirms the wording.

F2, labels from the API:

- [ ] AC26 (static): gate.yml derives "the `framework-change-approved` label is on the PR now" from the current
  labels read from the GitHub API in the read step (read-only, the workflow's own token, all pages); no expression
  in gate.yml reads `github.event.pull_request.labels`. The Gate step still gets no token.
- [ ] AC27 (fail closed, static): if the labels read fails (API error, unparseable answer), the gate job FAILs and
  the log names the failed read (Q4 default: the job fails even when the PR changes no protected path).
- [ ] AC28 (gate-check interface unchanged): `FRAMEWORK_CHANGE_APPROVED`, `FRAMEWORK_LABEL_TIME`, `PR_HEAD_PUSHES`
  keep their 4b meaning and format; the 4b tests in `tests/integration/gate-check.test.ts` pass unchanged.

After merge (orchestrator with the person, on throwaway PRs that are never merged, closed and their branches
deleted afterwards; recorded in this brief's Handoff):

- [ ] AC29 (F2 live): label a PR that changes a protected path (green), remove the label (red), re-run the earlier
  `labeled` run with `gh run rerun` → red with `  FAIL  pipeline/framework files changed without the person's
  'framework-change-approved' label`.
- [ ] AC30 (S14 live): a PR adding `.github/workflows/x.yml` with a `pull_request` job named `merge-gate` that only
  sleeps then succeeds (`permissions: {}`, no secrets): main's `merge-gate` is red with the spoof line. Record what
  GitHub then reports for the PR (`gh pr view <n> --json mergeStateStatus` and the required-check list) **after the
  spoof job finished green**: if GitHub counts it as passing, the stopgap only makes the spoof visible and the
  orchestrator raises 4c-app's priority with the person.
- [ ] AC31 (retarget live): retarget a PR with a green gate from `main` to a side branch and back: the `edited` run
  appears each time; while the base isn't `main` the gate is red; re-running an earlier run after the retarget away
  from `main` is red (AC23).

Done gate:

- [ ] AC32: new tests in `tests/integration/` (Vitest), run in `npm test` on Windows Git Bash and on the CI runner
  without network or a GitHub token, leave nothing outside the OS temp dir; gate-check.sh's header comment describes
  the spoof rules and the residuals of AC25; gate.yml keeps 4b AC23/AC24 (permissions `read`/`none` only, SHA-pinned
  checkout, `persist-credentials: false`, no PR code checked out or run, "Only PRs into main" and head-SHA pin steps);
  no new tool or dependency (PROJECT_CONTEXT; the YAML check must work with what gate-check already uses on both
  platforms); `bash scripts/verify.sh` passes; security gate PASS; review APPROVE.

## Security rows that apply

From `rules/security-baseline.md` (security confirms in Design). This is the merge-approval control itself
(ORCHESTRATOR 3a): a spoofed PASS means unreviewed code can deploy migrations to production.

- [ ] Row 13: no secret or token value in any file, fixture or log; gate.yml uses only `GITHUB_TOKEN` read scopes.
  abuse test: AC26, AC27, AC32.
- [ ] Merge-gate bypass (L11 S14 and its retarget variant, F2; not a numbered row): abuse tests AC2-AC11, AC14,
  AC15, AC18-AC20, AC24, AC29-AC31.
- Security, please also check: the YAML-reading approach against spellings not listed in AC4/AC7 (fail closed is
  the requirement, not the list); that B1-B3 close the "step reports a check" path for workflows at the head (token
  write scopes are the only way a workflow without stored secrets can post a check or status); the AC25 residual
  wording; the standing step-4 check (no new `SUPABASE_*` secret reads outside `drift.yml`).

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
# devops-cicd (build)
scripts/gate-check.sh
.github/workflows/gate.yml
# qa-test (fixture tests and gate.yml static checks)
tests/integration/**
```

**Protected-path note:** this PR changes `scripts/**` and `.github/workflows/**`, so it needs the person's
`framework-change-approved` label, applied after the last push that changed those files (4b rule; agents never add
it, AGENT_RULES 18a). gate.yml runs from main (`pull_request_target`), so **this PR is judged by main's current
(4b) gate**; the spoof rules and the API label/base reads apply only after merge. After merge, open PRs whose head
`gate.yml` differs from main's still pass the spoof check if it's `pull_request_target`-only (AC17); merging main
into them is not required for the spoof check.

**Out of scope:**

- The GitHub App (4c-app, later in the step-4 order): an App posts the `merge-gate` check and branch protection pins
  the required check to it. The person creates the App and stores its private key as a `production`-environment
  secret, following step-by-step instructions the orchestrator provides when it's time. Not started here.
- Detecting checks or statuses posted by workflows on **other** branches, and re-runs of runs produced by another
  base branch's gate.yml (AC25 residual; 4c-app).
- `ci.yml` (incl. its payload-label read for `destructive-approved`, same F2 pattern; L16), `drift.yml`,
  `scripts/verify.sh`, branch protection and repo settings (the person's, AGENT_RULES 18a).
- Updating `ORCHESTRATOR.md` 3a and `tasks/lessons.md` L11 to the new rules (the person's file / orchestrator after
  merge).
- Stored secrets other than `GITHUB_TOKEN` in new workflows (a personal token could post checks; Q5).

## Inputs

- `scripts/gate-check.sh`, `.github/workflows/gate.yml`, `.github/workflows/ci.yml`, `.github/workflows/drift.yml`
  (main at `26119bc`), `ORCHESTRATOR.md` 3a.
- `tasks/lessons.md` L11 (S14 and the retarget variant); `specs/4b/security-gate.md` F2; `tasks/4b/TASK_BRIEF.md`
  (fixture conventions, Q1 env interface); `tasks/4/PLAN.md` row 4c; decision `tasks/decisions/2026-11-25-4-step4-choices.md`.
- Example test: `tests/integration/gate-check.test.ts`.
- No `specs/4c/schema.md` (no DB). `specs/4c/threat-model.md` from security if the orchestrator asks for one.

## Destructive change?

- [x] No (CI gate logic and tests only; no data, no production)
- [ ] Yes

## Open questions (defaults apply unless the person says otherwise)

- Q1 (the person): a PR that changes `gate.yml` itself. Default: the changed gate.yml is exempt from S14-A and B1
  only if `pull_request_target` is its only trigger (its head copy can't run for its own PR), and the 4b label rule
  still applies. Alternative (literal request): exempt only when the blob equals main's; then no PR can ever change
  gate.yml again (a changed gate.yml always defines `merge-gate`), which would block 4c-app. Not recommended.
- Q2: reserved names compared case-insensitively and trimmed. Default: yes (fails closed if GitHub matches check
  names case-sensitively).
- Q3: workflow files in nested directories are scanned too. Default: yes (GitHub doesn't run them; scanning costs
  nothing and doesn't depend on that).
- Q4: a failed labels or base read fails the whole gate job, even for PRs that change no protected path. Default:
  yes (literal "fail closed"; a re-run reads the API again). Alternative: treat a failed labels read as "no label",
  so only PRs that need the label go red.
- Q5: new or changed workflows that read a stored secret (other than `GITHUB_TOKEN`) could post a check with it.
  Default: not covered (the repo has no such token secret; the label review covers it; 4c-app closes it).
- Q6: B3 fails a changed workflow that leaves token permissions to the repo default. Default: yes (all three current
  workflows set `permissions:` at the workflow level).

## Handoff notes for others

- **The person:** label this PR after its last protected-path push (4b rule). Q1 is the one that matters: the default
  keeps gate.yml changeable for 4c-app.
- **Orchestrator:** after merge run AC29-AC31 with the person; if AC30 shows GitHub accepts the spoofed green check,
  raise 4c-app's priority. Mark S14 "narrowed, residual AC25" in L11, F2 fixed.
- **devops-cicd:** no YAML parser is listed in PROJECT_CONTEXT; if the check can't be done reliably with the tools
  gate-check already uses, BLOCKED back with a proposal rather than a weaker rule. The ci.yml comment that mentions
  `merge-gate` will trip B1 the next time ci.yml changes (AC21).
- **qa-test:** fixture copies of `gate.yml`/`ci.yml`/`drift.yml` should come from the worktree's current files at test
  time, so AC1 keeps tracking main.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-26

- **Changed:** `tasks/4c/TASK_BRIEF.md` (new).
- **Verified:** read `scripts/gate-check.sh`, `gate.yml`, `ci.yml`, `drift.yml` on main `26119bc`, ORCHESTRATOR 3a,
  plan row 4c, the step-4 decision, L11, the 4b brief and security gate (F2). No current workflow job uses a reserved
  name except gate.yml's `merge-gate`; `ci.yml` line 3 mentions `merge-gate` in a comment.
- **Left to do:** build (devops-cicd), tests (qa-test), security, review; AC29-AC31 after merge.
- **Next role must know:** the stopgap makes main's real `merge-gate` red; whether GitHub also ignores a same-named
  green check from a spoof job is GitHub's behaviour, not changed here (AC30 records it). The retarget variant's
  re-run of another branch's gate run is not checkable by main's gate (AC25); AC22-AC24 are what is.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-26 (inputs)

- Q1-Q6: build with the stated defaults; the person sees them in the PR before adding the label.
- No YAML parser is in PROJECT_CONTEXT: if a safe check is not possible with git + text tools, set BLOCKED with a proposal (no new dependency without the person).

### devops-cicd, 2026-11-26 (interface, for qa-test)

The 4b interface is unchanged (`FRAMEWORK_CHANGE_APPROVED`, `FRAMEWORK_LABEL_TIME`, `PR_HEAD_PUSHES`, same meaning
and format; 4b tests need no change, AC28). Two **new, optional environment inputs**; when a variable is **unset**
gate-check behaves exactly as in 4b (fixtures and local runs), when it is **set (even to an empty string)** it is
used. gate.yml always sets both, from read-only GitHub API calls made when the run starts.

| Variable | Meaning | Format | gate-check rule |
|----------|---------|--------|-----------------|
| `PR_CURRENT_LABELS` | The PR's labels as GitHub reports them now (`GET /repos/{repo}/issues/{pr}/labels`, all pages) | one label name per line, blank lines and trailing CR ignored | The label counts as on only when `FRAMEWORK_CHANGE_APPROVED=1` **and** one line is exactly `framework-change-approved`. Missing from the list → the 4b `  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:` line (F2 / AC29). Consulted only when protected paths changed, like the other label inputs. |
| `PR_CURRENT_BASE` | The PR's base branch as GitHub reports it now (`GET /repos/{repo}/pulls/{pr}`, `.base.ref`) | the branch name, exactly `main` to pass | Checked on every run where it is set: exactly `main` → `  PASS  PR base is main`, anything else (empty, another branch, more than one line) → `  FAIL  PR base is not main`. |

In gate.yml `FRAMEWORK_CHANGE_APPROVED` is now derived from the same API label list (no expression reads
`github.event.pull_request.labels`). A failed labels or base read fails the gate job in the read step with
`::error::could not read the PR's current labels ...` / `::error::could not read the PR's current base branch ...`
(Q4), so the Gate step never runs on a failed read.

**New output lines** (prefixes stable; wording after the prefix may be matched by the quoted substrings below):

- `  PASS  merge-gate spoofing: no workflow at the head can report merge-gate` (no spoof rule failed; always printed
  in that case, the check always runs).
- `  FAIL  merge-gate spoofing: <path>: <reason>`, one line per file and reason. Reasons (substrings):
  - S14-A: `job id '<id>' is a reserved check name`; `job '<id>' is named '<name>', a reserved check name`;
    `job '<id>' name contains a ${{ }} expression`.
  - unreadable (AC7, also BOM/CRLF are accepted, not unreadable): `can't be read safely (line <n>: <why>)`.
  - AC9: `is a symlink or submodule, can't be read safely` (for the file, or with `<path>` = `.github` /
    `.github/workflows` when that is not a directory); a path git has to quote (non-ASCII, control characters)
    under `.github` also fails as `can't be read safely`.
  - AC15/AC24: `.github/workflows/gate.yml: changed gate.yml has a trigger other than pull_request_target (or its
    triggers can't be read), so it isn't exempt` (plus the S14-A line for its `merge-gate` job).
  - B1: `contains the text 'merge-gate' (line <n>)`.
  - B2: `grants write access to checks or statuses (line <n>)`.
  - B3: `leaves the token permissions to the repo default (no workflow-level permissions:, job '<id>' has none)`.
- `  PASS  PR base is main (read from GitHub when the run started)` / `  FAIL  PR base is not main (GitHub reports
  '<value>') ...` (only when `PR_CURRENT_BASE` is set).

Last line and exit codes unchanged (`gate-check: PASS` 0, `gate-check: FAIL` 1, bad arguments 2).

Reading model (so fixtures know what is "safe"): workflow files are listed with `git ls-tree -r <head>` and read
with `git cat-file blob`, nothing from the working tree. A strict line-based reader accepts only: block mappings
and sequences indented with spaces, plain keys (`[A-Za-z0-9_][A-Za-z0-9_.-]*`, optional spaces before `:`),
single-line plain / single-quoted / double-quoted values, single-line flow collections, block scalars `|` `>` with
`-`/`+` (no indentation indicator), comments, one leading `---`, a leading UTF-8 BOM, CRLF line ends. Anything
else (anchors, aliases, tags, merge keys, explicit `?` keys, quoted keys, tabs outside block scalars, multi-line
plain/quoted/flow values, a second document or `...`, directives, invalid UTF-8, control characters, a lone CR,
duplicate top-level / job-id / job-level keys, a flow-mapping `jobs:` or job) → `can't be read safely`. A job
`name:` that is empty, a block scalar, a flow value, contains a backslash in double quotes, or non-ASCII →
`can't be read safely` too.

### devops-cicd, 2026-11-26 (build)

- **Changed:** `scripts/gate-check.sh` (spoof check, `PR_CURRENT_LABELS` / `PR_CURRENT_BASE`, header with the spoof
  rules and the AC25 residuals), `.github/workflows/gate.yml` (read step also reads current labels and base; Gate
  step derives `FRAMEWORK_CHANGE_APPROVED` from them). Commits `b7c5019` (interface entry above, unchanged since)
  and `c780e73` (build). Not BLOCKED: the check needs only git, bash, grep, sed, tr and POSIX awk (awk is already used
  by `verify.sh`, `board.sh`, `lessons.sh`); the awk reader also runs under `gawk --posix` (proxy for the runner's mawk).
- **How it reads:** `git ls-tree -r` of the head commit, filtered to `.github` entries (case-insensitive), blobs via
  `git cat-file blob`; no checkout, no working tree. Per file: NUL / UTF-8 / control-character / NEL-LS-PS checks
  (grep with byte classes), then the strict line reader (subset in the interface entry). Exempt (a) = path exactly
  `.github/workflows/gate.yml` with the base's blob id; exempt (b) = changed but `on:` is exactly
  `pull_request_target` (scalar, `[x]` or a one-key mapping).
- **gate.yml:** same step (name kept from 4b so the token-step test still finds it): `gh api --method GET --paginate
  repos/$REPO/issues/$PR/labels?per_page=100 --jq '.[].name'` and `gh api --method GET repos/$REPO/pulls/$PR --jq
  '.base.ref'`; either failing (or an empty base) → `::error::could not read the PR's current labels|base branch ...`
  and `exit 1` (Q4). No expression reads `github.event.pull_request.labels`; token still only in that step; no
  `${{ }}` in run blocks; permissions, checkout pin, `persist-credentials: false`, "Only PRs into main" and the head
  pin unchanged. Field names confirmed with read-only GETs on PR #17 (`.[].name` → `framework-change-approved`,
  `.base.ref` → `main`).
- **Scratch-fixture evidence** (throwaway repos in the OS temp dir, deleted on exit; main = this worktree's
  `gate.yml`/`ci.yml`/`drift.yml` + `app/page.tsx`, branch `ci/9x-demo`, spoof commit before fresh gates, label inputs
  current unless stated; 81 cases, all as expected):
  - PASS exit 0: AC1 baseline; AC6 matrix without name; AC8 `.github/x.yml`, `docs/x.yml`, `x.yml.txt`; AC12 step
    `name: check gate config`; AC19 `issues: write` + reads; AC20 `read-all`, and per-job permissions; block-scalar
    content `name: gate` inside `run: |`; AC10 untracked spoof in the working tree; AC16 comment-only gate.yml change
    with label; AC17 main changed gate.yml after the branch cut, no label; F2 `PR_CURRENT_LABELS` containing the label;
    `PR_CURRENT_BASE=main`.
  - FAIL exit 1 with `  FAIL  merge-gate spoofing: <path>:`: AC2 (id `merge-gate`, `gate`); AC3 (name `merge-gate`,
    `gate`); AC4 `"merge-gate"`, `'merge-gate'` id, `Merge-Gate`, `MERGE-GATE`, extra spaces, trailing comment,
    `"name":` key, `name :`, `"merge\x2dgate"`, `>-` and `|` block names, anchor + `<<: *j` (also when only the
    second job merges), alias `*n`, flow `jobs: {...}`, flow job, `? merge-gate`, CRLF, BOM; AC5 both expressions;
    AC6 `merge-gate` with matrix; AC7 second `---`, `...`, tab, `!!str` value and key, duplicate `name:`, duplicate
    `jobs:`, invalid UTF-8; AC8 `x.yaml`, `X.YML`, `sub/x.yml`; AC9 file symlink, `.github/workflows` symlink and
    submodule; AC10 head-only with the working tree at main; AC11 (every spoof case has the label current);
    AC14 `gate2.yml` copy and rename to `merge.yml`; AC15 `pull_request`, `push`, `workflow_dispatch`, `on: &t`;
    AC18 `context=merge-gate` in `run:`, comment `# Merge-Gate`; AC19 `checks: write`, job `Statuses: 'Write'`,
    `WRITE-ALL`, flow `{ contents: read, "checks": write }`; AC20 one job without permissions; AC21 ci.yml + one
    comment line (B1 on its line 3); AC24 always-pass + `pull_request`; extra: name on the next line, plain
    continuation, escaped multi-line double quote, lone CR, `name:` after a same-indent `steps:` list, `name:` after a
    block scalar.
  - Other FAIL exit 1: AC16 / AC24 (prt-only) without label → 4b `without the person's 'framework-change-approved'
    label:` line (spoof PASS); F2 `PR_CURRENT_LABELS=other` and `=""` with `FRAMEWORK_CHANGE_APPROVED=1` → same line;
    `PR_CURRENT_BASE=side` and `""` → `  FAIL  PR base is not main`.
- **Tests (not run in full: shared PC):** one partial `npx vitest run tests/integration/gate-check.test.ts
  tests/integration/task-scripts.test.ts` (interrupted by the pause): the 4b gate-check fixture tests pass, except two
  F1 tests that failed in `git init` when the run was stopped (environmental); **two 4b static tests fail by design**
  and need qa-test to update them for AC26: `AC24: the read step only reads ...` (`expected 4 to be 2`: the step now
  has four `gh api` GETs) and `AC24: fail closed ...` (it requires the payload expression
  `FRAMEWORK_CHANGE_APPROVED: ${{ contains(github.event.pull_request.labels.*.name, ...) }}` that AC26 forbids).
  `task-scripts.test.ts > lessons.sh > AC7: no open lessons` also failed (also in verify.sh); this diff doesn't touch
  `lessons.sh` or lessons files, so it looks unrelated (qa-test / orchestrator to confirm). Earlier
  `bash scripts/verify.sh --no-db --brief tasks/4c/TASK_BRIEF.md` (before the pause): `verify.sh: FAIL 2/15 failed:
  npm run test, npm run test:e2e (1 skipped)`; scope, typecheck, lint, build PASS; test:e2e needs the local stack env.
- **Platform notes (for qa-test):** on Git Bash, `$'\r'` passed as an awk `-v` value arrives empty and `grep -iF`
  aborts in the C locale, so the script sets CR/TAB/BOM inside awk and matches `merge-gate` with bracket classes.
  A gate-check run takes ~10 s on this PC (process start-up), so fixture tests need a generous timeout.
- **Left / next role must know:** qa-test: AC1-AC28 tests plus the two static-test updates above; fixture copies of
  the workflows from the worktree. The ci.yml line-3 comment mentioning `merge-gate` will trip B1 the next time ci.yml
  changes (AC21; ci.yml is out of scope here), and an open PR cut before main changes ci.yml now FAILs B1 on it
  until it merges main (its copy counts as changed). Residuals (AC25) are in the gate-check.sh header
  for security to confirm. AC29-AC31 after merge. This PR changes protected paths: the person labels it after the last
  push.

### qa-test, 2026-11-26

- **Changed:** `tests/integration/gate-spoof.test.ts` (new, 163 tests), `tests/integration/gate-check.test.ts` (the two
  4b static tests that fail by design under AC26: `AC24: the read step only reads ...` now expects 4 `gh api` GETs incl.
  one paginated `issues/$PR/labels` and one `pulls/$PR` `.base.ref`; `AC24: fail closed ...` now requires the labels/base
  files to be emptied first, `FRAMEWORK_CHANGE_APPROVED` derived from the API labels with `grep -qxF`, `PR_CURRENT_LABELS`
  passed, and no `github.event.pull_request.labels` / `labels.*.name` anywhere; every other 4b assertion unchanged).
  Commit `caab16c`.
- **Fixtures:** as in 4b (throwaway repos in the OS temp dir, removed in `afterAll`, fixed identities/dates, no network,
  no token); main = this worktree's `gate.yml`/`ci.yml`/`drift.yml` read at test time (CRLF -> LF) + `app/page.tsx`;
  branch `ci/9x-demo`, code commit, spoof commit, gates; label current unless stated (push of the head at T1, label T2).
  Symlinks/submodules are index-only entries (`update-index --cacheinfo`); commits stage only their own paths.
  **Batching:** a gate-check run costs ~10 s per run plus ~10-15 s per workflow file on this PC under load, so cases
  with the same expected overall result share one fixture head (one file per case, each test asserts the FAIL line(s)
  for its own path; the script judges each file on its own). Tests run `describe.concurrent` (Vitest default 5), async
  child processes, timeout 20 min per test.
- **Verified:** `npx vitest run tests/integration/gate-spoof.test.ts`: **163 passed** (31m46s wall on the shared PC).
  `npx vitest run tests/integration/gate-check.test.ts`: **84 passed, 1 failed** = `F1 intermediate differing push (GS2,
  GS, H)` **timed out** (130 s / 133 s against its 120 s limit, also when run alone); it makes two gate-check runs and the
  PC ran ~40-60 s per run at the time (one 4c baseline run took 42 s vs 8 s earlier). The 4c change adds no work to 4b
  fixtures (no `.github` entries), so this is load, the same class as `task-scripts.test.ts > lessons.sh > AC7` (fixed
  on PR #19 / 4d); not changed here. Both updated 4b static tests pass. `tsc --noEmit` and `eslint` clean on both files.
  Not run: `verify.sh`, the rest of `npm test` (shared PC).
- **Script bugs found:** none. Every AC1-AC28 case behaves as the brief and the interface entry say.
- **AC -> test map** (`gate-spoof.test.ts` unless noted; test names start with the AC):
  | AC | Tests |
  |----|-------|
  | AC1 | `AC1 + AC13 + AC21a: main's unchanged ...`, `AC1: the same baseline without any label input` |
  | AC2, AC3 | batch `AC2: job id merge-gate` / `gate`, `AC3: job build named merge-gate` / `gate`; `AC2/AC3: S14-A also applies to UNCHANGED workflow files` |
  | AC4 | `AC4: <spelling> [LF|CRLF|UTF-8 BOM]`, 22 spellings x 3 (adds `"merge-gate"`, `"\x67ate"`); each requires a FAIL line that is not the B1 line |
  | AC5 | `AC5: name: ${{ matrix.n }} ...`, `AC5: name: build-${{ github.run_id }} ...` |
  | AC6 | `AC6: job id build with a matrix and no name:` (PASS batch), `AC6: job id merge-gate with a matrix` |
  | AC7 | `AC7:` second document, `...`, tab, tag on name, tag on key, duplicate name:, duplicate jobs:, invalid UTF-8, directive |
  | AC8 | `AC8: the AC2 job in` x.yaml / X.YML / sub/x.yml (FAIL); .github/x.yml / docs/x.yml / x.yml.txt (PASS) |
  | AC9 | `AC9: .github/workflows/x.yml committed as a symlink`, `AC9: a symlink / a submodule at .github/workflows`, `.github` symlink |
  | AC10 | `AC10: working tree checked out at main ...` (also: HEAD, branch, status unchanged), `AC10: clean head, spoof only uncommitted ... and untracked` |
  | AC11 | `AC11: spoof file with the person's label current`, `AC11 + F2: label rescue with every gate.yml input current` |
  | AC12 | `AC12: job build with a step 'name: check gate config'` (PASS batch) |
  | AC13 | `AC1 + AC13 + AC21a` (no FAIL line for gate.yml) |
  | AC14 | `AC14: a copy of main's gate.yml added as gate2.yml`, `AC14: gate.yml renamed to merge.yml` |
  | AC15 | `AC15: changed gate.yml that also triggers on` pull_request / push / workflow_dispatch / flow list; `... NO label`; `... anchor (on: &t)` |
  | AC16 | `AC16: ... comment line, no label` (4b no-label FAIL lists gate.yml), `AC16: ... with the label current -> PASS` |
  | AC17 | `AC17: main changed gate.yml after the branch was cut` |
  | AC18 | `AC18 (B1): merge-gate in` step name / run: status post / action input / env value / comment (line number checked, B1 the only line) |
  | AC19 | `AC19 (B2): permissions` checks: write, statuses: write, write-all, WRITE-ALL, "write-all", 'write', Statuses: WRITE, flow, job-level, job-level flow, quoted key; `AC19 (B2): contents: read, pull-requests: read, issues: write` (PASS batch) |
  | AC20 | `AC20 (B3): ... the only job has none`, `... job b has none`; PASS batch: `{}`, `read-all`, every job has its own |
  | AC21 | `AC1 + AC13 + AC21a` (unchanged ci.yml), `AC21: ci.yml changed only by an extra comment line` (B1 on its line 3) |
  | AC22 | static `AC22: still pull_request_target only ...`; gate-check.test.ts `AC23: triggers on pull_request_target with all six types` |
  | AC23 | static `AC23: the current base comes from GET .../pulls/$PR .base.ref ...`, `AC26/AC23: ... only GET calls`; fixtures `AC23: PR_CURRENT_BASE=main`, `... side / empty / two lines / Main / trailing space -> FAIL`, `AC23/AC28: PR_CURRENT_BASE unset` |
  | AC24 | `AC24: ... always-pass version that also triggers on pull_request`, `AC24: always-pass gate.yml with pull_request_target only, no label` |
  | AC25 | static `AC25/AC32: gate-check.sh header describes the spoof rules and the residuals` (wording is security's call) |
  | AC26 | static `AC26: current labels come from GET .../issues/$PR/labels, all pages`, `AC26: no expression ... reads github.event.pull_request.labels`, `AC26: the Gate step still gets no token`; gate-check.test.ts both updated `AC24` tests; fixtures `F2: PR_CURRENT_LABELS with` (CRLF/blank lines, paginated 150) |
  | AC27 | static `AC27: a failed labels read fails the job ...`, `AC27/AC32: nothing softens the read or the gate` |
  | AC28 | gate-check.test.ts (4b fixtures unchanged: 84/85 pass, the one failure is the timeout above); `F2 (AC29 offline): PR_CURRENT_LABELS` empty / other / paginated without / near misses; `F2: ... FRAMEWORK_CHANGE_APPROVED=0`; `F2: ... only consulted when protected paths changed` |
  | AC29-AC31 | after merge (orchestrator with the person); AC29 has the offline equivalent above |
  | AC32 | static `AC32: gate.yml keeps read/none permissions ...`, `AC32: gate-check.sh uses no new tool`; tests offline, temp dir only |
- **Next role must know:** a full `npm test` now takes 30+ min on this PC for these two files alone while it's loaded;
  CI (Linux) should be far faster. If 4b's 120 s timeout keeps failing under load, raising it is a test change for qa-test
  (not a weakening); I left it unchanged here, as asked. Security: the AC4 list plus `"\x67ate"` / `"merge-gate"`
  escapes all fail closed; spellings outside the list weren't fuzzed.

### devops-cicd, 2026-11-26 (gate round-1 fixes)

Fixes security round 1 F1 (HIGH), F3, F4 and review B-1, N-1, S-1 in `7092a20`. **AC19 amendment (orchestrator
records it):** B2 now FAILs a new or changed workflow whose workflow- or job-level `permissions` grant `write` on
`checks`, `statuses`, `issues`, `pull-requests`, `actions` or `security-events`, or `write-all` (every AC4 spelling
that applies). `contents: read`, `pull-requests: read`, `id-token: write` alone don't trigger it; `issues: write` now
**does** (the AC19 sentence "issues: write alone don't trigger it" is replaced). Unchanged-from-main files are not
affected (B2 is for changed files only), so `drift.yml` (`issues: write`) keeps passing until a PR changes it; such a
PR would need a decision (allowlist for that file) at that time.

- **F1 (a), gate.yml read step:** new env `OWNER: ${{ github.repository_owner }}`; the events read is now
  `gh api --method GET --paginate "repos/$REPO/issues/$PR/events?per_page=100" --jq '.[] | select((.event == "labeled"
  or .event == "unlabeled") and .label.name == "framework-change-approved") | "\(.created_at) \(.event) \(.actor.type)
  \(.actor.login)"'`, filtered by awk: label time = latest `labeled` with `actor.type == "User"` and
  `actor.login == $OWNER`, printed only if it is strictly later than every `unlabeled` event for the label (any actor)
  and every line has 4 fields; otherwise the file stays empty → `  FAIL  framework-change-approved label time could not
  be read` when protected paths changed. "Label on now" (`FRAMEWORK_CHANGE_APPROVED` from the current labels) is not
  enough on its own: the existing rule needs that owner label time strictly later than the push time, i.e. an owner
  `labeled` event after the last protected push. **Field names confirmed** (read-only `gh api --method GET`):
  `repos/masterege96/AutomationTest/issues/17/events` → `.event` `labeled`, `.created_at` `2026-11-26T14:14:38Z`,
  `.label.name` `framework-change-approved`, `.actor.login` `masterege96`, `.actor.type` `User`; `repos/...` →
  `.owner.login` `masterege96`, `.owner.type` `User` (= `github.repository_owner`). A workflow token's events have
  `actor.type` `Bot` (`github-actions[bot]`). gate-check.sh's interface is unchanged (the filter is in gate.yml).
- **B-1 / N-1:** `spoof_file` writes the blob once to `$SPOOF_TMP` (`mktemp`, removed by `trap ... EXIT`); the NUL,
  UTF-8 (`grep -m1 -naxvE`), control/NEL/LS/PS (`grep -m1 -naE`) and B1 (`grep -m1 -naE`) checks read the file and decide
  on `[ -n "$line" ]` only; awk reads the file (so an early `unsafe()` exit gives its line and reason, not "the reader
  failed"); the `T`/`TP` facts are read with `sed` (reads all input) instead of `grep -q` pipelines.
- **S-1 / F4:** header residuals now also list: an earlier push of the same branch posting on the current head;
  re-runs of gate runs created before a gate change use the old main commit's logic (after merge every open PR needs a
  fresh gate run; AC29 uses only runs created after merge); `pull_request` runs use the merge ref (safe while main's
  workflows grant no B2 write); the person's own account. **Orchestrator, after merge:** trigger a fresh gate run on
  every open PR (new push or label event) and run AC29 only on post-merge runs.

**Changed / new output lines (prefixes unchanged):**
- B2 reason is now `grants write access to checks, statuses, issues, pull-requests, actions or security-events (line
  <n>)` (was `grants write access to checks or statuses (line <n>)`): tests matching the old text need updating.
- A file whose reader stops early now always gets `can't be read safely (line <n>: <why>)`, also for big files.
- No other line changed.

**Scratch evidence** (one gate-check run at a time, throwaway repo in the OS temp dir, deleted on exit; main = this
worktree's workflows): AC1 baseline (unchanged `drift.yml` with `issues: write`) PASS exit 0; new/changed `x.yml` with
`issues: write` (workflow level), `pull-requests: write` (job level), `{ contents: read, actions: write }` (flow),
`security-events: write` → B2 FAIL exit 1; `id-token: write` → PASS exit 0; ~360-414 KB files (6000 padding comment
lines) with an invalid byte / a NEL / `# merge-gate` on every padding line → `not valid UTF-8`, `control character or
YAML 1.1 line break`, `contains the text 'merge-gate'` FAIL (all three were skipped before); ~396 KB file with a tab line
→ `can't be read safely (line 9: tab outside a block scalar)` (N-1); N-2: `gate.yml` with only a comment added plus
`checks: write` (still prt-only, exempt (b)) → B2 FAIL for gate.yml. The awk label filter, checked on sample event
lines: owner User → time; Bot or another user → empty; owner label, later unlabel, then bot label → empty; label and
unlabel in the same second → empty; owner label after an earlier unlabel → time; a malformed line → empty.

**Cases qa-test must add / update:**
- F1 actor (static test on gate.yml, plus the awk filter if tested offline): `OWNER: ${{ github.repository_owner }}`
  in the read step's env; the events jq selects `labeled`/`unlabeled` for the label and prints `.actor.type` and
  `.actor.login`; the filter requires `"User"` and `$OWNER`. Cases: bot actor (`Bot github-actions[bot]`) → no label
  time; non-owner `User` → none; owner `User` → its time; unlabel at the same time or later → none. Count of `gh api`
  calls in the read step stays 4, all `--method GET` (the events call now has an explicit `--method GET`).
- B2 new scopes: `issues: write`, `pull-requests: write`, `actions: write`, `security-events: write` (block, job level,
  flow, quoted/case spellings) → FAIL; change the existing AC19 `issues: write` PASS test to expect the B2 FAIL; keep a
  PASS case with only read scopes (and `id-token: write`); unchanged `drift.yml` stays PASS (AC1).
- B-1: fixtures of >= 300 KB (several thousand padding comment lines) in a changed workflow, one each: an invalid UTF-8
  byte on every padding line, a NEL (`\xc2\x85`) on every line, `# merge-gate` on every line → the three FAIL lines.
- N-2: changed gate.yml (comment-only, still `pull_request_target` only) plus `checks: write` → B2 FAIL for
  `.github/workflows/gate.yml`.
- Update any assertion on the old B2 reason text.

**Not run (the person's rule):** test suites, verify.sh. `bash -n scripts/gate-check.sh` OK.

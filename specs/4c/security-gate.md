Result: PASS

# Security gate: task 4c, round 2 (merge-gate spoofing stopgap: S14, retarget variant, F2)

- **Role:** security (gate), round 2, 2026-11-26. Fresh context, judged from the repo only. The round-1 report was
  used as a checklist; everything below was checked again.
- **Branch:** `ci/4c-gate-spoofing-stopgap`, HEAD `a39aecd`, base `origin/main` (`3b3eda3`, also the merge-base).
- **Diff (`git diff origin/main...HEAD`):** `scripts/gate-check.sh`, `.github/workflows/gate.yml`,
  `tests/integration/gate-spoof.test.ts` (new), `tests/integration/gate-check.test.ts` (two 4b static tests),
  `tasks/4c/TASK_BRIEF.md`, `tasks/4/PLAN.md` (4i/step-6 notes, `tasks/**`, not code). No app code, migrations, env
  vars or dependencies.
- **Not run (the person's rule):** test suites, verify.sh, builds, supabase. CI on `a39aecd`: verify, db-check and
  secrets green (20:27 UTC, reported by the orchestrator). qa-test reports 194 spoof tests passing (Handoff).
- **Run here:** `scripts/gate-check.sh` by hand on one scratch fixture repo (deleted afterwards), two runs, one at a
  time (see "Scratch runs").
- **Protected paths:** this PR changes `scripts/**` and `.github/workflows/**`, so it needs the person's
  `framework-change-approved` label after its last protected push (AGENT_RULES 18a). It is judged by main's current
  (4b) gate.

## Round-1 findings: status

| Round 1 | Status | Evidence |
|---------|--------|----------|
| F1 HIGH (a PR workflow adds the label itself) | **Fixed** | Both fixes are in. (a) `gate.yml:55` `OWNER: ${{ github.repository_owner }}` (env only); `:77-84` label time = latest `labeled` event whose actor is type `User` **and** login `$OWNER`, printed only if it is strictly later than every `unlabeled` event for the label (any actor), and only if every line has 4 fields. (b) B2 now also covers `issues`, `pull-requests`, `actions` (`gate-check.sh:343-349`). Tests: `F1 (round 1): the events read is a GET ...` plus 11 offline runs of the awk filter taken from gate.yml; B2 cases `issues: write (a PASS case before round 1)` and the others. |
| F3 `security-events: write` | **Fixed** | `gate-check.sh:348`; tests `AC19 (B2): permissions security-events: write`, job-level, flow. |
| F4 residual wording | **Fixed** | Header `gate-check.sh:87-109` now lists earlier pushes of the same branch (`:93-96`) and the merge ref (`:102-104`). |
| Review B-1 (SIGPIPE skip on big files) | **Fixed** | `spoof_file` (`gate-check.sh:509-551`) writes the blob once to `$SPOOF_TMP` and decides on captured output only (`:521-528`); `T`/`TP` facts are read with `sed`. Tests `B-1: a ... KB changed workflow with ...` (4 cases). Confirmed by a 12 MB scratch file (below). |
| Review S-1 (re-runs of pre-merge gate runs) | **Fixed (wording + after-merge step)** | Header `:97-101`; brief, orchestrator Handoff "After merge: trigger a fresh gate run on every open PR; AC29 only on post-merge runs". |

## Applicable rows

| Row | Control | Where | Abuse test | Result |
|-----|---------|-------|------------|--------|
| #13 (secrets / tokens) | No secret or token value in any file, fixture or log. gate.yml uses only `GITHUB_TOKEN` with `contents: read`, `pull-requests: read`. `GH_TOKEN` only in the read step. | `gate.yml:10-14`, `:53`; the Gate step `:106-117` has no token | `AC26: the Gate step still gets no token ...`, `AC32: gate.yml keeps read/none permissions ...`, `AC26/AC23: the read step makes only GET calls (4 ...)` | PASS |
| Merge-gate bypass: the label (F2 + F1) | Labels now come from the API (all pages); the label time counts only owner `User` events with no later `unlabeled`; the 4b rule requires label time > push time | `gate.yml:63-84`, `:113-117`; `gate-check.sh:209-257` | F2 fixtures (`F2 (AC29 offline): ...`), F1 static + 11 awk cases | PASS |
| Merge-gate bypass: S14 job identity | S14-A on every workflow blob of the head commit except the exempt gate file | `gate-check.sh:384-390`, `:464-475`, `:553-575` | AC2-AC9, AC14 | PASS |
| Merge-gate bypass: S14 reporting | B1 text, B2 (checks, statuses, issues, pull-requests, actions, security-events, write-all), B3 explicit permissions | `gate-check.sh:343-375`, `:527-550` | AC18-AC20, B2 round-1 cases, N-2 | PASS |
| Merge-gate bypass: retarget | `edited` re-runs; current base from the API must be exactly `main`; payload base also checked | `gate.yml:9`, `:23-29`, `:68-71`; `gate-check.sh:262-268` | AC22, AC23, AC24 | PASS (residual documented) |
| Standing step-4 check: `SUPABASE_*` | Only `drift.yml` reads `secrets.SUPABASE_*` (`drift.yml:43-45`, `:66-68`, `:74-75`, job `environment: production` `:29`). `ci.yml:61` names `NEXT_PUBLIC_SUPABASE_*` from the local stack, not a secret. The diff adds no `secrets.` reference. | — | — | PASS |

## Adversarial review

### Who can make the label count (gate.yml `:73-84`)

- **Actor:** the label time counts only when `.actor.type == "User"` and `.actor.login == $OWNER`. Labels added by a
  `GITHUB_TOKEN` workflow, Dependabot or a GitHub App installation show as `Bot`, and labels added by any other user
  have a different login, so none of them count. An organization-owned repo would never match, so it fails closed.
  The owner's login still counts when it comes through the person's own credentials (gh CLI, a user-to-server app,
  or a PAT stored as a secret). That is the documented residual (`gate-check.sh:105-109`, AGENT_RULES 18a).
- **Unlabel handling:** any `unlabeled` event (any actor) at the same second or later empties the label time. A bot
  can therefore only cause a false FAIL, never a PASS. "On now" also needs the label in the API list
  (`gate-check.sh:211-214`).
- **Pagination / order:** the read uses `--paginate`, the filter is a max over all lines (order-free), and a failed
  read leaves the file empty, so the gate FAILs whenever protected paths changed. A line that doesn't have 4 fields
  (null actor) empties the result.
- **Same second:** label = unlabel gives none. Label time = push time FAILs (`gate-check.sh:251`, strict `>`).
- **No `${{ }}` in any `run:` block:** every expression is in `env:` (`gate.yml:25`, `:38-39`, `:53-59`, `:108-109`).
  `OWNER` reaches awk only through `-v owner="$OWNER"`.

### Can a workflow still post `merge-gate` (B2 scopes, exemptions)

- **Token scopes:** without stored secrets, `checks`/`statuses` write are the only way to post a check or status.
  `issues`/`pull-requests` write could add the label, `actions` write could re-run or dispatch, and
  `security-events` write could upload code scanning results. All of these are now flagged in changed files, and
  B3 forces explicit permissions. Remaining scopes: `contents: write` can't post checks, edit labels or push
  workflow files (`GITHUB_TOKEN` has no `workflows` scope). It can push other commits to the head branch, but a
  `GITHUB_TOKEN` push starts no gate run, a protected change brought in that way is a "different" push that needs the
  label again, and anything else it could push the agent who wrote the workflow could push directly. `id-token`
  issues OIDC tokens for outside clouds only. `deployments` statuses are not commit statuses. Accepted.
- **Unchanged-file exemption:** B1-B3 skip a file only when its blob equals main's at the same path, so the file
  is main's own trusted content. S14-A still applies (`:557-575`). Main's only write scope is `drift.yml`
  `issues: write`, on `schedule`/`workflow_dispatch`. A dispatch needs `actions: write` (B2) or the person's account
  (residual), and the job is behind `environment: production`.
- **Exempt gate.yml (b):** this exemption needs `on:` to be exactly `pull_request_target` (scalar, `[x]`, or a
  one-key block). Flow mappings, anchors and quoted keys don't qualify. B2/B3 still apply (test N-2). The head copy
  can run only as the base workflow of a PR stacked on this branch, which is the AC25 residual.
- **Reusable / composite:** check runs of a reusable workflow are named `caller / called`. A local called file at
  the head is scanned. Remote called workflows and composite actions get the caller's B2/B3-limited token and create
  no check run of their own.
- **Code scanning:** `security-events: write` is flagged. GitHub's own code scanning setup isn't controlled by PR
  content.

### Large files and odd encodings

- NUL (`tr | wc -c` vs `cat-file -s`), invalid UTF-8 (incl. surrogates and overlongs), C0/DEL, NEL/LS/PS, lone CR,
  UTF-16/32 (NUL bytes), tabs, a BOM only at the start: all FAIL. Non-ASCII in keys and job names FAILs too.
- B-1 is fixed: `grep -m1` reads a file, its single output line goes to `cut`, and the decision is made on
  `[ -n "$line" ]`. So no SIGPIPE can skip a check, and awk exit-status failures are reported (`:526-528`).

### gate.yml invariants

All still hold:
- `pull_request_target` only (`:6-9`).
- No PR code checked out or run: the head is only fetched and pinned to `head.sha` (`:36-44`), and
  `scripts/gate-check.sh` comes from main's checkout.
- The checkout is SHA-pinned with `persist-credentials: false` (`:30-33`).
- Permissions are `contents: read` and `pull-requests: read` only.
- The token is only in the read step.
- All four API calls are explicit `--method GET`.
- A failed labels or base read stops with `exit 1` before Gate (`:63-71`). A failed events or activity read leaves
  its file empty, which fails closed through gate-check.

### Residuals (AC25): stated honestly

The header (`gate-check.sh:87-109`) and the brief cover:
- another base branch's gate.yml
- checks posted from other branches or from earlier pushes of this branch
- re-runs of pre-merge gate runs
- the merge ref
- stored secrets other than `GITHUB_TOKEN`
- the person's own account

Two wording gaps (G1, G2 below) are non-blocking.

## Findings (none blocking)

- **G1 (LOW), owner: devops-cicd, at 4c-app or the next gate-check change:** the residual list
  (`gate-check.sh:87-109`) names workflows only. A `merge-gate` check or status can also be posted onto the head SHA
  by **any GitHub App installed on the repo with checks/statuses write, or any other account with write access**.
  Neither is visible to the gate, and both are closed only when 4c-app pins the check source. This is theoretical
  today (single account, and the apps in use post fixed check names), but it belongs in the list.
- **G2 (LOW), owner: devops-cicd (wording):** `gate-check.sh:105-106` says a stored secret other than `GITHUB_TOKEN`
  is covered by "the label review". If that secret is the owner's PAT, the workflow can also **add the label as the
  owner** (actor `User`, login = owner), so the label rule doesn't cover it. The repo has no such secret, which is
  the Q5 default. Reword as "post a check or add the label".
- **G3 (LOW, hardening), owner: devops-cicd:** the reader greps (`gate-check.sh:521`, `:523`, `:528`) decide on output
  only. A grep that *errors* (exit 2, e.g. memory exhausted) would read as "no finding". Not demonstrated, and the
  awk reader would still run. Cheap fix: also require grep's status ≤ 1 (`PIPESTATUS[0]`).
- **G4 (INFO): pathological single lines are slow, but the gate still fails closed.** Scratch run: a 12 MB
  one-line comment with `\xff` at its end kept the UTF-8 `grep -x` busy for over 30 min in Git Bash (killed). In CI
  the job's `timeout-minutes: 5` (`gate.yml:21`) ends such a run as failed, so `merge-gate` stays red. There is just
  no reason line.

## Scratch runs (one scratch repo, deleted)

- 12 MB `x.yml` (valid head plus one 12 MB comment line ending in a NEL): `FAIL merge-gate spoofing:
  .github/workflows/x.yml: can't be read safely (line 9: control character or YAML 1.1 line break)`, exit 1, 20 s.
- The same file with `\xff` instead of the NEL: the UTF-8 grep was still running after more than 30 min and was
  killed (G4).

## Automated results

- CI on `a39aecd`: verify (including the secret scan and new tests), db-check and secrets green. Not re-run here.
- `npm audit` / Supabase advisors: not run (the person's rule). No dependency, migration or secret change.

## Merge notes

- The person applies `framework-change-approved` after the last protected push (this gate doesn't replace it).
- After merge (orchestrator): trigger a fresh gate run on every open PR, run AC29-AC31 on post-merge runs only, and
  record AC30's result (the outcome of round-1 F3 rides on it). Add G1/G2 to L11 or 4c-app.

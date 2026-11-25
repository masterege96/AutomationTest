# Task 4b: merge-gate freshness (L22, L17, S5, S15, S16)

| Field | Value |
|-------|-------|
| State | IN_REVIEW |
| Owner role | devops-cicd (build), qa-test (tests) |
| Branch | `ci/4b-gate-freshness` |
| Worktree | `../wt-4b-devops-cicd` |
| Depends on | none (runs in parallel with 4a; see "Coordination with 4a") |

## Request

Orchestrator, step 4 plan, approved by the person 2026-11-25 (plan row 4b): "gate freshness": fix L22, L17,
S16, S5 and S15 (`tasks/lessons.md` L11, L17, L22) in `scripts/gate-check.sh` and `.github/workflows/gate.yml`:

- L22: compute the last code change from the branch's own commits, so a catch-up merge of main no longer makes
  the gates stale, but a merge that brings a conflict resolution touching code still counts.
- L17: `specs/<id>/post-deploy.md` is not a code change.
- S5: decision files (`tasks/decisions.md`, `tasks/decisions/**`) count as code and need fresh gates; a
  `tasks/**`-only PR still needs its gate files committed on the branch.
- S15: protected paths add `.gitleaks.toml`, all of `.github/**`, `package.json`, `package-lock.json`,
  `supabase/config.toml`, `templates/**`, `AGENTS.md`.
- S16: the `framework-change-approved` label must be applied after the last commit that changed a protected
  path; gate.yml reads the label's `labeled` time from the GitHub API with its read-only token. Keep gate.yml's
  rule: never check out or run PR code.

## Goal

The required `merge-gate` check stays green after a harmless catch-up merge of main or a post-deploy record,
goes red whenever the code, a decision file or a protected file changed after the gates or the person's label,
and treats every pipeline-shaping file as protected.

## Definitions (used by every AC)

- **MB**: `git merge-base <base> <head>` (today's rule; no merge-base is still a FAIL).
- **Code path**: every path except `specs/<id>/security-gate.md`, `specs/<id>/review.md`,
  `specs/<id>/post-deploy.md` and `tasks/**`. Exception: `tasks/decisions.md` and `tasks/decisions/**` ARE
  code paths. (`<id>` is the task id from the branch name, as today.)
- **The PR's net code change at commit X**: what the branch changes on code paths compared with main, at X
  (the diff from X's own merge-base with the base branch to X, code paths only). Changes that came from main
  through a merge are not part of it; a conflict resolution, or any edit made inside a merge commit, is.
- **Gate commit**: the last commit in `MB..HEAD` that changed `specs/<id>/security-gate.md` (resp. `review.md`).
- **Fresh gate**: the gate commit exists in `MB..HEAD`, it changes no code path itself, and the PR's net code
  change at the gate commit equals the PR's net code change at HEAD. If the two can't be shown equal, the gate
  is stale (fail safe).
- **Protected paths**: `.github/**`, `scripts/**`, `rules/**`, `roles/**`, `templates/**`, `ORCHESTRATOR.md`,
  `AGENTS.md`, `.gitleaks.toml`, `package.json`, `package-lock.json`, `supabase/config.toml`. A PR "changes" a
  protected path when the PR's net change (MB..HEAD) touches it; protected files changed on main and brought in
  by a catch-up merge don't count.
- **Label is current**: the most recent `labeled` event for `framework-change-approved` on the PR happened
  (GitHub server time) after GitHub received the push that contained the last commit changing the PR's net
  change on protected paths. Commit author/committer dates are never used: the pusher sets them.

Output format stays as today: indented `  PASS  ...` / `  FAIL  ...` lines, last line `gate-check: PASS` (exit 0)
or `gate-check: FAIL` (exit 1); bad arguments exit 2. The quoted strings in the ACs are line prefixes the tests
match; wording after them is free.

## Acceptance criteria

Fixture setup for AC1-AC19 (qa-test builds it in a temp dir per test; no network, no GitHub): a git repo with
branch `main` holding at least `app/page.tsx`, `tasks/board.md`, `tasks/decisions.md`, `scripts/tool.sh`; task
branch `ci/9x-demo` cut from main; the script is run from inside the fixture repo as
`bash <repo>/scripts/gate-check.sh --base main --head HEAD --branch ci/9x-demo`. "Valid gates" means a commit
adding `specs/9x/security-gate.md` (first line `Result: PASS`) and then a commit adding `specs/9x/review.md`
(first line `Result: APPROVE`), each touching nothing else. Unless stated, the branch has one code commit
(`app/feature.ts`) before the valid gates, and no protected path changes.

Freshness (regressions, L22, L17, S5):

- [ ] AC1 (baseline): Given one code commit then valid gates, When gate-check runs, Then output has
  `  PASS  specs/9x/security-gate.md: PASS`, `  PASS  specs/9x/review.md: APPROVE`, last line `gate-check: PASS`, exit 0.
- [ ] AC2 (code after gates): Given valid gates followed by a commit changing `app/feature.ts`, Then output has
  `  FAIL  specs/9x/security-gate.md was not written after the last code change` and the same for `review.md`,
  `gate-check: FAIL`, exit 1.
- [ ] AC3 (gate in the same commit as code): Given a single commit that adds `specs/9x/review.md` and changes
  `app/feature.ts` (security gate fresh), Then `  FAIL  specs/9x/review.md was not written after the last code change`, exit 1.
- [ ] AC4 (L22, clean catch-up merge): Given valid gates, then main gets a commit changing `app/other.ts` (a file
  the branch never touched) and `scripts/tool.sh`, and main is merged into the branch without conflicts, Then
  `gate-check: PASS`, exit 0, and no `pipeline/framework files changed` line (main's protected change isn't the PR's).
- [ ] AC5 (L22, code conflict resolution): Given valid gates, then main and the branch both changed the same line
  of `app/feature.ts` and the catch-up merge resolves the conflict with content from neither side, Then both
  `... was not written after the last code change` lines, exit 1.
- [ ] AC6 (L22, edit inside a clean merge): Given valid gates, then a catch-up merge with no conflict
  (`git merge --no-commit main`) where the merge commit also changes `app/feature.ts`, Then both stale lines, exit 1.
- [ ] AC7 (L22, conflict only in tasks): Given valid gates, then main and the branch both changed
  `tasks/board.md` and the catch-up merge resolves that conflict (no code path differs from a clean merge), Then
  `gate-check: PASS`, exit 0.
- [ ] AC8 (L22, gates written after the merge): Given a catch-up merge with a code conflict resolution (as AC5)
  and valid gates committed after it, Then `gate-check: PASS`, exit 0.
- [ ] AC9 (L17): Given valid gates, then a commit adding `specs/9x/post-deploy.md`, Then `gate-check: PASS`, exit 0.
- [ ] AC10 (L17 is narrow, see Q2): Given valid gates, then a commit adding `specs/9y/post-deploy.md` (another
  task id), Then both stale lines, exit 1.
- [ ] AC11 (S5, decisions file): Given valid gates, then a commit changing `tasks/decisions.md`, Then both stale
  lines, exit 1. Same result for a commit adding `tasks/decisions/2026-11-25-demo.md`.
- [ ] AC12 (S5, other tasks files still free): Given valid gates, then a commit changing `tasks/board.md` and
  `tasks/9x/TASK_BRIEF.md`, Then `gate-check: PASS`, exit 0.
- [ ] AC13 (S5, tasks-only PR without gates on the branch): Given main already contains
  `specs/9x/security-gate.md` (`Result: PASS`) and `specs/9x/review.md` (`Result: APPROVE`) from an earlier PR,
  and the branch changes only `tasks/9x/notes.md`, Then output has
  `  FAIL  specs/9x/security-gate.md was not committed on this branch` and the same for `review.md`, exit 1.
  When valid gates are then committed on the branch, Then `gate-check: PASS`, exit 0.
- [ ] AC14 (unchanged rules): (a) first non-empty line `Result: FAIL` with `Result: PASS` later →
  `  FAIL  specs/9x/security-gate.md: first line is not 'Result: PASS'`, exit 1; (b) gate file missing →
  `  FAIL  specs/9x/review.md missing`, exit 1; (c) `--base` names a ref with no common history →
  `  FAIL  no merge-base with`, exit 1; (d) branch `bad-name` → `gate-check: FAIL branch 'bad-name' doesn't match`, exit 1;
  (e) `--base` without a value → exit 2.

Protected paths (S15):

- [ ] AC15: Given valid gates and no label (`FRAMEWORK_CHANGE_APPROVED` unset), When the PR's net change touches
  exactly one of `.gitleaks.toml`, `.github/pull_request_template.md`, `.github/CODEOWNERS`,
  `.github/ISSUE_TEMPLATE/bug.md`, `.github/workflows/x.yml`, `scripts/x.sh`, `rules/x.md`, `roles/x.md`,
  `templates/TASK_BRIEF.md`, `ORCHESTRATOR.md`, `AGENTS.md`, `package.json`, `package-lock.json`,
  `supabase/config.toml` (one test case each, file committed before the gates), Then output has
  `  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:` followed by
  a line containing that path, exit 1.
- [ ] AC16: Given the same setup changing only non-protected paths (`app/page.tsx`,
  `supabase/migrations/20261125000000_x.sql`, `supabase/tests/x.sql`, `docs/templates.md`, `tasks/decisions.md`
  committed before the gates), Then no `pipeline/framework files changed` line and `gate-check: PASS`, exit 0.

Label freshness (S16). gate-check gets the label state through an input that fixture tests can set (devops-cicd
chooses and documents it, see Q1); in CI gate.yml fills it from the GitHub API.

- [ ] AC17: Given a protected change (`scripts/x.sh`) and valid gates, and the label input says the label was
  applied after the push containing the last protected change, Then
  `  PASS  pipeline/framework files changed, approved by the person` and `gate-check: PASS`, exit 0.
- [ ] AC18: Given AC17, then a later push changes `scripts/x.sh` again (gates re-run after it), with the label
  input unchanged (label older than that push), Then
  `  FAIL  framework-change-approved label is older than the last change to protected files` followed by a line
  containing `scripts/x.sh`, exit 1. When the label input then says it was re-applied after that push,
  Then `gate-check: PASS`, exit 0.
- [ ] AC19: Given AC17, then a later push changes only `app/feature.ts` (gates re-run after it), label input
  unchanged, Then `gate-check: PASS`, exit 0 (the label covers protected changes only).
- [ ] AC20 (fail closed): Given a protected change and the label present, When the label time can't be
  determined (input missing, empty or unparsable; in CI: API error or no `labeled` event found), Then a
  `  FAIL  ` line saying the label time could not be read, exit 1. Never a PASS.
- [ ] AC21 (commit dates ignored): Given AC18's second push made with `GIT_AUTHOR_DATE` and
  `GIT_COMMITTER_DATE` set to a time before the label, Then the result is still the AC18 FAIL, exit 1.
- [ ] AC22 (no label): Given a protected change and no label at all, Then the AC15 FAIL line, exit 1 (today's rule).

gate.yml (static checks by qa-test reading the file, plus one check after merge):

- [ ] AC23: `.github/workflows/gate.yml` still triggers on `pull_request_target` with types including `opened`,
  `synchronize`, `reopened`, `labeled`, `unlabeled`, `edited`; every `permissions` entry is `read` or `none` (no
  `write` anywhere); no step checks out the PR (no `ref:` naming the PR head/merge, no checkout after the fetch);
  no step runs a file from `refs/pr/head` (no `bash`/`node`/`npm`/`npx`/`sh` on PR content); every `uses:` is
  pinned to a full commit SHA and no new third-party action is added; `persist-credentials: false` stays;
  the "Only PRs into main" step and the head-SHA pin step stay.
- [ ] AC24: gate.yml reads the `framework-change-approved` `labeled` time from the GitHub API with the workflow's
  own `GITHUB_TOKEN` (no stored secret), and the gate job fails if that read fails while protected files changed.
- [ ] AC25 (after merge, orchestrator with the person, on a throwaway PR): label the PR, then push a change to a
  protected file → `merge-gate` red with the AC18 line; re-label → `merge-gate` green. A catch-up merge of main
  into a PR with fresh gates leaves `merge-gate` green. Recorded in this brief's Handoff.

Done gate:

- [ ] AC26: the new tests live in `tests/integration/` (Vitest), run in `npm test` on Windows Git Bash and on the
  CI runner without network or a GitHub token, and leave no files outside the OS temp dir; the header comment of
  `scripts/gate-check.sh` describes the new rules; `bash scripts/verify.sh` passes on the branch; security gate
  PASS; review APPROVE.

## Security rows that apply

From `rules/security-baseline.md` (security confirms in Design). This task is the merge-approval control itself
(ORCHESTRATOR 3a): a wrong PASS means unreviewed code can deploy migrations to production.

- [ ] Row 13: no secret or token value in any file, fixture or log; gate.yml uses only `GITHUB_TOKEN` read scopes.
  abuse test: AC23, AC24.
- [ ] Merge-gate bypass (L11 S5/S15/S16, not a numbered row): abuse tests AC5, AC6, AC11, AC13, AC15, AC18, AC20, AC21.
- Security, please also check: `pull_request_target` token scope after adding a read permission, and that the
  label-time and push-time sources can't be set by the PR author.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
# devops-cicd (build)
scripts/gate-check.sh
.github/workflows/gate.yml
# qa-test (gate-check fixture tests and gate.yml static checks)
tests/integration/**
```

**Protected-path note:** this PR changes `scripts/**` and `.github/workflows/**`, so it needs the person's
`framework-change-approved` label (agents never add it, AGENT_RULES 18a). gate.yml runs from main
(`pull_request_target`), so **this PR is judged by main's current gate** (old freshness rules: a catch-up merge
of main after the gates makes them stale, L22 still applies to this PR; merge main before running the gates).
The new rules take effect only after merge.

**Out of scope:**

- S14 (a PR-defined job named `merge-gate`; GitHub App): task 4c.
- `scripts/verify.sh` (scope check, other verify fixes): task 4d.
- `tasks/board.md` and the per-task status/lessons files: task 4a (which also introduces `tasks/decisions/**`).
- `ci.yml`, L16 (label re-run behaviour of ci.yml), L19, S19-S27.
- Updating `ORCHESTRATOR.md` 3a and `tasks/lessons.md` L11 text to the new rules: `ORCHESTRATOR.md` is the
  person's file (handoff note below); lessons/status updates go through the orchestrator after merge.
- Rebase-with-conflict-resolution under existing gate commits (force push): same behaviour as today; force-push
  to a shared branch is already forbidden (AGENT_RULES 18). Not fixed here.
- Requiring the label for decision files (see Q3).

## Inputs

- `scripts/gate-check.sh`, `.github/workflows/gate.yml` (current main), `ORCHESTRATOR.md` 3a.
- `tasks/lessons.md` L11 (S5, S15, S16), L17, L22; `tasks/decisions.md`.
- Example test: `tests/integration/csp.test.ts` (Vitest layout).
- No `specs/4b/schema.md` (no DB). `specs/4b/threat-model.md` from security (merge-gate bypass).

## Coordination with 4a

4a introduces `tasks/decisions/**` and replaces `tasks/board.md` with a script. 4b only needs the path pattern;
it doesn't depend on 4a's files existing (AC11 builds them in a fixture). If 4a merges first and changes any
protected path, merge main into this branch **before** the gates run (old gate, L22).

## Destructive change?

- [x] No (CI gate logic and tests only; no data, no production)
- [ ] Yes

## Open questions (defaults apply unless the person says otherwise)

- Q1 (devops-cicd decides, not the person): how gate-check receives the label time and the push-time evidence.
  Default: environment inputs set by gate.yml, documented in the gate-check.sh header and the Handoff before
  qa-test writes AC17-AC21; push time comes from a GitHub server timestamp (e.g. the time the commit's push was
  recorded by GitHub), never from commit dates. If no trustworthy push-time source exists, BLOCKED back to the
  orchestrator rather than a weaker rule.
- Q2 (the person): L17 exclusion is literally `specs/<id>/post-deploy.md` (this task id only). Task 3c wrote
  `specs/3/post-deploy.md` from branch id `3c`, which would still count as code. Default: narrow, as requested
  (AC10). Alternative: exclude `specs/*/post-deploy.md`.
- Q3 (the person): should decision files also need the `framework-change-approved` label (L11 S5 suggested
  "protect tasks/decisions.md")? Default: no, they only need fresh gates (agents write decisions per AGENT_RULES).
- Q4 (the person): a clean catch-up merge where main changed the same file as the PR (different lines) may be
  reported stale, because the net change's context differs. Default: allowed (fails safe); not asserted by an AC.
- Q5 (the person): other files that shape the pipeline (`.gitattributes`, `.npmrc`, `.nvmrc`, `vitest.config.*`,
  `eslint.config.*`) are not protected. Default: unchanged (not in the approved list).

## Handoff notes for others

- **The person:** label this PR `framework-change-approved` once its last protected-path commit is pushed (main's
  current gate doesn't tie the label to a commit yet). After merge, `ORCHESTRATOR.md` 3a should be updated to the
  new rules (protected list, fresh-gate definition, label must follow the last protected change); that file is
  yours to edit or approve.
- **Orchestrator:** add the 4b row to the board through 4a's new mechanism (product-spec didn't edit
  `tasks/board.md`, to avoid conflicting with 4a). After merge, mark L17, L22, S5, S15, S16 fixed and run AC25.
- **devops-cicd:** document the Q1 seam in the Handoff early so qa-test can write AC17-AC21 in parallel.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/4b/TASK_BRIEF.md` (new).
- **Verified:** read the current `scripts/gate-check.sh`, `gate.yml`, `ci.yml`, ORCHESTRATOR 3/3a, lessons L11/L17/L22.
- **Left to do:** security threat model (`specs/4b/threat-model.md`); build (devops-cicd); tests (qa-test).
- **Next role must know:** the ACs fix observable results and output-line prefixes, not the mechanism. The
  orchestrator's suggested `git diff MB..<gate commit>` must use the gate commit's own merge-base with main when
  the gate commit predates a catch-up merge (otherwise main's changes show up reversed). `.gitleaks.toml` doesn't
  exist in the repo yet; it's protected anyway.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25 (inputs)

- Questions Q1-Q5: build with the stated defaults. The person sees them in the PR and can change them before adding
  the label. Q1 stays as written: if GitHub offers no trustworthy server-side push time, set the S16 part BLOCKED and
  ship the rest; never fall back to commit dates.
- 4a (open in parallel) replaces `tasks/board.md` with `scripts/board.sh` and adds `tasks/decisions/**`; this brief's
  State row is the board entry.

### devops-cicd, 2026-11-25 (Q1 interface, for qa-test)

gate-check.sh reads the label state from three **environment variables**. They are consulted only when the PR's
net change (MB..HEAD) touches a protected path; otherwise they are ignored. gate.yml fills them from the GitHub API
(see the build entry); fixture tests set them directly (no network, no token).

| Variable | Meaning | Format |
|----------|---------|--------|
| `FRAMEWORK_CHANGE_APPROVED` | `1` when the label is on the PR now (unchanged from today). Anything else = no label. | `1` |
| `FRAMEWORK_LABEL_TIME` | GitHub server time of the most recent `labeled` event for `framework-change-approved`. | exactly `YYYY-MM-DDTHH:MM:SSZ` (UTC) |
| `PR_HEAD_PUSHES` | Every push GitHub recorded on the PR's head branch: one line per push, `<time> <tip-sha>`, where `<time>` is GitHub's server time of the push and `<tip-sha>` the branch tip after it (full 40-hex SHA). Any order (gate-check sorts by time, stable). Blank lines ignored. | `2026-11-25T18:28:39Z 7f12f986e36e175fdb72bad96cd0c5ea0492a4ab` per line |

Rules gate-check applies (commit author/committer dates are never read):

1. **Last protected change C**: walk HEAD's first-parent chain back to MB; C is the oldest commit of the trailing run
   whose net protected change (`git diff <merge-base(base, X)> X -- <protected paths>`) equals HEAD's.
2. **Push time of C**: go through the pushes in time order; a push "contains C" when its tip is C or a descendant
   of C (tips git doesn't know, e.g. `0000...` for a branch deletion or a force-pushed-away tip, don't contain C).
   The push time is the time of the **latest** push that contains C while the push before it did not (or was the
   first). So a C pushed, removed and pushed again counts from the re-push.
3. **Label current**: `FRAMEWORK_LABEL_TIME` is strictly later than C's push time (same second = stale).

Output lines (prefixes the tests can match):

- label absent: `  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:` + one indented line per protected path (today's line).
- label current: `  PASS  pipeline/framework files changed, approved by the person` ...
- label older than C's push: `  FAIL  framework-change-approved label is older than the last change to protected files` ... + one indented line per protected path in the PR's net change.
- label present but `FRAMEWORK_LABEL_TIME` missing/empty/not that exact format: `  FAIL  framework-change-approved label time could not be read` ...
- label time OK but `PR_HEAD_PUSHES` missing/empty, a malformed line, or no push whose tip is HEAD's SHA (`git rev-parse HEAD`): `  FAIL  push time of the last protected change could not be read` ...

Fixture hints for AC17-AC21: set `FRAMEWORK_CHANGE_APPROVED=1`, `FRAMEWORK_LABEL_TIME`, and `PR_HEAD_PUSHES` with
a line for each simulated push's tip SHA (at least one line for the current HEAD). Example AC18: pushes
`T1 <sha after first scripts/x.sh + gates>`, `T3 <sha after second scripts/x.sh + gates>`, label `T2` (T1<T2<T3) ->
FAIL; label `T4` (> T3) -> PASS. AC19: second push tip changes only `app/feature.ts` -> C stays the first push's
commit -> PASS with label T2.

### devops-cicd, 2026-11-25 (build)

- **Changed:** `scripts/gate-check.sh` (freshness from the PR's net change, L17/S5/S15/S16, header comment rewritten),
  `.github/workflows/gate.yml` (new read-only API step, `pull-requests: read`). Commits `a10abf1` (Q1 interface,
  entry above) and `d644edf` (build). Interface: exactly as in the Q1 entry above (`FRAMEWORK_CHANGE_APPROVED`,
  `FRAMEWORK_LABEL_TIME`, `PR_HEAD_PUSHES`); no change since.
- **Freshness mechanism:** net change at X = `git diff <merge-base(base,X)> X` on code paths (decision files as a
  second diff, because a git pathspec can't re-include an excluded path). Gate commit G is fresh when it is in
  MB..HEAD, net(G) == net(G^1) (G changes no code, merges included) and net(G) == net(HEAD); otherwise
  `was not written after the last code change`. No G in MB..HEAD → `was not committed on this branch` (S5, also
  for tasks-only PRs). A missing gate file prints only the `missing` line.
- **S16 status: built (not BLOCKED).** Push-time source: the **repository activity API**
  `GET /repos/{owner}/{repo}/activity?ref=refs/heads/<branch>` (`timestamp`, `before`, `after`, `activity_type`
  push/force_push/branch_creation/branch_deletion/...). Server-recorded per ref update; the PR author can't set it.
  Label time: `GET /repos/{owner}/{repo}/issues/{pr}/events`, latest `labeled` event for the label, `created_at`.
  Evidence (`gh api`, read-only, masterege96/AutomationTest):
  - PR #14 timeline `committed` events carry only commit author/committer dates (`created_at` null): unusable.
    GraphQL `Commit.pushedDate` returns `null` (deprecated): unusable.
  - Check suites for PR #14's head `7f12f98`: created 18:28:40/46, and again 18:34:43 (re-run by the `labeled`
    event at 18:34:38). The newest suite postdates the label, and the oldest can predate the push into this PR
    (same SHA run earlier on another PR/ref), so neither bound is safe: rejected.
  - Activity for `feat/3-todos`: `branch_creation 2026-11-25T18:28:39Z after=7f12f98` (head SHA), 1 s before
    the first check suite. Activity for `ci/0-drift-artifact` (PR #5): pushes 13:04:54 (a4d1885), 13:18:48
    (772a10d), 13:24:40 (0b5b106); PR #5 was labeled 13:10:52. Running the new gate-check on PR #5's real data
    (`--base 05cc5d91 --head 0b5b106`, the API outputs as inputs) gives `FAIL framework-change-approved label is
    older than the last change to protected files (... push of 772a10d at 13:18:48)` listing
    `.github/workflows/drift.yml`, `roles/devops-cicd.md`: the S16 hole actually happened on PR #5 and is now caught.
- **gate.yml:** new step "Read label time and push times (GitHub API, read only)" with `GH_TOKEN: github.token`
  (no stored secret) writes `$RUNNER_TEMP/label-time` and `$RUNNER_TEMP/pushes`; the Gate step reads them into the
  env vars and gets no token. API failure → warning and an empty file → gate-check FAILs if protected files changed
  (AC20/AC24, fail closed). The activity read retries up to 6x10 s until the run's head SHA appears (the log can
  lag the push). Kept: `pull_request_target` + all six types, base checkout with `persist-credentials: false`,
  SHA-pinned checkout (no new action; `gh` is preinstalled on the runner), "Only PRs into main", head-SHA pin,
  no PR code checked out or run. Permissions: `contents: read`, `pull-requests: read` (added).
- **Known limits (for security / the person):**
  - Fork PRs: the base repo has no activity for a fork's branch → protected changes from a fork can never pass
    (fail closed, warning in the log). Fine for a single-account repo.
  - Activity history length isn't documented; if the head push isn't found, it fails closed.
  - Permission for issue events: the docs page states none; I chose `pull-requests: read`. If the read is refused
    in CI, the gate fails closed with "label time could not be read" → then switch to `issues: read` (AC25 shows it).
  - The label's actor isn't checked (only users with triage/write can label; GITHUB_TOKEN here is read-only).
  - Same-second label and push count as stale (strictly later required).
- **Verified:** hand-run scratch fixtures (temp dir, deleted) for AC2/4/5/6/7/8/9/11/12/17/18/19/21 and the
  missing-label/missing-time paths: all gave the AC results. `bash scripts/verify.sh --no-db`:
  `verify.sh: FAIL 1/15 failed: npm run test:e2e (1 skipped)`. Scope, migrations, secrets, typecheck, lint,
  `npm run test`, build PASS; the only FAIL is `test:e2e`, which needs the local Supabase stack env
  (NEXT_PUBLIC_SUPABASE_URL, ...) that `--no-db` doesn't start (environmental, unrelated to this diff).
- **Left to do:** qa-test: tests AC1-AC24, AC26 in `tests/integration/`. Security gate, review. Full
  `verify.sh` with the DB. After merge: AC25 (orchestrator with the person). This PR is judged by main's old gate
  (merge main before running the gates; the person labels after the last protected push).

### qa-test, 2026-11-25

- **Changed:** `tests/integration/gate-check.test.ts` (new, commit `915dc1d`). 78 Vitest tests: 69 fixture tests
  (throwaway git repo per test via `fs.mkdtemp` in the OS temp dir, deleted after each test; fixed author/committer
  names and dates; system/global git config ignored via `GIT_CONFIG_NOSYSTEM` + empty `GIT_CONFIG_GLOBAL`) running
  `bash <worktree>/scripts/gate-check.sh --base main --head <sha> --branch ci/9x-demo` with the fixture as cwd
  (Git Bash `%ProgramFiles%\Git\bin\bash.exe` on Windows, `bash` elsewhere), and 9 static checks on `gate.yml`.
  Offline, no token, no sleeps.
- **Coverage:** AC1-AC14 (incl. literal `--head HEAD`, AC8 re-gate after a stale merge), AC15 (all 14 protected
  paths, one test each, plus modifying `scripts/tool.sh`), AC16, AC17 (incl. unordered/CRLF/blank/upper-case push
  lines and a `000…` tip), AC18 (stale label, re-label, same-second label = stale, pushed-away-then-re-pushed C),
  AC19 (non-protected push after the label; clean catch-up merge pushed after the label), AC20 (9 label-time and
  10 push-line variants, incl. missing/malformed lines and HEAD not in the pushes), AC21 (both directions: commit dates
  before the label still FAIL, commit dates after it still PASS), AC22 (incl. `FRAMEWORK_CHANGE_APPROVED=0`),
  AC23/AC24 static (trigger types, read/none permissions only, single SHA-pinned `actions/checkout` without `ref:`,
  `persist-credentials: false`, no checkout/run of PR content, "Only PRs into main" and head-SHA pin steps,
  `GH_TOKEN: ${{ github.token }}` only in the read step and no `secrets.`, `gh api` read-only (explicit
  `--method GET` with `-f`), server-time fields only, outputs emptied first, Gate step is last and can't be skipped).
- **Verified:** `npx vitest run tests/integration/gate-check.test.ts`: 76 passed, 2 failed (about 220 s on Windows).
  `npm test`: `Test Files 1 failed | 12 passed (13)`, `Tests 2 failed | 287 passed (289)`. Typecheck and ESLint clean
  for the new file. No fixture dirs left in the temp dir.
- **Bug found (owner devops-cicd), AC20 fail-open:** `FRAMEWORK_LABEL_TIME` is validated with
  `printf '%s' "$X" | grep -qE "$TIME_RE"`, and grep matches line by line, so a multi-line value passes when ANY line
  is a valid time. Then `[[ "$FRAMEWORK_LABEL_TIME" > "$PUSH_TIME" ]]` compares the whole string. Failing tests:
  `AC20: label present, FRAMEWORK_LABEL_TIME two lines -> ...` and
  `AC20: label present, FRAMEWORK_LABEL_TIME garbage line then a valid time -> ...`. The second gives
  `gate-check: PASS` for `zzz` + a time BEFORE the push, so a stale label is approved. In CI the value comes from
  `sort | tail -n 1` of server times, so it is hard to trigger there, but the gate is meant to fail closed on its
  own input. Suggested fix: reject a value containing a newline (e.g. `[[ "$FRAMEWORK_LABEL_TIME" =~ ^[0-9]{4}-...Z$ ]]`
  in bash, which matches the whole string). The `PR_HEAD_PUSHES` checks are not affected (each field is checked by itself).
- **Notes:** AC25 is manual (orchestrator with the person). AC26: tests run in `npm test`, but the file takes about
  3.5 min on Windows Git Bash (process start cost); the CI runner should be much faster.
- **Left to do:** devops-cicd fixes the bug above, then qa-test re-runs; security gate; review.

### devops-cicd, 2026-11-25 (fix after qa-test)

- **Changed:** `scripts/gate-check.sh` (commit `717a9aa`). `FRAMEWORK_LABEL_TIME` is now validated as a whole value
  with bash `[[ =~ ]]`; the old `printf | grep -qE` accepted a multi-line value if any line matched, and the later
  whole-string compare then let a stale label PASS. The push-line fields (`<time>`, `<sha>`) were already safe
  (single tokens from `read`), but they now use the same `[[ =~ ]]` check for consistency. The other grep check
  (gate file `Result:` line) works on a single line (`grep -m1`), so it isn't affected.
- **Verified:** `npx vitest run tests/integration/gate-check.test.ts`: 78 passed (78). `npm test`: 13 files,
  289 passed (289).

### qa-test, 2026-11-25 (after 4a merge)

- `7c46535`: gate-check fixtures no longer use `tasks/board.md` (main fixture and AC7 conflict: `tasks/0/TASK_BRIEF.md`;
  AC12: `tasks/9x/notes.md`), assertions unchanged. `e72c328`: `tests/integration/task-scripts.test.ts` AC13 also excludes
  `scripts/gate-check.sh` and `tests/integration/gate-check.test.ts` (orchestrator decision, Option 1: gate-check guards the
  frozen `tasks/decisions.md` as a decision file, not an instruction to write to it); rest of AC13 unchanged.
  `npx vitest run tests/integration/task-scripts.test.ts tests/integration/gate-check.test.ts`: 117 passed (117),
  incl. the two AC20 multi-line label-time tests after devops-cicd's fix `717a9aa` (qa-test bug closed).

### orchestrator, 2026-11-25 (verify)

- Full `bash scripts/verify.sh` (with DB, after the 4a merge and qa-test's fixes; local stack env exported in the shell only): `verify.sh: PASS 19/19 (0 skipped)`.
- New standing check for every step-4 security gate (the person's decision, `tasks/decisions/2026-11-25-4d-supabase-secrets-accepted-until-step4.md`, on the 4d branch): no PR adds or changes a workflow step that reads a `SUPABASE_*` secret outside `.github/workflows/drift.yml`.

### devops-cicd, 2026-11-25 (F1 fix)

Fixes security gate round 1 finding F1 (HIGH) and review round 1 nits 2 and 3. **This entry amends rule 2 (and
replaces rule 1's role) of the "Rules gate-check applies" list in the Q1 interface entry above**; the env interface,
the output line prefixes and rule 3 are unchanged.

- **Why:** the old rule 2 counted a push as having the last protected change C when C was an ancestor of the pushed
  tip. A later revert in that tip means the person labeled a state without C's effect; the agent could then bring C
  back with no new protected commit (variant A: reset + force-push of the old tip; variant B, no force push: a
  fast-forward "ours" merge `git commit-tree <old tip>^{tree} -p <old tip> -p <labeled tip>`) and still PASS.
- **New rules (replace 1 and 2; 3 unchanged):**
  1. *Same / different push.* Each push line is "same" when its tip is a commit git knows AND the net protected
     change at that tip (`git diff <merge-base(base, tip)> tip -- <protected paths>`, compared as text, blob ids
     included) equals the net protected change at HEAD. Every other push is "different": other content, a tip git
     doesn't know (`0000…` branch deletion, a force-pushed-away tip CI didn't fetch), or a net change that can't be
     computed (`ERR`). Whether a tip contains some commit is no longer used; the first-parent C walk is gone.
  2. *Push time.* D = time of the latest different push. Push time = time of the **earliest same push strictly
     later than D** (if there is no different push: the earliest same push). If there is none, FAIL
     (`push time of the last protected change could not be read (no push later than the last push with a different
     protected change (<D>) has HEAD's protected change)`). In words: the label must be later than the last push that
     CHANGED the branch's net protected content, so every push from the last one before the label onwards had
     exactly what merges.
  3. *Label current* (unchanged): `FRAMEWORK_LABEL_TIME` strictly later than the push time.
- **Edge cases (all fail closed):** an intermediate push whose net protected change differed resets the clock, even
  when the content later returns to the labeled state (`A`, `B≠A`, `A` again → push time is the second `A`). Unknown
  tips count as different, so they can only make the push time later. Pushes in the same second have no reliable
  order, so a same push in the same second as D doesn't count (if HEAD's push ties with a different push, FAIL until
  a later push). HEAD's net protected change not computable → `push time ... could not be read`. A clean catch-up
  merge of main stays "same" when main didn't touch the PR's protected files (diff of the PR's files, same blobs);
  when main changed one of them, the diff's blob ids differ, so the pushes before the catch-up merge become
  "different" and the catch-up push sets the push time → re-label needed (fails safe; same as review nit 4 / Q4).
- **Also changed:** `export LC_ALL=C` after `set -uo pipefail` (review nit 3). `net_diff` prints exactly `ERR` and
  nothing else when any step fails (merge-base, either `git diff`, unknown kind), and the freshness check treats
  `ERR` in G, G^1 or HEAD as stale (review nit 2). The `git diff --name-only` that lists protected paths now FAILs
  if git fails (it used to read as "no protected change"). Messages: PASS/FAIL label lines now name the push
  (`tip <sha> at <time>`) instead of C; prefixes unchanged.
- **Verified:** scratch fixture (the qa steps below, `mktemp -d`, deleted on exit), run with the old script
  (`3e087dd`) and the new one. Old: legit PASS, **variant A PASS, variant B PASS** (the F1 bypass), same-second tie
  PASS (a second bypass: order within a second is unknown). New: legit (label 10:05 after the 10:00 `GS2` push) PASS;
  variant A `LABEL_OLD ... tip <GS> at 10:10` listing `scripts/evil.sh`, exit 1; variant B `LABEL_OLD ... tip <M> at
  10:10` listing `scripts/evil.sh`, exit 1; variant B re-labeled at 10:15 PASS; intermediate differing push FAIL at
  label 10:05 and PASS at 10:25; unknown tip in between FAIL; same-second tie `PUSH_TIME_BAD`, exit 1.
  `bash -n` OK. `npx vitest run tests/integration/gate-check.test.ts` (existing tests, new script): 78 passed (78).
- **For qa-test (regression tests, AC18 family), exact fixture steps** (`main`: `scripts/x.sh` = `echo x`,
  `app/a.ts`; branch `ci/9x-test`; gates = commit writing `specs/9x/security-gate.md` `Result: PASS` and
  `specs/9x/review.md` `Result: APPROVE`; always `FRAMEWORK_CHANGE_APPROVED=1`, `--base main --head <sha>`):
  1. Commit Q: `scripts/x.sh` = `echo x2`. Commit P: add `scripts/evil.sh` (`echo evil`). Gates → `GS`.
     `git revert --no-edit P`. Gates again → `GS2` (net protected = `scripts/x.sh` only).
  2. Legit: head `GS2`, label `10:05`, pushes `10:00 GS2` → `gate-check: PASS`, exit 0.
  3. Variant A (force push): head `GS`, label `10:05`, pushes `10:00 GS2`, `10:10 GS` → `LABEL_OLD` line listing
     `scripts/evil.sh`, exit 1; re-label `10:15` → PASS.
  4. Variant B (fast-forward): `M = git commit-tree GS^{tree} -p GS -p GS2 -m merge`; head `M`, label `10:05`,
     pushes `10:00 GS2`, `10:10 M` → `LABEL_OLD` listing `scripts/evil.sh`, exit 1; re-label `10:15` → PASS.
  5. Intermediate differing push: from `GS2` commit `app/b.ts` + gates → `H` (net protected = `GS2`'s).
     Pushes `10:00 GS2`, `10:10 GS`, `10:20 H`: label `10:05` → `LABEL_OLD`, exit 1; label `10:25` → PASS.
  6. Unknown tip in between: pushes `10:00 GS2`, `10:10 <40 hex not in the repo>`, `10:20 H`, label `10:05` →
     `LABEL_OLD`, exit 1.
  7. Same-second tie: pushes `10:00 GS2`, `10:10 H`, `10:10 GS` (either order), head `H`, label `10:15` →
     `PUSH_TIME_BAD` (`no push later than the last push with a different protected change`), exit 1.
  The existing tests need no change (all expectations hold under the new rule).
- **Left:** qa-test adds the tests above; security and review re-run on the new commits (gates are stale now: code
  changed). The orchestrator records in the brief that Q1 rule 2 is amended by this entry.

# Task 4b: merge-gate freshness (L22, L17, S5, S15, S16)

| Field | Value |
|-------|-------|
| State | SPEC_READY |
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

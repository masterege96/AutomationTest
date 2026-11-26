Result: APPROVE

# Code review: task 4c, round 2 (merge-gate spoofing stopgap: S14, retarget variant, F2)

- **Role:** code-reviewer, 2026-11-26, round 2 of 2. Fresh context, judged from the repo only.
- **Branch:** `ci/4c-gate-spoofing-stopgap`, HEAD `a39aecd`, base `origin/main`. New since round 1 (`c6bc2f9`):
  `7092a20` (fix), `60f615b`, `7ed1837`, `ad65a83` (PLAN.md), `fc1bcf0` (tests), `015c05e`, `a39aecd` (merge of main).
  I re-reviewed the whole `git diff origin/main...HEAD`, not only the delta.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `tasks/4c/TASK_BRIEF.md`
  (the ACs incl. the AC19 amendment, and every Handoff entry), `scripts/gate-check.sh`, `.github/workflows/gate.yml`,
  `tests/integration/gate-spoof.test.ts`, `tests/integration/gate-check.test.ts` and the round-1 review.
- **Run here:** `bash -n scripts/gate-check.sh` OK. `npm run lint` clean. No CR in the diff. `gate-check.sh` has
  mode 100755. I ran no test suite, `verify.sh`, build, supabase or `gate-check.sh` (the person's rule).
- **CI on `a39aecd`:** `ci` passed (20:22-20:27 UTC, about 5 min), so the 300 KB fixtures don't hurt CI runtime.
  `gate` is red as expected: there are no gate files yet, and this PR is judged by main's 4b gate.
- **Security gate:** `specs/4c/security-gate.md` is not in the worktree yet (security runs in parallel). This
  APPROVE does not replace the security PASS that AC32 and the merge-gate need.

## Scope

`origin/main...HEAD` changes six files:

- `scripts/gate-check.sh`
- `.github/workflows/gate.yml`
- `tests/integration/gate-spoof.test.ts`
- `tests/integration/gate-check.test.ts`
- `tasks/4c/TASK_BRIEF.md`
- `tasks/4/PLAN.md`

All six are in the Allowed paths or `tasks/**`. No dependency, no new tool.

- **`ad65a83` (PLAN.md):** adds the person's 4i notes and a step-6 note. It is unrelated to 4c, but it is docs in
  `tasks/**`, which is always allowed. No action.
- **Merge `a39aecd`:** brings only 4h's files (ORCHESTRATOR, roles, `specs/4h`, `tasks/4h`, 8 lines of PLAN.md).
  None of them are in this task's paths, and the merge is clean: the three-dot diff shows only the six files above.

## Round-1 findings

| Finding | Status | Evidence |
|---------|--------|----------|
| B-1 SIGPIPE skips | **Fixed** | See "B-1 in detail" below the table. |
| N-1 imprecise message | **Fixed** | awk now reads the temp file (`gate-check.sh:525`), so an early `unsafe()` exit can't kill `git cat-file` with SIGPIPE. The big leading-tab fixture expects `line 9: tab outside a block scalar`. |
| N-2 exempt-(b) gets B2 | **Fixed (test)** | `gate-spoof.test.ts:544-551`: a comment-only, `pull_request_target`-only gate.yml plus `checks: write` gets a B2 FAIL for gate.yml, and no not-exempt or job-id line. |
| S-1 re-run residual | **Fixed** | See "S-1 in detail" below the table. |
| N-3, N-4 | Open, as agreed | ci.yml is out of scope (follow-up task). `TIMEOUT` is unchanged; CI takes about 5 min. |

**B-1 in detail:**

- `gate-check.sh:515` writes the blob once to `$SPOOF_TMP`.
- The NUL check (`:518`), the UTF-8 check (`:521-522`), the control/NEL/LS/PS check (`:523-524`) and B1 (`:528`)
  each run `grep -m1 ... "$SPOOF_TMP" | cut`. Each decides only on `[ -n "$line" ]`.
- `grep -m1` writes at most one line and `cut` reads all its input, so no reader exits early anywhere.
- awk reads the temp file (`:525`).
- The `T`, `W`, `NP` and `TP` facts are read with `sed`, which reads all its input (`:535`, `:545`, `:547-548`;
  `sed -n 1p` replaces `head -n 1`).
- The script has no `set -e` (`:117` is `set -uo pipefail`), so a grep with no match inside `line=$(...)` is
  harmless.
- The temp file comes from `mktemp`, which fails closed (`:552`), and `trap ... EXIT` removes it (`:553`). It is the
  only trap in the script. All expansions are quoted.
- Three pipelines still have an early reader: `:140` (4b, one line), `:212` (`grep -qxF` on the label list) and
  `gate.yml:114`. All three fail closed on SIGPIPE (the label counts as absent), and they handle a few KB at most.
- No decision on a fail-open path depends on a pipeline's exit status any more.
- Tests: four fixtures of 300 KB or more (`gate-spoof.test.ts:599-607`, cases `:641-645`) assert the exact line and
  reason.

**S-1 in detail:**

- The header (`gate-check.sh:97-101`) now says three things:
  - a re-run uses the main commit of the original run;
  - every open PR needs a fresh gate run after merge;
  - AC29 uses only runs created after merge.
- The orchestrator after-merge step is recorded in the brief (the devops-cicd and orchestrator round-1 entries).
- The three new residuals are accurate: an earlier push of the same branch (`:93-96`), the `pull_request` merge ref
  (`:102-104`) and the person's own account (`:107-109`).

## Delta review

### Owner-actor awk filter (`gate.yml:77-84`)

The filter is correct.

- **What it does:** jq prints `created_at event actor.type actor.login`, only for `labeled` and `unlabeled` events of
  the label. awk keeps two times: the latest `labeled` time by the owner with type `User`, and the latest `unlabeled`
  time by any actor. It prints the label time only if every line has 4 fields and the label time is strictly later.
- **Time comparison:** ISO-8601 UTC strings compare correctly as strings. `$1 ""` forces string comparison in mawk,
  gawk and busybox awk.

Fail-closed edge cases, checked by reading:

- **`null` fields:** jq writes them as `null`. If the line still has 4 fields, `"null"` sorts after digits:
  - an `unlabeled` event with a `null` time suppresses the label time;
  - a `labeled` event with a `null` time is printed, then rejected by `TIME_RE` at `gate-check.sh:218`.
- **Line with other than 4 fields:** it sets `bad`, and no time is printed.
- **Events read fails:** the step logs a warning and the file stays empty, so gate-check FAILs when protected paths
  changed.
- **Owner login in a different case:** no time is printed (closed).

Readable enough, with the comment at `:73-76`.

It is testable. `gate-spoof.test.ts:791-795` extracts the exact filter text from gate.yml and fails loudly if it
isn't found. `:818-843` runs 11 cases through bash and awk, including:

- a bot with the owner's login;
- an unlabel in the same second;
- a relabel by a bot;
- a malformed line.

### "Label on now" plus label time

- `FRAMEWORK_CHANGE_APPROVED` now comes from the current labels (`gate.yml:113-115`).
- The 4b rule still needs the owner label time to be strictly later than the push that brought the current protected
  change.
- So a bot that adds the label still FAILs: the label is on, but no owner label time is later than the push.

### B2 scope list

- **Where:** `gate-check.sh:348`, header `:73-76`, message `:546`.
- **Scopes:** `checks`, `statuses`, `issues`, `pull-requests`, `actions` and `security-events` with `write`, plus
  `write-all` (`:354`). This matches the amended AC19 exactly.
- **Spellings:** key and value are trimmed and lower-cased before the comparison, so quoted and mixed-case spellings
  are covered.
- **Tests (`gate-spoof.test.ts:618-640`):** each new scope at the block, job, flow, quoted and mixed-case level.
- **Still PASS:**
  - `id-token: write` (OK_CASES);
  - the unchanged `drift.yml` with `issues: write`, because B2 applies to changed files only.

### 4b behaviour with the new inputs unset

Unchanged.

- `PR_CURRENT_LABELS` and `PR_CURRENT_BASE` are tested with `${VAR+set}` (`:211`, `:262`).
- The env interface comment (`:31-39`) only documents what gate.yml now filters.
- Round 1 left the 4b tests in `gate-check.test.ts` untouched.
- Their two task-4c edits (`:928-936`, `:959-967`) were judged in round 1 as a spec change, not a weakening, and they
  still match gate.yml (4 GET calls).

### Tests not weakened

- The AC19 `issues: write` case was a PASS. It is now a B2 FAIL (`:628`), as the amendment requires.
- The PASS batch now uses `id-token: write` cases in its place.
- The B2 constant is the new full reason text.
- The "every `gh api` call is an explicit GET" assertion is stricter than before; it used to cover only calls with
  fields.
- Nothing was removed or skipped.

## Findings

### Blocker

None.

### Should-fix

None.

### Nits

- **N-5. `scripts/gate-check.sh:273`, nit, owner: devops-cicd.** The fact-protocol comment still reads
  `W<TAB><line>  B2: checks/statuses write or write-all`. Since `7092a20`, W also covers issues, pull-requests,
  actions and security-events. Update the comment the next time the file changes.
- **N-6. `scripts/gate-check.sh:37`, nit, owner: devops-cicd.** `7092a20` shifted the `PR_HEAD_PUSHES` description
  one column left of the lines around it. Cosmetic.
- **N-7. `.github/workflows/gate.yml:82`, nit, owner: devops-cicd (4i template note).**
  - The filter needs `actor.login == github.repository_owner`.
  - In a repo owned by an organization (the 4i template may be used that way), no person's login equals the owner.
  - So the label could never be approved there. That fails closed and is correct for this repo.
  - The template needs an approver-login input instead of the owner. Record this for 4i / 4c-app.
  - A short comment saying that `$1 ""` forces string comparison would also help the next reader.

## Merge notes

- This PR changes `scripts/**` and `.github/workflows/**`. It needs the person's `framework-change-approved` label,
  applied after the last protected push (AGENT_RULES 18a). This review does not replace the label, and main's
  current (4b) gate judges the PR.
- After merge (orchestrator):
  - trigger a fresh gate run on every open PR;
  - run AC29 only on runs created after merge (S-1);
  - AC29-AC31 are live checks still to do.
- This approval holds for HEAD `a39aecd` and needs a security-gate PASS. Any later change to
  `scripts/gate-check.sh`, `gate.yml` or the tests needs a fresh look.

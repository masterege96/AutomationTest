Result: APPROVE

# Code review: task 4b, round 2 (merge-gate freshness: L22, L17, S5, S15, S16; F1 fix)

- **Role:** code-reviewer, round 2, 2026-11-25, fresh context, judged from the repo only.
- **Branch:** `ci/4b-gate-freshness` at `da01f03`, base `origin/main` (an ancestor of HEAD).
  Whole `git diff origin/main...HEAD` re-reviewed; delta since round 1 (`3e087dd..da01f03`): `4982db9` (F1 fix +
  round-1 nits 2 and 3), `4091079` (7 F1 regression tests), brief Handoff entries `fcaa7f3`, `da21d31`, `d8980ec`,
  `da01f03`.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `ORCHESTRATOR.md` 3a,
  `tasks/4b/TASK_BRIEF.md` (26 ACs, Q1-Q5, all Handoff entries incl. "devops-cicd (F1 fix)" which amends Q1 rule 2,
  "orchestrator (round-1 gates)", "qa-test (F1 regression tests)", "orchestrator (verify after F1 fix)"), the round-1
  review.
- **Run by this review:** `npm run lint` clean; `bash -n scripts/gate-check.sh` OK; file LF-only, mode 100755.
  Scratch fixture (scratchpad, deleted after) with the real script: pushes `A, B(≠A), A` with label between B and the
  return → label-older FAIL naming the 10:20 push; label after → PASS; a different push after the label with HEAD
  only listed earlier → push-time FAIL; duplicate HEAD line with upper-case SHA → PASS. All as the header says.
  Not run (per instructions): `gate-check.test.ts` (read instead; reported 85/85), `verify.sh` (reported
  `PASS 19/19`).
- `specs/4b/security-gate.md` is not on the branch yet (security round 2 runs in parallel). This APPROVE assumes a
  security PASS; merge-gate enforces it.

## Scope

Changed vs `origin/main`: `scripts/gate-check.sh`, `.github/workflows/gate.yml`, `tests/integration/gate-check.test.ts`
(new), `tests/integration/task-scripts.test.ts` (AC13 exclusion), `tasks/4b/TASK_BRIEF.md`, `tasks/4/PLAN.md`. All in
the Allowed paths (`scripts/gate-check.sh`, `.github/workflows/gate.yml`, `tests/integration/**`) plus `tasks/**`.
The F1 delta touches only `scripts/gate-check.sh`, the test file and the brief. No dependency, no other workflow.

## Amended S16 algorithm (`scripts/gate-check.sh:154-189`)

- **Classification** (`:162-173`): every line validated as a whole (time regex, 40-hex, no trailing field) before
  use; any bad line fails closed. SHA lower-cased under `LC_ALL=C`. "Same" = `git cat-file -e <sha>^{commit}` AND
  `net_diff <sha> protected` equals HEAD's, compared as text (index lines carry blob ids, so a catch-up merge that
  changed one of the PR's protected files on main makes earlier pushes "different": fails safe, documented in the
  F1 entry). Unknown tips (`0000…` deletions, force-pushed-away commits) and `ERR` are "different".
- **D and push time** (`:171`, `:174-179`): lines are sorted by time (`sort -s -k1,1`, byte order), so the last
  "different" assignment is D = the latest different push. Push time = first "same" line with `t > D` (string
  compare of the fixed format = chronological under `LC_ALL=C`), or the earliest same push when there is no D.
  Correct.
- **Same-second ties:** a same push at exactly D is skipped by the strict `>`; HEAD tying with a different push gives
  `no push later than … (D)`. Two tests, both input orders (`gate-check.test.ts:774-788`).
- **Guarantee:** label > push time ≥ … and every push after the push time is "same" (D precedes it), so the tip
  the person saw at label time had exactly HEAD's net protected change, and any later differing push (even one
  that is reverted again) forces a re-label. Variant A (force push back to `GS`) and variant B (fast-forward
  `commit-tree` "ours" merge) both FAIL now. I found no remaining bypass via ancestry, commit dates, ordering
  within a second, unknown tips, or a reused branch name (its deletion is an unknown-tip "different" push).
- **Error paths:** `HEAD_PROT = ERR` → `PUSH_ERR` (`:159`); `SAW_HEAD = 0` → FAIL (`:180`); with HEAD listed and
  HEAD_PROT valid, HEAD itself is "same", so `PUSH_TIME` empty only when a different push is ≥ HEAD's last push
  (`:181`, message names D). The `git diff --name-only` failure now FAILs instead of reading as "no protected
  change" (`:144-146`).
- **Removed code:** the first-parent C walk and `--is-ancestor` are gone entirely; no dead variables left
  (`PREV`, `CUR`, `C` removed; messages updated to `tip <sha> at <time>`).

## Freshness and ERR handling (`:96-138`)

- `net_diff` (`:101-116`) now prints exactly `ERR` on any failing step (merge-base, either `git diff`, unknown kind)
  and nothing else; a real result can't be `ERR` (code has `--decisions--`, protected is empty or starts with
  `diff --git`). The freshness check (`:133-134`) treats `ERR` in G, G^1 or HEAD as stale. Round-1 nit 2 resolved.
- `export LC_ALL=C` at `:57`. Round-1 nit 3 resolved.
- Freshness logic itself unchanged from round 1 (G = last commit of the gate file in `MB..HEAD`, `net(G) == net(G^1)`
  and `net(G) == net(HEAD)`); still matches the brief's "Fresh gate" definition.

## Header comment (`:1-54`)

Matches behavior: terms, fresh-gate rule, env interface, and the new push-time rule (`:38-48`), including unknown
tips, ERR → different, strict "later", same-second rule, and "containment doesn't matter". The sentence "every push
from the last one before the label onwards had exactly the protected change that merges" is correct (that push is
≥ the push time, hence after D). AC26 header requirement met.

## Acceptance criteria

Round-1 table stands (all AC1-AC24, AC26 OK; AC25 after merge by design). Changes affecting it:

| AC | Result | Evidence |
|----|--------|----------|
| AC17 | OK | `:184-185`, prefix unchanged; F1 "legit" test also asserts `tip <GS2> at 10:00`. |
| AC18, AC21 | OK | `:186-188`, prefix + indented protected list unchanged; existing tests unchanged; F1 variants A/B assert the line, `scripts/evil.sh` listed, no PASS line, re-label → PASS. |
| AC19 | OK | non-protected push keeps the net protected diff → "same" → push time stays at the first push. |
| AC20 | OK | label-time regex unchanged (`:151`); push-time failures keep the `push time of the last protected change could not be read` prefix (`:183`); the Q1 output-line list still holds. |
| AC23, AC24 | OK | gate.yml unchanged since round 1. |

## Tests

- F1 regression tests (`tests/integration/gate-check.test.ts:679-789`) follow the F1 Handoff fixture steps exactly
  and really attack: variant A is a real reset/force-push tip, variant B a real `commit-tree` merge whose ancestry
  is asserted to fast-forward the labeled tip (`:735`); the unknown tip is asserted absent from the repo (`:766`);
  the tie test runs both orders. Each asserts the exact line prefix, the named tip/time, the listed path, the absence
  of the PASS line and exit code. Under the old rule variants A/B and the tie would PASS, so these would catch a
  regression.
- Deterministic and offline: fixed ISO times, temp repos via `mkdtempSync` removed in hooks, system/global git config
  isolated (`:9`, `:50-67`), no network, no sleeps.
- No existing test changed or weakened in the F1 delta (diff `3e087dd..HEAD` on the test file is additions only).

## Findings

No blockers, no should-fix.

- **.github/workflows/gate.yml:70-79, nit, owner: devops-cicd.** The activity-lag retry stops as soon as HEAD's SHA
  appears anywhere in the list (`grep -q " $HEAD_SHA\$"`). Since the F1 rule, a SHA can be pushed more than once
  (`A`, `B`, back to `A` by force push, which is exactly the re-push case); if the activity log lags the return push,
  the loop breaks on the old `A` line and gate-check FAILs with `no push later than …` (D = B's time). Fails
  closed and the next run/re-label fixes it, so no bug; a stricter wait would check that a line with HEAD's SHA
  carries the latest timestamp in the list.
- **scripts/gate-check.sh:106-113, nit, owner: devops-cicd.** The F1 entry says the comparison includes blob ids;
  `git diff` prints abbreviated ids in `index` lines. Not exploitable (the hunks must match too, and only main's
  side, which the PR doesn't control, could differ outside them), but `--full-index` would make the statement
  literal and remove any dependence on `core.abbrev`.
- **scripts/gate-check.sh:103-114, 144-146, nit (accepted), owner: qa-test.** The new ERR / `git diff` failure
  branches have no fixture test (hard to provoke without corrupting the repo). Reviewed by reading; acceptable.
- **tests/integration/task-scripts.test.ts:468-470, nit (carried from round 1, accepted: orchestrator Option 1),
  owner: qa-test.** The AC13 exclusion also drops the "no `tasks/board.md`" assertion for the two gate-check files.
- **ORCHESTRATOR.md:81-86, 98-100, nit (carried, out of scope, the person's file), owner: the person.** After merge 3a
  is stale: freshness definition, protected list (5 vs 11), and now also the F1 rule: the label must postdate the
  last push that changed the net protected diff, so any force push, any push that changes protected content
  (even if later reverted), and a catch-up merge where main changed one of the PR's protected files all need a
  re-label. The "until task 4b, a catch-up merge … makes the gates stale" sentence also changes.
- **Round-1 nit 4 (Q4 / catch-up merge re-label): resolved** — now documented in the F1 Handoff entry's edge cases.
- **Round-1 nits 2 and 3: resolved** (see above).
- **tasks/4/PLAN.md:41-50, nit (carried), owner: orchestrator.** Unrelated plan update riding on this PR; allowed
  (`tasks/**`).

## Merge notes

- This PR is still judged by **main's old gate**: any catch-up merge of main after these gates makes both stale
  (L22). Merge main first, then re-run gates.
- `scripts/**` and `.github/workflows/**` changed: the person adds `framework-change-approved` after the last
  protected-path push. Agents never add it (AGENT_RULES 18a).
- After merge: AC25 on a throwaway PR (orchestrator with the person), including a force-push-back case to see the
  re-label requirement; if the issue-events read is refused with `pull-requests: read`, switch to `issues: read`.

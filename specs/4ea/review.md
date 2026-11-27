Result: APPROVE

# Task 4ea code review: drift.yml `issues: write` exception to merge-gate spoof rule B2

- Date: 2026-11-27. Reviewer: code-reviewer (fresh context). Reviewed code head `68317dd`, branch head `a4129c1`
  (security gate commit), branch `ci/4ea-drift-issues-exception`, PR #24, diff `origin/main...HEAD`.
- Inputs read: `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `ORCHESTRATOR.md` 3a, `tasks/4ea/TASK_BRIEF.md`
  (ACs, Handoff), `tasks/decisions/2026-11-27-4ea-drift-issues-write-exception.md`,
  `tasks/decisions/2026-11-27-4e-drift-reader-created-by-hand-once.md`, `specs/4ea/security-gate.md` (PASS),
  `tasks/4c/TASK_BRIEF.md` (spoof rules, AC19 amendment), `scripts/gate-check.sh`, `tests/integration/gate-spoof.test.ts`.
- CI on `68317dd` (`gh pr checks 24`): `verify` pass, `db-check` pass, `secrets` pass; `merge-gate` fail only because
  the gate files/label were missing at that head (expected).
- Local run (one filtered run, as allowed): `npx --no-install vitest run tests/integration/gate-spoof.test.ts -t "AC9: 4e's drift"`
  -> `Tests 5 passed | 260 skipped (265)`.

## What was checked

1. **Reader facts** (`scripts/gate-check.sh`):
   - `W` now carries the scope (`:358` `print "W\t" NR "\t" k`, `:364` `write-all`). `k` is lower-cased in
     `permlevel`, so `Issues: write` counts as `issues` (one of "any spelling the 4c reader accepts"); a second
     `issues`/`Issues` grant gives a second `W` fact.
   - `D` (`:389-408`, `:486`, `:521`): starts `no` (`BEGIN`, and reset in `onval`); `ok` only for a plain/quoted
     scalar (no escapes) in `DOK`, a one-line flow sequence whose every item (plain, or quoted `[a-z_]+`) is in `DOK`
     (empty list, empty item, trailing comma, nested `[`/`{`, `key: v` pair, quoted item with a comma -> `no`), or a
     block mapping with >=1 key at the first indent, all in `DOK`, no sequence item or non-key line at that indent.
     Comparison is case-sensitive on the raw key. Flow mapping, block scalar, `D` with escapes, missing `on:` -> `no`.
     `ondbad` is only initialised and read on the block path (`DMODE == "block"` is only set in the `E` branch).
     Unreadable files exit before `D` is printed and are handled by the `U` branch first.
   - `T`/`ONMODE` logic is untouched (scalar and flow `prt` checks identical; block END expression unchanged).
2. **Exception decision** (`:576-584`): exact byte comparison of the path, exactly one `W` line
   (`grep -c .` = 1), its scope `issues` (`${w#*$TB}`), and `D = ok`. A missing `D` fact fails closed. The exception
   is only reached after `[ "$changed" = 1 ] || return`, so an unchanged drift.yml gets neither line (AC4), and
   after the `U`/S14-A/B1 checks, which still run and FAIL independently (AC10, AC11). It does not touch
   `SPOOF_FAIL`, so it can't mask any other FAIL.
3. **4c behaviour unchanged**: the B2 FAIL text is byte-identical and its line is still the first `W` fact's line
   (`r="${r%%$TB*}"` on the first line equals the old `sed -n 1p` of `W\t<line>`). B3, S14-A, B1, gate.yml
   exemption, `U` handling untouched. The test-file diff is append-only (462 additions, 0 deletions), and CI `verify`
   ran the full file plus `gate-check.test.ts` green.
4. **No brief FAIL form reaches the exception**: walked every AC5-AC12 form through the reader (PR-code and other
   triggers, cased names, flow mapping, block sequence, `[]`, empty/missing `on:`, other B2 scopes, `write-all`,
   duplicate `issues`, job-level extra grants, wrong paths incl. `Drift.yml`/`.yaml`/`sub/`, anchors): each yields
   either 2+ `W` facts, a non-`issues` scope, `D no`, a different path, or a `U` fact.
5. **Tests exercise gate-check for real**: every case builds a throwaway repo and runs `scripts/gate-check.sh`; the
   expected B2 line number is computed independently from the fixture text (`firstB2`) and matched whole
   (`b2Line`), the exception line is matched whole and exactly once (`expectExc`), and abuse cases also assert
   `gate-check: FAIL`/exit 1 and no spoof PASS line. AC1 pins the 4e copy (line count and key structure). AC9's
   `Drift.yml` is a real index-only blob next to `drift.yml` and the fixture asserts both are in the tree. Not
   tautological.
6. **Scope**: only `scripts/gate-check.sh`, `tests/integration/gate-spoof.test.ts`, `tasks/**` and the security gate
   file changed (all allowed). No dependency, no workflow file change.
7. **Header comment** (`:77-85`) states path (exact, no case/`.yaml`), single `issues: write`, the allowlist and
   read forms, the decision file, why it's safe, the residual, and that B1/B3/S14-A still apply; matches the code.
   The fact list (`:282`, `:284`) documents the new `W` scope and `D` fact.
8. **Decision files**: the 4ea decision quotes the person ("good", plus the relayed card tap) and the Decision text
   matches the brief and the code (exact path, `issues: write` only, default-branch triggers). The drift_reader
   decision's quotes are presented as what they are: the person's "approved" reply to the 11:46 request, the
   10:20 question it answers (which carries "by hand, once, from the reviewed SQL file"), and the 11:47 full
   sentence. The claims in the title and Decision ("once", the SQL file) are traceable to that quoted question; see
   N-3 for the parts that come from the 4e brief.

## Findings

No blockers, no should-fix.

- **N-1 (nit), `scripts/gate-check.sh:485`**: under a block `on:`, a sequence written at the same indentation as
  its key (`on:\n  schedule:\n  - cron: ...`, valid YAML) sets `ondbad`, so such a drift.yml loses the exception
  and gets the B2 FAIL. This is a false FAIL (fail closed, accepted by the header's "a false FAIL is accepted") and
  neither main's nor 4e's drift.yml uses that layout. No change needed; noting it so 4e keeps the indented form.
  Owner: devops-cicd.
- **N-2 (nit), `tests/integration/gate-spoof.test.ts:1289`**: the duplicate-`issues: write` AC7 case asserts a
  drift.yml FAIL and no exception line but, unlike the other AC5-AC8 cases, not the exact B2 line
  (`expect(res.lines).toContain(b2Line(DRIFT, text))`). Coverage of the decision is still real (any FAIL plus no
  exception line). Optional tightening. Owner: qa-test.
- **N-3 (nit), `tasks/decisions/2026-11-27-4e-drift-reader-created-by-hand-once.md:12-20`**: the Decision section
  also covers setting the role's password and storing `SUPABASE_DRIFT_DB_URL`, and "any later change goes through
  a new decision"; those are not in the person's quoted words but come from `tasks/4e/TASK_BRIEF.md` "After merge",
  which the paragraph names. Wording is accurate as written; if a later reader needs it, a short "(steps from the
  4e brief)" would make the split explicit. Owner: orchestrator. Not blocking 4ea.
- **Info (carried from security R2)**: the exception checks scopes and triggers, not steps. Any later drift.yml
  change (task 4e or after) that checks out or runs an event-provided SHA/ref (e.g.
  `github.event.check_run.head_sha`) must be rejected in that task's review. 4e's current file only compares
  `head_sha`.

## Next

APPROVE. git-release after the person's `framework-change-approved` label (protected path `scripts/**`) is applied
after the last push to it and `merge-gate` re-runs green.

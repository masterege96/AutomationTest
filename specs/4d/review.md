Result: APPROVE

# Code review: task 4d, round 2 (verify.sh and bootstrap-check fixes: L27, L15, L5, S19)

- **Role:** code-reviewer, 2026-11-26, fresh context, judged from the repo only. Round 2 of max 2.
- **Branch:** `ci/4d-verify-fixes` at `3317268`, base `origin/main` (`26119bc`, task 4b merged in at `5cd7199`).
  Diff reviewed: the whole `git diff origin/main...HEAD`, and `git diff 710b59b HEAD` (changes since round 1).
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `tasks/4d/TASK_BRIEF.md`
  (AC1-AC37, Q1-Q4 defaults, every Handoff entry incl. "gate round-1 fixes" with the N7 contract change, qa-test
  "gate round-1 regressions", orchestrator "verify, gate round 2 next"), `tasks/4d/lessons.md`,
  `tasks/decisions/2026-11-25-4d-supabase-secrets-accepted-until-step4.md`, the round-1 review, `specs/2c/review.md` (format).
- **Run by this review:** `npm run lint` clean; `bash -n` on both scripts OK; both scripts LF only, mode 100755.
  `destructive_hits` extracted from `scripts/verify.sh` and run on 17 small scratch SQL files with gawk 5.3.2,
  `gawk --posix` and `gawk --traditional`: byte-identical output in all three (scratch removed). mawk 1.3.4 isn't
  installed here; CI (`ubuntu-24.04`, mawk) runs the same cases through `verify-fixes.test.ts` inside verify.sh's
  `npm run test`. Not run (per instructions): verify.sh, builds, e2e, `supabase`, the slow test files. Taken as given on
  this HEAD: `verify.sh: PASS 20/20 (0 skipped)`, `verify-fixes.test.ts` 191 passed, `npm test` 441 passed.

## Scope

`git diff origin/main...HEAD --stat`: `scripts/verify.sh`, `scripts/bootstrap-check.sh`, `roles/qa-test.md` (AC24 line
only), `tests/integration/verify-fixes.test.ts`, `tests/integration/task-scripts.test.ts`, `tasks/4d/**`,
`tasks/decisions/2026-11-25-4d-...md`. All inside Allowed paths + `tasks/**`. merge-base equals `origin/main`, and the
two-dot and three-dot diffs are the same, so the merge of main is clean and reverts nothing from 4b. No workflow,
`package.json`, gate-check, drift or app file touched; no new dependency.

## Round-1 findings

| # | Round 1 | Now |
|---|---------|-----|
| 1 | blocker: lexer ignored `$$`/`$tag$` and `E'...'` | **Resolved.** See "Destructive scan" below. Both round-1 reproducers are tests (`F1_FAIL` rows 1-2) and flag the right line. |
| 2 | nit: comment cites gate-check tests that didn't exist | **Resolved by the merge.** 4b's `tests/integration/gate-check.test.ts` is now on main and uses per-test `{ timeout: TIMEOUT }`, so `task-scripts.test.ts:21-22` is accurate. |
| 3 | nit: fixed `/tmp/verify-*.log` | Open, recorded as a follow-up in the Handoff (AC6 names the path). Unchanged here; fine. |
| 4 | nit: `tr \| grep -qxF` under pipefail | Open, recorded as a follow-up (`scripts/bootstrap-check.sh:37`). Unreachable for small decision files. |
| 5 | nit: `is_local` token on argv | **Resolved.** `scripts/verify.sh:430`: token via stdin (`-f -`), local values via a process substitution running the `printf` builtin; neither on argv. |

## Acceptance criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1-AC13 | OK | Unchanged from round 1 apart from N3 (`grep -rahoE`, `scripts/verify.sh:433,446`) and `is_local` (`:430`). `bundle_has`/`bundle_files` (`-q`/`-l`) already work on binary files; only the `-o` greps needed `-a`. Values still never on argv, stdout or disk; `unset` after use. |
| AC14-AC19 | OK | `scripts/verify.sh:129-235`. See below. |
| AC20-AC23 + N9 | OK | `:350-372`. camelCase and kebab flag in `scripts.test`, `passWithNoTests: true` in a root `vitest.config.*` (comment lines ignored); one fix line per place; line names and AC20 detail unchanged; nothing printed when `scripts.test` is missing (AC23). |
| AC24 | OK | `roles/qa-test.md:58`, exact text, only change in the file. |
| AC25-AC31 | OK | `scripts/bootstrap-check.sh:100-168`, unchanged from round 1 apart from N7. GET only. |
| AC32 | OK | No check removed or renamed. Destructive scan narrowed only by comments and GRANT/REVOKE/ALTER DEFAULT PRIVILEGES statements (the accepted round-1 decision), and only when the file lexes one way; otherwise it is exactly the old per-line match. Bundle and L5 checks only stricter. |
| AC33/AC34 | Given | `verify.sh: PASS 20/20 (0 skipped)` (orchestrator, this HEAD); CI checks pending on the PR. |
| AC35-AC37 (+ N7) | OK | `:24-42`, `:127-165`, `:266-278`. See below. |

### Destructive scan (`scripts/verify.sh:140-228`)

- **Lexer, correct against Postgres's scanner for every case I tried:**
  - Dollar quotes close only at the same, case-sensitive tag (compared with `substr`, not a regex).
  - No dollar quote opens after an identifier character (`a$$b`, `x$$`) or for `$1`. A tag can follow a tag directly.
  - E-strings: `\x` escapes and `''` work. The quote continuation follows Postgres's `whitespace_with_newline`:
    `--` comments are allowed, `/* */` breaks it, `\v` counts only after the newline, CR counts as a newline.
  - Nested `/* */` works. `inword` resets at each line, after a comment and at a quote.
  - `;` inside quotes is blanked (`semi`), so statement splitting and line numbers stay correct.
  - Extra cases I ran all came out right: `drop /* x */ table t` (now flagged, the old grep missed it), `''''`,
    `$A$ $a$; drop ... $A$` (string text is still scanned), `"a$$"`, `select 1 -- $$` then `; drop` on the next line,
    a GRANT with no `;` before a `-- '` comment, a plpgsql `$body$` with `it's` in a comment, `U&'...'`, and an E-string
    then `/*c*/`, newline, `'\'; drop ...` (unsure, raw scan, flagged).
- **GRANT exemption (`:216-218`)**, applied to the comment-free text: the segment must start with
  `grant|revoke|alter default privileges` and contain no `'` and no `$`. Privilege statements have neither, so nothing
  real is lost. Any segment that could hide a quote trick is scanned. `"..."` identifiers stay allowed; their `;` is
  blanked, so `grant ... "x;y" ...; drop view v;` is still flagged (test). AC14 and the repo's
  `default_privileges_baseline` migration stay exempt (tests).
- **Raw-scan fallback (`:205-213`)**: used when a plain string has an odd run of backslashes before `'` (meaning depends
  on `standard_conforming_strings`) or when the file ends inside a quote or comment. It runs `is_destructive` on the
  original lines and prints `n:line`, the old `grep -niE '\b...\b'` result (same word boundary `[A-Za-z0-9_]`, case
  folded). Even runs (`\\'`) are the same under both settings, so they don't need it. Correct.
- **Portability:** only POSIX awk: `\047` and `\v` escapes, `[[:space:]]`, `split`/`substr`/`index`/`tolower`, and a
  byte comparison `ch > "~"` under `LC_ALL=C`. Nothing gawk-only; `--posix` and `--traditional` give identical output.
- **Readability:** dense, but the header comment (`:129-139`) and the state comment (`:150-152`) explain every
  variable and branch. Acceptable for a lexer this small.

### N7 / S19 (`scripts/bootstrap-check.sh`)

- The policy line is RISK only for `deployment_branch_policy` null or absent (`:127-128`). Protected branches, custom
  rules that aren't exactly `main`, an empty list and every unreadable or 404 answer are plain `bad`. The secrets line is
  RISK only when every `SUPABASE_*` name found is one of the three in the decision (`:149-156`). Any other name FAILs,
  and `(found: ...)` lists every `SUPABASE_*` name. This matches the decision text, which names exactly "no
  deployment-branch policy" and the three secrets. It is a narrower RISK, so it is stricter, and it is recorded as a
  contract change in the Handoff.
- `TOTAL=PASS+FAIL+RISK`. With `RISK=0` the summaries are byte-identical to main. Exit 0 iff `FAIL=0`.

### Tests (`tests/integration/verify-fixes.test.ts`)

- The 14 F1 FAIL cases assert the exact single hit `<n>:<line>` (`toEqual`). The 3 kept exemptions assert PASS plus the
  verify PASS. N3 has 3 NUL-byte cases (one checks that no value appears anywhere). N9 has 12 cases (kebab, camel,
  3 config spellings, `.mts`, both places, comment/`false` -> PASS, no test files, this repo's config).
- N7: AC27a -> RISK; AC27b-e and the empty list -> FAIL with no RISK text and `FAIL 1 ... (0 risk)`. Named subsets ->
  RISK. Extra names -> FAIL listing all. A mixed case gives `1 accepted risk` plus a FAIL.
- The only assertions that changed are the AC35 b-e ones, which moved from RISK to FAIL. That follows the recorded
  contract change and is stricter, not weaker.
- No `.skip`/`.only`/todo. Everything runs offline in temp repos, with generated values and stubbed
  `gh`/`supabase`/`npm`.

## Findings

1. **scripts/verify.sh:234, nit, owner: devops-cicd (follow-up).** `hits=$(destructive_hits "$m" || true)` treats an awk
   failure as "no hits". If awk exits non-zero (missing, or an implementation that rejects the program), it prints
   nothing and the scan PASSes every new migration without `destructive-approved`. The old one-line `grep` had the same
   shape, but it had almost no way to fail. The scan now relies on a 90-line awk program, and the stated goal is fail
   closed. CI's `verify-fixes` cases on ubuntu mawk would catch a portability break, so not blocking. Suggested fix: keep
   the exit status and report the file as a hit when it fails, e.g.
   `hits=$(destructive_hits "$m") || hits="0:(destructive scan failed; treat as destructive)"`.
2. **scripts/verify.sh:362, nit, owner: devops-cicd (follow-up, same class as round-1 nit 4).** The pipe
   `grep -vE ... "$vc" | grep -qE ...` runs under `set -o pipefail`. If `grep -q` matches and exits while the first grep
   is still writing (a config larger than the pipe buffer, about 64 KB), the pipeline returns 141 and the
   `passWithNoTests: true` finding is dropped (fail open). Vitest configs are small, so it isn't reachable in practice.
   `grep -qE ... < <(grep -vE ... "$vc")` avoids it.
3. **scripts/verify.sh:359-364, nit, owner: devops-cicd (follow-up, no change needed now).** N9 reads only a root
   `vitest.config.*`. Vitest also reads `test.passWithNoTests` from `vite.config.*` when there is no vitest config. This
   matches the N9 contract as written, and neither file sets it in this repo. Note it in the lessons if the template will
   ship a `vite.config.*`.
4. Carried forward, unchanged and recorded as follow-ups in the Handoff: round-1 nit 3 (`/tmp/verify-*.log`), nit 4
   (`scripts/bootstrap-check.sh:37`, `tr | grep -qxF` under pipefail), and security N4 (`.next/server` not scanned).

No blockers, no should-fix.

## Merge notes

- `scripts/**` and `roles/**` are protected paths. The PR needs the person's `framework-change-approved` label after
  the last push (L11 S16, AGENT_RULES 18a). This review doesn't replace it.
- The PR's required checks (`verify`, `db-check`, `secrets`, `merge-gate`) must be green. CI is also where the
  destructive-scan tests first run under mawk.
- The S19 accepted risk stays open until a closing decision file. Per condition 1, the security gate confirms that no
  workflow step reads a `SUPABASE_*` secret outside `drift.yml`. This diff changes no workflow.

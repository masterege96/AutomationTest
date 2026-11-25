Result: APPROVE

# Code review: task 4a (per-task files for state, lessons and decisions; board.sh, lessons.sh)

- **Role:** code-reviewer, 2026-11-25, fresh context, judged from the repo only.
- **Branch:** `chore/4a-per-task-files`, base `origin/main` (`5c3aa7e`, equal to the merge-base). Commits reviewed:
  `3e7a13f` .. `4b07914` (13 commits).
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `ORCHESTRATOR.md`,
  `tasks/4a/TASK_BRIEF.md` (all Handoff entries, incl. the orchestrator's inputs and the 3c `DONE` move),
  `tasks/4/PLAN.md`, `git diff origin/main...HEAD`, `scripts/gate-check.sh` (style reference).
- **Run by this review:** `bash scripts/board.sh` (exit 0, no stderr, 10 rows), `bash scripts/lessons.sh` (the 14
  archive ids, `lessons.sh: 14 open (14 archive, 0 per-task)`, exit 0), `bash -n` on both scripts (OK),
  `npx vitest run tests/integration/task-scripts.test.ts` (39 passed), `npm run lint` (clean), edge-case runs on a
  scratch fixture (below). Not run, per instructions: builds, e2e, `verify.sh` (orchestrator: `PASS 19/19`).

## Scope

Changed: `ORCHESTRATOR.md`, `rules/AGENT_RULES.md`, `roles/{README,git-release,product-spec,security}.md`,
`scripts/{board,lessons}.sh` (new, mode 100755), `tests/integration/task-scripts.test.ts` (new), and `tasks/**`
(7 State rows, `tasks/4/PLAN.md`, `tasks/4a/*`, two decision files, two archive header lines, `tasks/board.md`
deleted). All inside the brief's Allowed paths plus `tasks/**`. Nothing under `templates/**`, `.github/**`,
`scripts/verify.sh`, `scripts/gate-check.sh`, `specs/**`, `PROJECT_CONTEXT.md`, `.gitattributes`. No dependency
change. No drive-by edits: old briefs differ only in their State row. LF only (no CR in any new file).

## Acceptance criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1 format | OK | `scripts/board.sh:61-62` header, `:87` row; cells trimmed in awk (`:53`); tests AC1 (exact stdout, CRLF). |
| AC2 order/skip | OK | `task_ids` `:33-43`: numeric key `-k1,1n`, suffix `-k2,2` under `LC_ALL=C` (empty suffix first, so `2` < `2a`); `[ -f "$f" ] \|\| continue` `:65`. Tests: `0,2,2b,3c,10` and `1,1b,2,2a,2c,11,12`. |
| AC3 malformed | OK | First `State` row only (`!gs` guard `:50`); MISSING for absent/empty (`:76-79`); word = text before space/`(` (`:81`); raw heading kept (`:73`); one stderr line each via `problem` (`:59`); exit 1. Tests cover the combined case, each alone, all 7 states with/without note. |
| AC4 usage | OK | `:22-27` exit 2 with the exact message; empty `tasks/` prints only the header (verified, test). Content passed only through awk and `read -r` / quoted expansions; no `eval`/`source`; test with `$(...)`/backticks creates no file. |
| AC5 migration | OK (with the recorded 3c deviation) | Each brief's State cell vs `git show 5c3aa7e:tasks/board.md`: 0, 1, 2a, 2c, 2d, 2e `DONE`; 2b, 3 `VERIFYING (the person: ...)` word for word; 3c `DONE` instead of `IN_REVIEW`, done in its own commit `55c6102` on the orchestrator's written input (Handoff "orchestrator, 2026-11-25 (inputs)"), so accepted. `tasks/board.md` deleted; board.sh prints those ids plus `4a`, exit 0. |
| AC6 open rule | OK | `scripts/lessons.sh:62-66` (last `(...)` at end, `fixed\|closed\|info` prefix, case-insensitive), `Closes:` across all per-task files `:94-99`, applied in `END` so order of files doesn't matter. Tests cover each case incl. `unfixed`, mid-heading parens, `fixed-ish`. |
| AC7 output | OK | Archive `fi=0`, per-task files by task order (`:47-53`), sort `-k2,2n -k3,3n` (`:114`), `cut -f5-`, summary `:121`; zero case tested (3 variants). |
| AC8 malformed | OK | Wrong id / bad number / duplicate / unknown `Closes:` each one stderr line with `lessons.sh: <file>: ` prefix (`:84-89`, `:102`), exit 1, good lessons still listed; usage/no `tasks/` exit 2; missing archive fine (`:48`). |
| AC9 this repo | OK | Output equals the 14 ids; `tasks/4a/lessons.md:9` `Closes: L16, L19, L23`. |
| AC10 archives | OK | `git diff origin/main -- tasks/lessons.md tasks/decisions.md`: one added line each, directly under the title, containing the required phrase; nothing removed. |
| AC11 decision file | OK | `tasks/decisions/2026-11-25-4a-step-4-go-ahead.md` has Date, Task, Who (the person's quoted words, as in the Handoff), Source, Decision. No secret/ref/key. The step-4 choices file only had Who split into Who + Source (checked `git diff bfa9860 HEAD`). |
| AC12 docs | OK | `ORCHESTRATOR.md:63-66` (sec. 3), `:139-156` (sec. 7, no `board.md`), `:158-169` (sec. 8: run `lessons.sh`, close rule); `rules/AGENT_RULES.md:6-7`, `:55`; `roles/git-release.md` and `roles/product-spec.md` Owns without `tasks/board.md`; `roles/security.md:42`; `roles/README.md:28-29`. Consistent with each other. |
| AC13 no stale writes | OK | The brief's `git grep` returns only citations (`ORCHESTRATOR.md:75,92,100`, `roles/git-release.md:50`, `PROJECT_CONTEXT.md:56,106`), frozen-archive descriptions (`ORCHESTRATOR.md:168`, `rules/AGENT_RULES.md:55`) and `scripts/lessons.sh` reading the archive. No `tasks/board.md`. No other "board"/"rebase" instruction left in `ORCHESTRATOR.md`, `rules/`, `roles/`, `templates/`, `AGENTS.md`. |
| AC14 conflicting PR | OK | `ORCHESTRATOR.md:92-101` (inside 3a) and `roles/git-release.md:50` both state: no `pull_request` runs while `CONFLICTING`, only `merge-gate`; label change gives no run; `gh run rerun` re-uses old payload; resolve by merging `main` (push = fresh run); merge before gates, not after (L22, until 4b); check other open PRs after each merge. Rule 3 now says *merge* `main`, not rebase, so no force-push is implied. |
| AC15 done gate | Pending (outside this review) | Orchestrator's Handoff: `verify.sh: PASS 19/19`. Still needed: `specs/4a/security-gate.md` PASS, the person's `framework-change-approved` label, CI checks green (incl. the Linux run of these tests). |

## Code quality

- Both scripts follow `gate-check.sh` style: `#!/usr/bin/env bash`, header comment with usage/exit codes,
  `set -uo pipefail` (no `-e`; exit codes are tracked explicitly in `FAIL`), errors to stderr, stdout only for the
  result. `LC_ALL=C` makes `sort` deterministic on Git Bash and ubuntu. Uses only bash 4+ features available in
  Git Bash 5.2 and ubuntu (`[[ =~ ]]`, arrays guarded against `set -u` on empty arrays at `lessons.sh:59`), POSIX
  awk (no gawk-only functions), `sort`/`cut`/`sed`/`grep -c`. CRLF stripped in awk.
- Heredoc-of-command-substitution reads (`board.sh:66-68`, `:88-90`) correctly handle empty trailing cells (a missing
  `Owner role` yields an empty `owner`, not an unset variable).
- Tests are deterministic (fresh `mkdtemp` per test, cleaned in `afterEach`, no network or sleeps), test real script
  behaviour by spawning it, call Git Bash explicitly on Windows, and the real-repo tests (AC5, AC9) are written to
  survive later state moves and `Closes:` lines without becoming vacuous. AC10's `skipIf(!hasBase)` can't skip in CI
  (`.github/workflows/ci.yml:29` `fetch-depth: 0`). Nothing weakened or skipped elsewhere.

## Findings

No blockers, no should-fix.

- **scripts/lessons.sh:80, nit, owner: devops-cicd.** A per-task heading with no space after the id's final dot is
  silently ignored, so the lesson never shows as open: `## L4a.1.` (nothing after it) and `## L4a.2.NoSpace (open)`
  both produce no output and no stderr line (checked on a scratch fixture; `## L4a.3. ok (open)` in the same file
  is listed). Since the point of `lessons.sh` is that no open lesson is missed, a later task could report any
  `^## L[^ \t]+\.` line that doesn't match the full pattern. Not required by AC8's list, so not blocking.
- **scripts/board.sh:70, nit, owner: devops-cicd.** A whitespace-only title (`# Task 5:   `) passes the heading
  check and prints a blank title; `[ -n "${first#"$prefix"}" ]` could test for a non-blank character instead. AC3's
  "empty title" case (`# Task 3:`) is caught and tested.
- **scripts/board.sh:33-43 / scripts/lessons.sh:35-45, nit, owner: devops-cicd.** `task_ids` is duplicated in both
  scripts (the comment in `lessons.sh:34` says so). Acceptable for two self-contained scripts; if a third reader
  appears, move it to a shared file.
- **roles/README.md:27, nit, owner: devops-cicd (the person's label).** The ownership row for
  `tasks/<id>/TASK_BRIEF.md` still reads "product-spec (every role appends to Handoff)". Now that the State row is the
  only state record and `ORCHESTRATOR.md:63-65` says whoever moves the task edits it, the row could add "State row:
  whoever moves the task (ORCHESTRATOR.md section 3)" so the map and section 3 don't appear to disagree. Optional;
  if done, it changes framework text and needs the person to look again before the label.
- **tests/integration/task-scripts.test.ts:475, nit, owner: qa-test.** The AC13 test accepts any hit containing
  "frozen" or "archive" anywhere on the line, which would also accept a line like "append to the archive
  `tasks/lessons.md`". Today's hits are all fine (checked by hand above); a tighter match (e.g. "frozen archive")
  would make the test catch a regression.
- **tasks/decisions/2026-11-25-4-step4-choices.md:5, nit, owner: orchestrator.** "in their own words: "Yes, all
  five"" is the label of the option the person picked on the decision card, not typed words; the Source line says
  so, so it's clear enough.

## Merge notes

- `scripts/**`, `rules/**`, `roles/**` and `ORCHESTRATOR.md` changed: merge-gate needs the person's
  `framework-change-approved` label (AGENT_RULES 18a). The label approves the exact text reviewed here; any of the
  nits above that touch framework text would need the person to look again.
- `4a`'s own State is `IN_REVIEW`; the orchestrator moves it on.

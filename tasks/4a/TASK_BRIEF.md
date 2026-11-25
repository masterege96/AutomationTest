# Task 4a: per-task files for state, lessons and decisions (no shared tracking files)

| Field | Value |
|-------|-------|
| State | SPEC_READY |
| Owner role | devops-cicd (`scripts/board.sh`, `scripts/lessons.sh`, the framework doc edits under the person's label, the state migration of existing briefs); qa-test (`tests/integration/**` tests of the two scripts) |
| Branch | `chore/4a-per-task-files` |
| Worktree | `../wt-4a-orchestrator` (single worktree; devops-cicd first, then qa-test, in sequence, never at the same time) |
| Depends on | none (3c merged in PR #15; no other open PR touches `tasks/board.md`) |

## Request

Orchestrator, 2026-11-25, from the person's step-4 go-ahead: PR 4a from `tasks/4/PLAN.md` (row 4a, fixes L23,
L19, L16 (doc)). Stop parallel task branches conflicting in shared files:

- task state lives only in each brief's `| State |` row;
- `tasks/board.md` is replaced by `scripts/board.sh`, which prints the board (id, title, state, owner) from `tasks/*/TASK_BRIEF.md`;
- new lessons go in `tasks/<id>/lessons.md` with ids `L<id>.<n>`;
- each new decision is its own file under `tasks/decisions/` (`<YYYY-MM-DD>-<task-id>-<slug>.md`);
- `tasks/lessons.md` and `tasks/decisions.md` become frozen archives (existing ids stay; a header line says "frozen; new entries go to ...");
- `scripts/lessons.sh` lists open lessons (archive + per-task files) for ORCHESTRATOR's learning loop;
- docs updated: ORCHESTRATOR.md sections 3a/7/8, AGENT_RULES 7 and 26, roles/git-release.md, product-spec.md, security.md, README.md ownership map, templates if they mention board/lessons/decisions;
- document the L16/L19 finding (a conflicting PR gets no `pull_request` run) in ORCHESTRATOR's git-release guidance.

## Goal

Two task branches open at the same time never conflict over task state, lessons or decisions, because each task
writes only its own files; anyone can still see the whole board and every open lesson with one command each.

## Acceptance criteria

Each one must be testable. qa-test writes at least one test per line for the script ACs (AC1-AC9); the doc ACs
(AC10-AC14) are checked by the reviewer with the stated command. "Repo root" means the directory the script is run
from; both scripts read `tasks/` relative to the current directory, so tests can run them on a fixture directory.

### scripts/board.sh

- [ ] AC1 (output format): Given briefs `tasks/0/TASK_BRIEF.md` (`# Task 0: Phase 0 bootstrap`, State `DONE`, Owner role `git-release, devops-cicd`) and `tasks/2b/TASK_BRIEF.md`, When `bash scripts/board.sh` runs from the repo root, Then stdout is a Markdown table: first line `| Id | Title | State | Owner |`, second line `|----|-------|-------|-------|`, then one line per brief `| <id> | <title> | <state> | <owner> |`, where id = the directory name, title = the brief's first line with the `# Task <id>: ` prefix removed, state = the full State cell (trimmed, including any note after the state word, e.g. `VERIFYING (the person: ...)`), owner = the full Owner role cell (trimmed); exit code 0; nothing on stderr.
- [ ] AC2 (order and skipping): Given task directories `10`, `2b`, `2`, `3c`, `0`, `4` (no brief) and `incidents`, `decisions` (no brief), When board.sh runs, Then rows appear in the order `0, 2, 2b, 3c, 10` (numeric part ascending, then letter suffix ascending; `2` before `2a`), and directories without a `TASK_BRIEF.md` produce no row and no error.
- [ ] AC3 (malformed brief): Given one brief with no `| State |` row, one whose State cell is empty, one whose State starts with a word that isn't one of the seven states in ORCHESTRATOR.md section 3 (`BACKLOG`, `SPEC_READY`, `IN_PROGRESS`, `IN_REVIEW`, `VERIFYING`, `DONE`, `BLOCKED`), and one whose first line isn't `# Task <dir-id>: <title>`, When board.sh runs, Then every brief still gets a row (state shown as `MISSING` when the row or value is absent, otherwise the raw cell; title shown as the raw first line when the heading doesn't match), each problem prints one stderr line `board.sh: tasks/<id>/TASK_BRIEF.md: <problem>`, the well-formed briefs print normally, and the exit code is 1. Only the first table row whose first cell is `State` counts; a later "State" word in the Handoff text does not.
- [ ] AC4 (usage): When board.sh is given any argument, Then it prints a one-line usage to stderr and exits 2. When it runs where there is no `tasks/` directory, Then it prints `board.sh: no tasks/ directory (run from the repo root)` to stderr and exits 2. Given a `tasks/` directory with no briefs, Then it prints only the two header lines and exits 0. The script never executes or evaluates brief content (text parsing only).
- [ ] AC5 (migration of existing state): Given `tasks/board.md` as on the branch base (origin/main `5c3aa7e`), When 4a is finished, Then each existing brief's State cell equals that task's board.md State cell word for word (today: 2a, 2c, 2d, 2e `DONE`; 2b and 3 `VERIFYING (the person: ...)` with the board's note; 0, 1 `DONE`; 3c `IN_REVIEW`), `tasks/board.md` no longer exists, and `bash scripts/board.sh` on the branch prints exactly the board.md rows' ids and states plus a row for `4a`, exit 0. (Titles and owners come from the briefs and may be longer than board.md's short titles; that is expected.)

### scripts/lessons.sh

- [ ] AC6 (open-lesson rule): A lesson is a line starting `## L<id>. ` in `tasks/lessons.md` (archive, `<id>` = a number) or `## L<task-id>.<n>. ` in `tasks/<task-id>/lessons.md` (`<n>` = a positive integer). Its status is the text in the last `( ... )` at the end of the heading. A lesson is **closed** when the status starts with `fixed`, `closed` or `info` (case-insensitive), or when any `tasks/*/lessons.md` has a line `Closes: <id>[, <id>...]` naming it; every other lesson is **open**, including one with no status. Given fixture files covering each of these cases, When `bash scripts/lessons.sh` runs, Then exactly the open ones are listed.
- [ ] AC7 (output format): Then stdout has one line per open lesson, `<id> <file>: <heading text after the id>` (e.g. `L11 tasks/lessons.md: Merge-gate residual risks from the PR #2 security gate (open)`), archive lessons first in id order, then per-task lessons in task order (same order as AC2) and `<n>` order, then a last line `lessons.sh: <total> open (<a> archive, <t> per-task)`; exit 0. With no open lessons the last line reads `lessons.sh: 0 open (0 archive, 0 per-task)`, exit 0.
- [ ] AC8 (malformed per-task lessons): Given a `tasks/5x/lessons.md` with a heading `## L5y.1. ...` (wrong task id), `## L5x.0. ...` or `## L5x.a. ...` (bad number), a duplicate `L5x.2`, or a `Closes:` line naming an id that exists nowhere, When lessons.sh runs, Then each problem prints one stderr line `lessons.sh: tasks/5x/lessons.md: <problem>`, all well-formed open lessons are still listed, and the exit code is 1. Any argument -> usage on stderr, exit 2; no `tasks/` directory -> exit 2 as in AC4. A missing `tasks/lessons.md` is not an error (new projects have no archive).
- [ ] AC9 (this repo after 4a): When `bash scripts/lessons.sh` runs on the finished branch, Then the archive part lists exactly L5, L11, L12, L13, L14, L15, L17, L20, L21, L22, L24, L25, L26, L27 (14), because `tasks/4a/lessons.md` has `Closes: L16, L19, L23` (fixed by this task: per-task files for L23, the documented finding for L19 and L16); any lesson 4a's own roles add appears after them; exit 0.

### Archives, decisions, docs

- [ ] AC10 (frozen archives): `git diff origin/main -- tasks/lessons.md tasks/decisions.md` shows exactly one added line in each file and nothing else: directly under the `# Lessons` title, a line containing `frozen; new entries go to tasks/<id>/lessons.md` (ids `L<id>.<n>`; close an archived lesson with a `Closes:` line, see ORCHESTRATOR.md section 8); directly under the `# Decisions` title, a line containing `frozen; new entries go to tasks/decisions/` (one file each, `<YYYY-MM-DD>-<task-id>-<slug>.md`). All existing ids (L1-L27) and decision rows are unchanged.
- [ ] AC11 (first decision file): `tasks/decisions/2026-11-25-4a-step-4-go-ahead.md` exists and records the person's step-4 go-ahead with the fields Date, Decision, Who (the person's own words, as the orchestrator quotes them in this brief's Handoff), Source; it is the format example the docs point to. No secret, project ref or key in it.
- [ ] AC12 (docs say where to write): After the change, ORCHESTRATOR.md section 3 says the brief's State row is the only record of a task's state and whoever moves a task (per the table) edits that row; section 7 (Files) lists `tasks/<id>/TASK_BRIEF.md` (State row), `tasks/<id>/lessons.md`, `tasks/decisions/<YYYY-MM-DD>-<task-id>-<slug>.md`, `tasks/lessons.md` and `tasks/decisions.md` as frozen archives, and `scripts/board.sh` / `scripts/lessons.sh` as the way to read them, with no `board.md`; section 8 says to run `bash scripts/lessons.sh` before starting each new task and how a lesson is closed (status word or `Closes:` line, AC6). AGENT_RULES intro paragraph (decision -> new file in `tasks/decisions/`) and rule 26 (lessons -> `tasks/<id>/lessons.md`, id `L<id>.<n>`) say the same. roles/product-spec.md and roles/git-release.md no longer list `tasks/board.md` in Owns; roles/security.md rule 3 points to a decision file in `tasks/decisions/`; roles/README.md ownership map has rows for `tasks/<id>/lessons.md` (every role working on task `<id>`, entries only added or their status changed) and `tasks/decisions/*` (the role that recorded the person's decision; never edited after merge).
- [ ] AC13 (no stale write instructions): `git grep -n -E 'tasks/(board|lessons|decisions)\.md' -- ':!tasks/' ':!specs/'` on the finished branch returns only lines that cite an existing archived entry (e.g. "`tasks/lessons.md` L11") or describe the files as frozen archives; none tells an agent to add, append or update an entry there, and `tasks/board.md` appears in none of them. (`specs/**` and `tasks/**` are history and stay as they are; `PROJECT_CONTEXT.md` only cites archived entries and is not changed.)
- [ ] AC14 (L16/L19 finding documented): ORCHESTRATOR.md section 3a (merge approval) and roles/git-release.md rule 3 state: while a PR is `CONFLICTING`, GitHub starts no `pull_request` workflow runs, so `verify`, `db-check` and `secrets` don't run and only `merge-gate` (`pull_request_target`) does; a label change on such a PR doesn't produce a CI run either; `gh run rerun` re-uses the old run's event payload (old labels), so it can't pick up a new label; to re-evaluate, resolve the conflict by merging main into the branch (a push starts a fresh run), and merge main before running the gates, not after (until 4b, a catch-up merge with non-`tasks/**` changes makes the gates stale, L22); after each merge, git-release checks the other open PRs for conflicts.

### Done gate

- [ ] AC15: `bash scripts/verify.sh` (brief from the branch name) passes on the branch and its summary line is pasted into the Handoff; `npm test` in CI runs the qa-test script tests (Linux runner) and they pass; `specs/4a/security-gate.md` first line `Result: PASS` and `specs/4a/review.md` first line `Result: APPROVE`, each in its own commit after the last code change; the PR carries the person's `framework-change-approved` label; required checks `verify`, `db-check`, `secrets`, `merge-gate` green.

## Security rows that apply

From `rules/security-baseline.md` (security fills this in during Design). product-spec flags:

- [ ] Row 13: no secret, key or project ref in any new file (scripts, tests, fixtures, decision file). abuse test: gitleaks in CI.
- Not a baseline row, for security to judge: the scripts parse brief and lesson text only and must never `eval`, `source` or execute it (AC4). State rows and decision files stay under `tasks/**`, which gate-check excludes from "code" and from protected paths, exactly like `tasks/board.md` and `tasks/decisions.md` today (S5): no new exposure, and 4b (not this task) closes it.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed
(brief State rows, `tasks/4a/lessons.md`, `tasks/decisions/`, the two archive header lines, deleting `tasks/board.md`).

```
scripts/board.sh            # devops-cicd
scripts/lessons.sh          # devops-cicd
ORCHESTRATOR.md             # devops-cicd drafts; the person's label approves the text
rules/AGENT_RULES.md        # devops-cicd drafts; the person's label approves the text
roles/git-release.md        # devops-cicd drafts; the person's label approves the text
roles/product-spec.md       # devops-cicd drafts; the person's label approves the text
roles/security.md           # devops-cicd drafts; the person's label approves the text
roles/README.md             # devops-cicd drafts; the person's label approves the text
tests/integration/**        # qa-test: tests of the two scripts and their fixtures
```

**Protected paths:** `scripts/**`, `rules/**`, `roles/**` and `ORCHESTRATOR.md` are framework files. merge-gate
FAILs without the person's `framework-change-approved` label (agents never add it, AGENT_RULES 18a). `rules/**` and
`roles/**` text is the person's (roles/README.md ownership map): devops-cicd drafts the change in the PR and the label
is the person's approval of that exact text, so any text change after the label needs the person to look again.

**Templates:** `templates/TASK_BRIEF.md` and `templates/PROJECT_CONTEXT.md` don't mention the board, lessons or
decisions files (checked with `git grep`), so `templates/**` is not in scope. If devops-cicd finds a reason to change
a template, it stops and asks (`BLOCKED`) rather than widening the scope.

**Out of scope:** (things that look related but must not be touched)

- Everything in PR rows 4b-4i of `tasks/4/PLAN.md`: gate-check freshness and first-parent logic (L22, L17), `tasks/decisions/**` counting as code or being protected (S5), the protected-path list (S15), label freshness (S16), merge-gate spoofing (S14), verify.sh changes (L27, L15, L5, S19), drift.yml (S26, S27), production auth as code, per-worktree DB, role-contract lessons (L14, L20, L21, L25, L26, S20/S21), template packaging.
- `scripts/verify.sh`, `scripts/gate-check.sh`, `scripts/bootstrap-check.sh`, `.github/workflows/**` (no CI wiring for the new scripts beyond `npm test` picking up the tests), `.gitattributes` (no `merge=union`).
- Rewriting history: no edits to `specs/**`, to old briefs other than their State row, to archived lessons or decision rows, or to `PROJECT_CONTEXT.md`'s citations.
- Moving any task to a new state (for example 3c, which board.md shows as `IN_REVIEW` though PR #15 merged): the migration copies board.md as it is; state moves are the orchestrator's, separately.

## Inputs

- `tasks/4/PLAN.md` row 4a; `tasks/lessons.md` L16, L19, L22, L23; `tasks/board.md` and `tasks/decisions.md` at origin/main `5c3aa7e`.
- `ORCHESTRATOR.md` sections 3, 3a, 7, 8; `rules/AGENT_RULES.md` intro and rule 26; `roles/README.md`; `scripts/verify.sh` (scope check, shell style to follow); `scripts/gate-check.sh`.
- Example integration test: `tests/integration/csp.test.ts` (Vitest; `npm test` runs `tests/integration/**`).
- The person's step-4 go-ahead words for AC11: orchestrator adds them to the Handoff before devops-cicd starts.
- Spec files: none (no DB, no auth, so no `schema.md` or `threat-model.md`).

## Destructive change?

- [x] No. `tasks/board.md` is deleted, but it is tracking data, not user or production data: its content moves into the briefs' State rows first (AC5), `scripts/board.sh` reproduces it, and its history stays in git. No migration, table or production data is touched, so the two-step rule and the `destructive-approved` label don't apply.
- [ ] Yes

## Open questions (each has a default; the build goes ahead on the default unless the person says otherwise)

1. **How is an archived lesson closed, now that the archive is frozen?** Default: a `Closes: L<id>, ...` line in the fixing task's `tasks/<id>/lessons.md` (AC6, AC9); the archive heading keeps its old status. Alternative: allow editing only the status in archive headings (one-line edits, small conflict risk).
2. **Does 4a close L16?** L16 asked devops-cicd to find out whether the `labeled` run was cancelled or never created. Default: yes, closed by documenting the L19 cause and the re-evaluation steps (AC14), since L19 explains it. Alternative: keep L16 open until the run history is checked (then AC9 lists 15 archive lessons).
3. **Notes in State cells.** Default: briefs carry board.md's notes verbatim (`VERIFYING (the person: ...)`) and board.sh prints the whole cell; only the first word must be a valid state.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/4a/TASK_BRIEF.md` (this brief).
- **Verified:** read `scripts/verify.sh` scope check: it reads the first fenced block after the first occurrence of the words "Allowed paths", so this brief has no fenced block and no such phrase before the Scope section; branch `chore/4a-per-task-files` resolves to `tasks/4a/TASK_BRIEF.md`; `tasks/*` is skipped by the scope check. Lesson-heading statuses in the archive checked by hand for AC9 (17 open by the AC6 rule today, minus L16, L19, L23).
- **Left to do:** orchestrator: paste the person's step-4 go-ahead words here (AC11). devops-cicd: build AC1-AC14. qa-test: tests for AC1-AC9 on fixture directories.
- **Next role must know:**
  - Briefs' State rows lag board.md today (2a-2e briefs say `IN_REVIEW`, board says `DONE`/`VERIFYING ...`): AC5 copies board.md, not the briefs.
  - `tasks/4/` has `PLAN.md` but no brief: board.sh must skip it (AC2).
  - Vitest spawns the scripts; CI is Linux. Locally on Windows, make sure the test invokes Git Bash, not a WSL `bash` that may come first on PATH, and that fixtures are written with LF.
  - This is likely near the ~400 changed-line guideline (two scripts, tests with fixtures, doc edits, 6 State-row edits). If it goes well over, tell the orchestrator before splitting.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25 (inputs for devops-cicd)

- **The person's step-4 go-ahead (AC11):** in the project thread, 2026-11-25 19:08 UTC, after merging PR #15, the
  person wrote: "Squash and merge done, what is next". The coordinator relayed the agreed next step (step 4: tighten the
  framework, then package it). At 19:11 UTC, on the decision card, the person chose "Yes, all five" (4c, 4e, 4f, 4g, 4i).
- **Decision files already present:** `tasks/decisions/2026-11-25-4-step4-choices.md` (orchestrator, commit bfa9860)
  records the five choices. devops-cicd writes `tasks/decisions/2026-11-25-4a-step-4-go-ahead.md` for AC11 and aligns
  the field names of the choices file with the same format (content unchanged).
- **Questions 1-3:** go with the defaults (`Closes:` lines; 4a closes L16; State notes copied as they are).
- **3c:** PR #15 merged at 19:08 UTC (docs only, nothing left open); set its brief State to `DONE` in the migration.

### devops-cicd, 2026-11-25 (build)

- **Changed:**
  - New: `scripts/board.sh`, `scripts/lessons.sh` (mode 100755; `set -uo pipefail`, bash + awk/sed/sort/cut, `LC_ALL=C`;
    text parsing only, no `eval`/`source`), `tasks/4a/lessons.md` (`Closes: L16, L19, L23`),
    `tasks/decisions/2026-11-25-4a-step-4-go-ahead.md` (AC11).
  - State migration (AC5): State rows of 2a, 2c, 2d, 2e -> `DONE`; 2b and 3 -> `VERIFYING (the person: ...)` with
    board.md's notes; 0 and 1 already matched. Commit d669cf4 copies board.md word for word (3c `IN_REVIEW`); the next
    commit 55c6102 sets 3c to `DONE` per the orchestrator's input above. `tasks/board.md` deleted.
  - One header line each in `tasks/lessons.md` and `tasks/decisions.md` (AC10); `2026-11-25-4-step4-choices.md`: the
    Who field split into Who (the person's words) and Source, content unchanged.
  - Docs (framework text, needs the person's label): ORCHESTRATOR.md sections 3 (State row paragraph), 3a (conflicting-PR
    paragraph, AC14), 7 (file tree + how to read), 8 (learning loop, close rule); AGENT_RULES intro and rule 26;
    roles/git-release.md (Owns without `tasks/board.md`; rule 3 now says *merge* `main` into the branch instead of
    "rebase", since a rebase of a pushed branch needs a force-push, plus the AC14 text); roles/product-spec.md (Owns);
    roles/security.md rule 3; roles/README.md (two ownership rows).
- **Verified:**
  - `bash scripts/board.sh` on the branch: header + 10 rows (0, 1, 2a, 2b, 2c, 2d, 2e, 3, 3c, 4a), exit 0, no stderr.
    Ids and states equal board.md at 5c3aa7e (checked with a diff of id|state pairs) except 3c `DONE` (orchestrator
    move) and the extra `4a | ... | SPEC_READY`.
  - `bash scripts/lessons.sh` on the branch: L5, L11, L12, L13, L14, L15, L17, L20, L21, L22, L24, L25, L26, L27, then
    `lessons.sh: 14 open (14 archive, 0 per-task)`, exit 0.
  - Hand-run on a scratch fixture: board order `0, 2, 2b, 3c, 10`, dirs without a brief skipped, missing/empty/unknown
    State and bad heading each give one stderr line and exit 1, an argument gives usage + exit 2, no `tasks/` exit 2,
    empty `tasks/` prints the two header lines, exit 0; lessons.sh wrong task id, `.0`, `.a`, duplicate and unknown
    `Closes:` id each give one stderr line, exit 1, the well-formed open lessons still listed.
  - `git grep -n -E 'tasks/(board|lessons|decisions)\.md' -- ':!tasks/' ':!specs/'`: only citations of archived
    entries (ORCHESTRATOR.md L11/L19/L16/L22, PROJECT_CONTEXT.md, git-release rule 3), "frozen archive" descriptions
    (AGENT_RULES 26, ORCHESTRATOR section 8) and lessons.sh reading the archive; no `tasks/board.md`. Templates have no
    mention (checked), so `templates/**` untouched.
  - `bash scripts/verify.sh --no-db`: `verify.sh: FAIL 1/15 failed: npm run test:e2e (1 skipped)`. Scope, typecheck,
    lint, `npm test`, build PASS; `test:e2e` fails only because the local-stack env vars aren't set (I was told not to
    start/reset the shared local stack). The full `verify.sh` for AC15 must run where the stack env is exported (or in CI).
- **Left to do:** qa-test: tests for AC1-AC9 in `tests/integration/**`. Then security gate, review, the person's label.
  The orchestrator moves 4a's own State (still `SPEC_READY`; I didn't move it).
- **Next role must know:**
  - Behaviour choices inside the ACs: titles and State cells are printed raw (a `|` in a title is not escaped);
    a missing `Owner role` row prints an empty cell and is not an error; ids without a leading number sort last;
    the State word is the text before the first space or `(`. lessons.sh: `Closes:` may have leading whitespace; an
    empty `Closes:` line is a problem; a per-task heading `## L<tok>. ` without a dot in `<tok>` (e.g. `## L28. `) is
    reported; a duplicate keeps the first; archive duplicates/odd headings are not checked (frozen file).
  - Exact stderr texts: `board.sh: <file>: no '| State |' row`, `... State cell is empty`,
    `... State '<cell>' doesn't start with one of: BACKLOG ... BLOCKED (ORCHESTRATOR.md section 3)`,
    `... first line is not '# Task <id>: <title>'`; `lessons.sh: <file>: heading L5y.1 has the wrong task id (expected
    L5x.<n>)`, `... heading L5x.0 has a bad number (expected a positive integer)`, `... duplicate id L5x.2`,
    `... Closes: names L99, which is no lesson`. Tests should match on the problem, not the full wording, if the text may
    still change in review.
  - Both scripts need bash 4+ (`[[ =~ ]]`, arrays); Git Bash 5.2 and ubuntu bash 5 are fine. Invoke Git Bash on
    Windows (not WSL), write fixtures with LF (the scripts also strip CR).

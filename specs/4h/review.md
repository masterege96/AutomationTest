Result: APPROVE

# Code review round 3: task 4h (delta 79e5814..6a3d8b7)

- **Role:** code-reviewer, round 3, 2026-11-26, fresh context, judged from the repo only. Git and reading only; no
  tests, verify.sh, vitest, builds or supabase run (the person's rule).
- **Branch:** `chore/4h-role-lessons`, HEAD `6a3d8b7`, base `origin/main`. Delta read: `git diff 79e5814..HEAD`
  (`923c6fc` ORCHESTRATOR.md 3a; `0c602fd` `tasks/4/PLAN.md` + `tasks/decisions/2026-11-26-4h-full-suite-on-ci-only.md`;
  `6a3d8b7` that decision file's "Who:" line only, `git diff --check` clean).
  Also re-read `rules/AGENT_RULES.md` (decisions recorded as new files in `tasks/decisions/`), `roles/code-reviewer.md`,
  `ORCHESTRATOR.md:70-123` (3a), `scripts/gate-check.sh` header, `CODE_SPEC` / `DECISION_SPEC` / `PROTECTED_SPEC`.
- `git diff --check 79e5814..HEAD`: clean; no CR characters. Scope: `ORCHESTRATOR.md` (allowed) and `tasks/**`.

## Round-2 findings

1. **Should-fix 1 (3a catch-up-merge sentence): resolved.** `ORCHESTRATOR.md:117-119` now reads "A clean catch-up
   merge doesn't make the gates stale unless `main` changed a file this PR also changes (it can still need a re-label,
   case (c) above)", which matches the freshness bullet (`:83-85`) and `gate-check.sh` (net-diff equality, fail safe).
   No sentence in 3a now contradicts another.
2. **Should-fix 2 (stale 3a block in `tasks/4h/TASK_BRIEF.md` Handoff): accepted as handled.** Quoting 3a in full from
   `ORCHESTRATOR.md` at the final HEAD in the PR description satisfies AC18 (the person approves the text that is
   actually in the file), and the Handoff block is history that is not deleted. Condition: the PR description must be
   taken from the final HEAD, not from the brief. Optional: add a one-line Handoff entry marking that block superseded;
   that is a `tasks/**` (non-decision) path, so it would not make the gates stale.
3. Nits 3 (security.md Burst-bound order) and 4 (3a wrapping) unchanged, still optional.

## Delta findings

1. **`tasks/decisions/2026-11-26-4h-full-suite-on-ci-only.md`, note (no action), owner: orchestrator.** Content is
   fine: the format matches the existing decision files (Date, Task, Who with the person's words verbatim, Source,
   Decision, Follow-up), the name follows `<YYYY-MM-DD>-<task-id>-<slug>.md` (AGENT_RULES, ORCHESTRATOR 7), and it is
   recorded as a new file. It does conflict with the current IN_REVIEW row / role "verify.sh passes on your branch"
   wording, but says so and defers that to a later protected-file PR, tracked in `tasks/4/PLAN.md:52-58`; this PR
   doesn't need to fix it. Gate consequence: `tasks/decisions/**` is a code path (`DECISION_SPEC`), so `0c602fd` is a
   net code change, and so is `6a3d8b7`. Both `specs/4h/security-gate.md` and this `review.md` (both still uncommitted)
   must be committed after `6a3d8b7`, each in its own commit, with no later code or decision-file change; otherwise `merge-gate` reports
   them stale.
   `6a3d8b7` changes only the "Who:" line (from "as relayed verbatim by the coordinator" to "received directly from the
   person in this thread"); the quoted words, date and decision are unchanged. The repo can't show which channel the
   words came by; that rests on the orchestrator's record.
2. **`tasks/4/PLAN.md:52-58`, OK.** Plan note matches the decision and names the follow-up (ORCHESTRATOR section 3
   IN_REVIEW row and 3a, role contracts, 4g test lock). Long lines are consistent with the rest of that file.
3. **`ORCHESTRATOR.md:118-119`, nit, owner: orchestrator.** Line 119 ("above). After each merge, git-release checks")
   is short after the fix; cosmetic, reflow together with round-2 nit 4 if ever touched (keep "frozen archive" and
   `tasks/decisions.md` on one line).
4. **Label, reminder.** `923c6fc` changed a protected file (`ORCHESTRATOR.md`), so the person's
   `framework-change-approved` label must be applied after the last push that changes protected paths (3a case (b)).

No blockers, no open should-fix. APPROVE stands on `6a3d8b7`, provided the gate files are committed after it and the
PR description quotes 3a from the final HEAD.

---

# Round 2 (on 79e5814), kept below

# Code review round 2: task 4h (role-contract lessons L14, L20, L21, L25, L26, L11 S20/S21, ORCHESTRATOR 3a after 4b)

- **Role:** code-reviewer, round 2, 2026-11-26, fresh context, judged from the repo only.
- **Branch:** `chore/4h-role-lessons`, HEAD `79e5814`, base `origin/main` (`1bccd4c`). New since round 1:
  `c8e7997` (row-9 outcomes, git-release rule 3 and 3a wording, L17/L22 closed), `79e5814` (3a line wrap for
  task-scripts AC13). Whole `git diff origin/main...HEAD` re-read.
- **Inputs read:** `rules/AGENT_RULES.md`, `roles/code-reviewer.md`, `PROJECT_CONTEXT.md`, `ORCHESTRATOR.md`,
  `tasks/4h/TASK_BRIEF.md` (ACs, Q1-Q7, Handoff incl. "gate round 1 fixes" amending AC8 and AC16), the four changed role
  files, `tasks/4h/lessons.md`, `tasks/4a/lessons.md` (format), `scripts/gate-check.sh` (header, `CODE_SPEC`,
  `PROTECTED_SPEC`, freshness and push-time code), `specs/3/threat-model.md` 4.5, `tasks/lessons.md` L17/L22.
- Docs-only PR; no tests, verify.sh or builds run by this review (instructed; CI verify/db-check/secrets reported
  green on this HEAD). `specs/4h/security-gate.md` is not on the branch yet; AC18 still needs it.

## Scope (AC17)

`git diff --name-only origin/main...HEAD`: `ORCHESTRATOR.md`, `roles/db-architect.md`, `roles/devops-cicd.md`,
`roles/git-release.md`, `roles/security.md`, `tasks/4h/TASK_BRIEF.md`, `tasks/4h/lessons.md` (+ this file). All inside
Allowed paths plus `tasks/**` / `specs/4h/`; nothing under `scripts/`, `rules/`, `tests/`, `.github/`, `templates/`,
`app/`, `lib/`, `supabase/`. Every hunk maps to an AC (or the amended AC8/AC16 and the round-1 nits); no reflow or
renumbering elsewhere. `git diff --check`: clean; no CR characters.

## Acceptance criteria (as amended)

| AC | Result | Evidence |
|----|--------|----------|
| AC1-AC3 | OK | Unchanged since round 1: `roles/db-architect.md:33-34` (outputs 9, 10), `:42` (rule 6), `:43-47` (rule 7), `:56` (Done when). |
| AC4, AC5 | OK | `roles/security.md:34`; `grep -n "set local role" roles/*.md` shows only `db-architect.md:44,45` and `security.md:34`, all with `; reset role`. |
| AC6, AC7 | OK | `roles/security.md:35-36`, unchanged. |
| AC8 (amended) | OK | `roles/security.md:37`: Pass (first 429 at/before baseline limit, every later 429, never a success); Burst-bound (first 429 after that, no later than attempt bucket size + 1, every later 429, at most one non-429 of the 2 after the wait, never a success, release blocked until the person decides); Fail = anything else. The three cover every result. With bucket 30 this equals threat model 4.5 (7..31, Fail "no 429 by attempt 31, or any 200"). Decisions file, person only, key by variable only. |
| AC9, AC10 | OK | `roles/devops-cicd.md:62`; `roles/security.md:9` ("(fail closed)", round-1 N2 "rule 1" removed). |
| AC11 | OK | `roles/git-release.md:18`, `:24`; `grep -rn "branch protection" roles/` shows only those two, neither lets an agent set it. "(Outputs, Phase 0)" points to a real section (`:31-33`). |
| AC12 | OK | `ORCHESTRATOR.md:81-91`. New wording checked against `gate-check.sh:5-8,21-24,90-91,122-139`: code = every path except the two gate files, `post-deploy.md` and `tasks/**`, with `tasks/decisions*` re-included (correct); "a clean catch-up merge ... doesn't make them stale unless `main` changed a file this PR also changes (then they may be reported stale: fail safe)" is correct, because the net diff text of a shared file changes (hunks/context/line numbers), so G_CODE != HEAD_CODE. tasks-only PR, own commits, fail safe, no merge-base FAIL all present. `frozen archive` and `tasks/decisions.md` are on the same line (`:88`), as task-scripts AC13 needs. |
| AC13 | OK | `ORCHESTRATOR.md:92-97` equals `PROTECTED_SPEC` (`gate-check.sh:93-94`), 11 entries, plus the catch-up-merge sentence. |
| AC14 | OK | `ORCHESTRATOR.md:98-103`, unchanged since round 1; matches push-time logic `gate-check.sh:36-47,148-190`. No sentence lets a stale label pass. |
| AC15 | OK | `ORCHESTRATOR.md:74-75`; `roles/git-release.md:51` rule 3 now: merge first only when the branch conflicts; clean catch-up merge after gates fine unless it touches a file this PR also changes, pointer to 3a. Round-1 nit 1 resolved, consistent with 3a `:115-118`. |
| AC16 (amended) | OK | `tasks/4h/lessons.md`: 4a format, `Closes: L14, L20, L21, L25, L26`, L11 S20/S21 sentence with no L11 close, second `Closes: L17, L22` with reason (both really fixed by 4b: `post-deploy.md` excluded in `CODE_SPEC`, net-change freshness). `bash scripts/lessons.sh` on the branch: `lessons.sh: 6 open (4 archive, 2 per-task)`, exit 0, lists L11, L12, L13, L24, L4d.1, L4d.3; no L14/L20/L21/L25/L26/L17/L22. `origin/main` (`1bccd4c`, extracted tree): `lessons.sh: 13 open (11 archive, 2 per-task)`. 13 - 6 = 7, exactly the seven intended closes. |
| AC17 | OK | See Scope. |
| AC18 | Pending | This review APPROVE; `security-gate.md` (round 2) still to be committed after this; the person's label after the last push; PR description must quote the current 3a in full (see finding 2). |

## Findings

1. **ORCHESTRATOR.md:117-118, should-fix, owner: orchestrator (the person approves).** The paragraph after branch
   protection still says flatly "A clean catch-up merge doesn't make the gates stale (it can still need a re-label,
   case (c) above)", while the amended freshness bullet (`:83-84`) now says it can, when `main` changed a file this PR
   also changes. Two sentences in the same section that the person approves verbatim disagree. Not unsafe (gate-check
   fails safe and the bullet is the precise one), but a reader of the later paragraph expects green gates and gets a
   red `merge-gate`. Suggested: "A clean catch-up merge doesn't make the gates stale unless `main` changed a file this
   PR also changes (and it can need a re-label, case (c) above)." Fix before labeling, so it costs no extra re-label.
2. **tasks/4h/TASK_BRIEF.md:309-363 (Handoff "New ORCHESTRATOR.md 3a text"), should-fix, owner: orchestrator.** The
   block marked "for the PR description, quote in full" is the pre-round-1 text (no "unless `main` changed a file
   this PR also changes", no "Code means every path except ..."); the AC map line numbers there are also stale. AC18
   requires the PR description to quote the 3a text the person approves; copying this block would quote the wrong
   text. Quote 3a from `ORCHESTRATOR.md` at the final HEAD (or replace/mark this block superseded in a new Handoff
   entry; earlier entries aren't deleted).
3. **roles/security.md:37, nit, owner: security.** Burst-bound allows "at most one non-429 among the 2 requests after
   the wait" in either order; threat model 4.5 says "at most 1 non-429 then 429". With a token bucket a `[429, non-429]`
   result is odd but harmless (still no success). Optional: "the first may be non-429, the second is 429".
4. **ORCHESTRATOR.md:83, 87-88, nit, owner: orchestrator.** Uneven wrapping from the 79e5814 fix (line 83 runs past the
   section's ~88-column width, line 87 is short). Cosmetic only; reflow when fixing finding 1, keeping
   "frozen archive" and `tasks/decisions.md` on one line.

No blockers. Findings 1 and 2 should be fixed (or accepted in writing) before the person labels; neither lets a stale
gate or a stale label pass.

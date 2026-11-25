Result: PASS

# Security gate: task 4a (per-task files for state, lessons and decisions; scripts/board.sh, scripts/lessons.sh)

- **Role:** security (gate), 2026-11-25, fresh context, judged from the repo only. No production access, no SQL, no
  Supabase tools, no dashboard.
- **Branch:** `chore/4a-per-task-files`, base `origin/main`. Diff: `git diff origin/main...HEAD` (13 commits, `3e7a13f` ..
  `4b07914`), 24 files: `ORCHESTRATOR.md`, `rules/AGENT_RULES.md`, `roles/{README,git-release,product-spec,security}.md`,
  `scripts/board.sh` (new, 100755), `scripts/lessons.sh` (new, 100755), `tests/integration/task-scripts.test.ts` (new),
  and `tasks/**` (State rows of 2a, 2b, 2c, 2d, 2e, 3, 3c; `tasks/4/PLAN.md`; `tasks/4a/*`; two decision files; one
  header line in each archive; `tasks/board.md` deleted).
- Not re-run by this role: builds, e2e, `verify.sh` (orchestrator: `verify.sh: PASS 19/19 (0 skipped)`, brief Handoff).

## Applicable baseline rows

The brief flags row 13 only. No route, auth, client-trusted value, SQL, env var, dependency, LLM use or upload is in the
diff, so no abuse test beyond row 13 is required.

| Row | Control | Evidence | Result |
|-----|---------|----------|--------|
| #13 | No secret, key or project ref in any new or changed file | Pattern scan of the full diff for JWTs (`eyJ`), `sb_`/`sbp_`/`sk_` keys, `service_role` values, `*.supabase.co` URLs, `password`/`token`/`api_key` assignments, 20-char lowercase project-ref shapes: no hit; only prose mentions of "secrets" (CI check name, PLAN.md 4c/4e describing where the person stores keys). `git ls-files` has only `.env.example`. Decision files (`tasks/decisions/2026-11-25-4-step4-choices.md`, `...-4a-step-4-go-ahead.md`) hold quotes, times and choices, no ref or key. Test file writes fixtures to `fs.mkdtemp` only. CI gitleaks runs on the PR. | PASS |

## The two scripts (untrusted brief and lesson text)

Read line by line (`scripts/board.sh` 1-92, `scripts/lessons.sh` 1-122):

- **No eval/source/exec of content.** Neither script uses `eval`, `source`/`.`, `bash -c`, or awk `system()`, `getline`
  or `print >`/`print |`. Command substitutions run only fixed commands (`printf '\t'`, `parse_brief "$f"`, `task_ids`,
  the awk program, `sed`/`grep`/`sort`). The unquoted heredocs (`board.sh:66-68`, `:88-90`; `lessons.sh:51-53`) expand
  `$(...)` once; the result is data and is not re-expanded.
- **Quoting.** All variable uses are double-quoted. `[[ "$first" == "$prefix"* ]]` and `${first#"$prefix"}`
  (`board.sh:70-71`) quote the prefix, so glob characters in a directory name are literal; the state check
  `case "$STATES" in *" $word "*)` (`board.sh:82-83`) quotes `$word`. Data is printed with `echo "| ..."` /
  `printf '%s\n'`, never as a format string. awk gets file names via `"${FILES[@]}"` (`lessons.sh:108`); all start with
  `tasks/`, so none can be taken as an awk `var=value` assignment or option.
- **Paths.** Task ids come from the glob `tasks/*/` (`board.sh:34`, `lessons.sh:36`), so an id cannot contain `/`;
  every read path is `tasks/<id>/TASK_BRIEF.md` or `tasks/<id>/lessons.md`, checked with `[ -f ]`. Nothing is written.
- **Adversarial fixtures (scratchpad, run by this role):** a brief/lesson containing `$(touch PWN)`, backticks,
  `${HOME}`, `%s %n`, an ESC sequence, and task dirs named `-n`, `x=y`, `*`: content printed as text, no file created,
  no expansion; `x=y/lessons.md` parsed as a file, not an awk assignment; `(DONE)` reported as a bad state, exit 1. A
  3 MB State line: completes (about 10 s on Git Bash/Windows), exit 0. 20 KB of random bytes as brief and lessons file:
  two stderr lines / ignored, exit 1 / 0, no hang. File without trailing newline: parsed.
- **Repo run:** `bash scripts/board.sh` exit 0 (11 rows, states match the migration); `bash scripts/lessons.sh` lists
  the 14 archive lessons of AC9, exit 0. `npx vitest run tests/integration/task-scripts.test.ts`: 39 passed.

## Framework text: old vs new

| File | Old | New | Weakened? |
|------|-----|-----|-----------|
| `rules/AGENT_RULES.md:6-7` | person's decision written into `tasks/decisions.md` | recorded as a new file in `tasks/decisions/` | No: same obligation, new location |
| `rules/AGENT_RULES.md:55` (rule 26) | add failures to `tasks/lessons.md` | add to `tasks/<id>/lessons.md` as `L<id>.<n> (open)` | No |
| `rules/AGENT_RULES.md` 18a, 22 | unchanged | unchanged (only the person adds labels; only the orchestrator marks DONE) | No |
| `roles/security.md:42` (rule 3) | dependency vuln FAIL unless the person accepts it in `tasks/decisions.md` | ... in a decision file in `tasks/decisions/` | No; rules 1, 2, 4, 5 (fail closed, only the person overrides, stop rule 2) unchanged |
| `roles/git-release.md:50` (rule 3) | rebase on `main` if behind; never rewrite others' pushed history without OK | merge `main` before the gates; same history rule; adds the conflicting-PR / re-run facts | No; it removes the force-push a rebase needs |
| `roles/git-release.md`, `roles/product-spec.md` Owns | listed `tasks/board.md` | removed (file deleted) | No |
| `roles/README.md:28-29` | none | `tasks/<id>/lessons.md` (roles on that task), `tasks/decisions/*` (recording role, never edited after merge) | No (new rows) |
| `ORCHESTRATOR.md:63-66` | state lived in board.md | State row of the brief is the only record; whoever the table names moves it | No: the "Who moves it in" table (DONE = orchestrator only) and its "Required to move in" column are unchanged |
| `ORCHESTRATOR.md:92-101` (3a) | none | conflicting PR gets no `pull_request` run; re-evaluate by merging main | No; branch protection, required checks, fresh-context rule unchanged |
| `ORCHESTRATOR.md:138-169` (7, 8) | board/decisions/lessons files; lesson without a fix stays open | per-task files, frozen archives, `lessons.sh`; same "lesson without a fix stays open" | No |

Production, secrets, labels and gate rules are not touched anywhere in the diff.

## Frozen archives and history

`git diff origin/main...HEAD -- tasks/lessons.md tasks/decisions.md`: one added line each, zero removed lines; L1-L27
and every decision row unchanged. `tasks/board.md` is deleted but stays in git history; its content was copied into the
State rows first (commit `d669cf4`). `2026-11-25-4-step4-choices.md` was edited in this PR, but it was added on this same
branch (`bfa9860`, not on main), so the "never edited after merge" rule is not broken.

## Findings (none blocking)

1. **S5 unchanged, now spans more files (known; fixed by 4b).** `scripts/gate-check.sh:54` excludes `tasks/**` from "last
   code change" and `:67` does not protect it; `scripts/verify.sh:79` always allows `tasks/*`. After 4a the records that
   matter for gating live there: State rows (who may mark DONE), `tasks/decisions/**` (the person's FAIL overrides and
   dependency-risk acceptances, `roles/security.md:42`), and `Closes:` lines. A `tasks/**`-only PR or commit can still
   add a "decision", flip a State row to DONE, or close a lesson without fresh gates or the label. This is the same
   exposure as `tasks/decisions.md` / `tasks/board.md` before 4a (S5, `tasks/lessons.md:142`), not a new way around the
   gate. 4b (`tasks/4/PLAN.md` row 4b) must cover `tasks/decisions/**` (not only the old file name) and should consider
   briefs' State rows and `tasks/*/lessons.md` `Closes:` lines.
2. **`Closes:` from any task closes any lesson (low).** `scripts/lessons.sh:94-99` accepts a `Closes:` line in any
   `tasks/<id>/lessons.md`, for any id, including security-owned findings (L11, L21, L26). Before 4a anyone could edit the
   archive status in the same way, so this is not weaker, but a close is now in a file unrelated to the lesson and easy to
   miss in review. Suggest (4b/4h): reviewers check every new `Closes:` line, and security confirms closes of
   security-owned lessons.
3. **Raw control characters pass through to the terminal (info).** `scripts/board.sh:87`, `scripts/lessons.sh:117`
   print brief/lesson text unfiltered; an ESC sequence in a brief is emitted as-is (seen in the fixture). Content comes
   only from reviewed repo files; no action needed.
4. **3c set to DONE without `specs/3c/post-deploy.md` (info).** Commit `55c6102` moves 3c to DONE on the orchestrator's
   written instruction (brief Handoff "orchestrator, 2026-11-25"; DONE is orchestrator-only, `ORCHESTRATOR.md` section 3).
   3c is docs-only and 2d/2e were already DONE on board.md without a post-deploy record, so this follows existing
   practice; it is the orchestrator's call, not a gate issue.
5. **Ownership map does not name State-row editors (info, doc).** `roles/README.md:27` still says the brief is
   product-spec's with every role appending to Handoff; `ORCHESTRATOR.md:63-66` lets whoever moves the task edit the
   State row. Not a weakening (DONE stays orchestrator-only, AGENT_RULES 22); the reviewer may want the map to mention it.

## Approval needed before merge

The diff changes protected framework paths (`scripts/**`, `rules/**`, `roles/**`, `ORCHESTRATOR.md`;
`scripts/gate-check.sh:67`). merge-gate FAILs until the person adds the `framework-change-approved` label (agents never
add it, AGENT_RULES 18a). Any text change to `rules/**` or `roles/**` after the label needs the person to look again
(S16: the label is not tied to a commit).

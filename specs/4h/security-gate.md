Result: PASS

# Security gate: task 4h, round 3 (delta since round 2: `923c6fc`, `0c602fd`, `6a3d8b7`)

- **Role:** security (gate, round 3), 2026-11-26, fresh context, judged from the repo only.
- **Branch:** `chore/4h-role-lessons`, **HEAD gated: `6a3d8b7`**, base `origin/main` (`1bccd4c`, still an ancestor of HEAD).
  Delta `git diff 79e5814..HEAD`: `ORCHESTRATOR.md` (3a, one sentence), `tasks/4/PLAN.md` (process note),
  new `tasks/decisions/2026-11-26-4h-full-suite-on-ci-only.md` (`0c602fd`, then its "Who:" line edited in
  `6a3d8b7`). Docs only; no scripts, workflows, app code.
- **Not run (per the person's rule: full suite only on GitHub CI, one test job at a time on the PC):** verify.sh,
  vitest, builds, supabase. Git and reading only.

## `ORCHESTRATOR.md:117-119` (3a catch-up-merge sentence)

Old: "A clean catch-up merge doesn't make the gates stale (it can still need a re-label, case (c) above)."
New: "... doesn't make the gates stale unless `main` changed a file this PR also changes (...)".

- **Accurate vs `scripts/gate-check.sh`:** freshness compares the net code diff from each commit's own merge-base
  (`net_diff`, `:100-116`; check `:119-137`). After a clean merge where `main` touched only files the PR doesn't
  change, `git diff <new MB> HEAD` is unchanged for every file, so G's net code = HEAD's: not stale. If `main`
  changed a file the PR also changes, the diff text for that file changes (blob ids in the `index` line, context,
  offsets), so the gate is reported stale. "Unless" only says the no-overlap case is safe; it doesn't claim the
  overlap case is always stale (an overlapping `tasks/**` file is outside the code diff), so it is correct.
- **Consistent with the rest of 3a:** matches the freshness bullet (`ORCHESTRATOR.md:83-84`, "doesn't make them
  stale unless `main` changed a file this PR also changes (then they may be reported stale: fail safe)") and
  `roles/git-release.md:51` rule 3 ("fine unless it brings in a change to a file this PR also changes"). The earlier
  wording was the outlier (it implied every clean catch-up merge keeps the gates fresh).
- **Weakens nothing:** it narrows a "no re-run needed" statement, so more cases re-run gates. The re-label clause
  (case c) is unchanged. The script is unchanged and remains the enforcement.

## `tasks/decisions/2026-11-26-4h-full-suite-on-ci-only.md` and `tasks/4/PLAN.md` note

- **No check dropped:** item 3 requires GitHub's `verify`, `db-check`, `secrets` to pass on the final head before any
  merge, and both gate files committed after the last code change. That is what branch protection and `merge-gate`
  already enforce (`ORCHESTRATOR.md:105-107`); `merge-gate` isn't named in item 3 but the decision doesn't remove it
  and branch protection still requires it. The full `scripts/verify.sh` still runs, only its location moves (PC to
  GitHub Actions); the PC keeps targeted tests. This is stricter than before for merges (GitHub's run is explicitly a
  precondition for "ready for the label").
- **Record form:** person's words quoted, dated, in `tasks/decisions/` with the required name pattern
  (`rules/AGENT_RULES.md:6-7`). It changes no protected file; the needed contract updates (`ORCHESTRATOR.md:58`
  IN_REVIEW row, `rules/AGENT_RULES.md:46` rule 20, role contracts' "verify.sh passes on your branch") are deferred to a
  later protected PR with the person's label (PLAN note). Until then the texts differ in where verify.sh runs, but
  GitHub's `verify` on the branch still satisfies "passes on your branch", so no gate is weaker in the meantime.
- **`6a3d8b7` (`git diff 0c602fd..6a3d8b7`):** one line, the "Who:" provenance changes from "as relayed verbatim by
  the coordinator" to "received directly from the person in this thread". The quoted words, date, time, source and
  the Decision/Follow-up sections are unchanged, so nothing above changes. Direct receipt is the stronger form for
  AGENT_RULES 6-7 (the person's own decision). The thread itself isn't in the repo, so this report can't confirm the
  provenance; it takes the line as written.
- **Gate freshness:** `tasks/decisions/**` counts as code (`scripts/gate-check.sh:6-7, 91`), so `0c602fd` and
  `6a3d8b7` are code changes after the round-2 gate; this round-3 file (and a new review) must be committed after
  `6a3d8b7`, each in its own commit. `tasks/4/PLAN.md` is `tasks/**`, not code.
- **No secret** in the delta (grep for `sb_secret`, `eyJ`, `password=`, `token=`: no hit). No workflow change.

## Round-3 result

PASS. The new 3a sentence matches `scripts/gate-check.sh` and the freshness bullet and only narrows a "fresh"
claim; the decision file keeps every required check (`verify`, `db-check`, `secrets`, gate files after the last code
change; `merge-gate` untouched). Merge still needs GitHub CI green on the final head, this gate and the review
committed after `6a3d8b7`, and the person's `framework-change-approved` label after the last push that changed a
protected file (`923c6fc` changed `ORCHESTRATOR.md`, so any earlier label is stale, 3a case b).

---

# Round 2 report (on `79e5814`, kept unchanged below)

# Security gate: task 4h, round 2 (role-contract lessons L14, L20, L21, L25, L26, L11 S20/S21, ORCHESTRATOR 3a after 4b)

- **Role:** security (gate, round 2), 2026-11-26, fresh context, judged from the repo only. The round-1 report was
  used as a checklist; every point below was re-checked against the files.
- **Branch:** `chore/4h-role-lessons`, HEAD `79e5814`, base `origin/main` (`1bccd4c`, an ancestor of HEAD: the branch
  is up to date with main). Round-2 delta since the round-1 HEAD `ae03848`: `c8e7997`, `79e5814`
  (`ORCHESTRATOR.md`, `roles/git-release.md`, `roles/security.md`, `tasks/4h/TASK_BRIEF.md`, `tasks/4h/lessons.md`).
- **Diff (`git diff --name-only origin/main...HEAD`):** `ORCHESTRATOR.md`, `roles/db-architect.md`,
  `roles/devops-cicd.md`, `roles/git-release.md`, `roles/security.md`, `tasks/4h/TASK_BRIEF.md`, `tasks/4h/lessons.md`.
  Docs only: no app code, migrations, tests, scripts, workflows, env vars or dependencies (AC17 holds).
- **Not run (per instructions; one test job at a time on this PC):** verify.sh, vitest, builds, e2e, supabase. GitHub
  CI is reported green on this HEAD for `verify`, `db-check`, `secrets`. Run here: `git diff`/`git log`, greps,
  `bash scripts/lessons.sh` (branch and an exported copy of `origin/main`), `bash scripts/board.sh`.

## Applicable baseline rows

| Row | What this PR does | Weakened? |
|-----|-------------------|-----------|
| 9 | `roles/security.md:35-37`: two proofs (static config test + person-run production check), local live test is non-proof, burst caveat, production check wording with three outcomes | No (see F1 re-check below). Target unchanged; only what counts as proof. |
| 2, 14 | `roles/db-architect.md:33-34, 42-47, 56`: revoke-then-grant, per-column INSERT/UPDATE, Grants output, per-role privilege tests, `; reset role` pattern | No. Adds requirements. |
| 1, 11 | `roles/devops-cicd.md:62`, `roles/security.md:9`: Next.js upgrade re-runs CSP + T1 proxy-bypass suites; security re-check, missing re-check is FAIL | No. Adds a gate. |
| 13 | Production check names the key only by its env/shell variable (`roles/security.md:37`); no secret value anywhere in the diff (grep for `sb_secret`, `eyJ`, `password=`, `token=`: no hit) | No. |
| Merge approval (3a) | `ORCHESTRATOR.md:74-75, 81-103, 115-119` | No (see 3a vs gate-check below). |

No abuse tests apply (contract text only).

## Round-1 F1 re-check: row-9 production-check outcomes (`roles/security.md:37`)

Text now: **Pass** = first 429 at or before the baseline's attempt limit *L*, every later one 429, never a success;
**Burst-bound** = first 429 later than *L* but no later than attempt *B + 1* (*B* = bucket size), every later one
429, at most one non-429 among the 2 requests after the wait, never a success, release blocked until the person
records a decision; **Fail** = anything else, including no 429 by attempt *B + 1* or any success: stop, tell
security. More than *B* + margin requests are sent, so attempt *B + 1* is always observed.

- **No gap:** Fail is defined as the complement ("anything else"), so every result has an outcome. Enumerated by the
  first 429 position *f*: *f* <= *L* is Pass or Fail; *L* < *f* <= *B + 1* is Burst-bound or Fail; *f* > *B + 1* or
  no 429 is Fail. Round 1's unassigned band (first 429 at 31..35 for *B* = 30) is now 31 = Burst-bound (the expected
  full-bucket result), 32..35 = Fail, exactly as `specs/3/threat-model.md` 4.5 ("between attempts 7 and 31"; Fail "no
  429 by attempt 31"). If *L* >= *B + 1* the Burst-bound band is empty; still exhaustive.
- **No overlap:** Pass needs *f* <= *L*, Burst-bound needs *f* > *L*; Fail is the rest.
- **No weaker than 4.5:** Burst-bound keeps 4.5's three conditions (every later one 429, never a 200, at most one
  non-429 after the wait) and its upper bound (*B + 1* = 31). The cases 4.5 left unassigned (a non-429 after the first
  429 inside the burst; 2 non-429 after the wait) are now Fail, i.e. stricter. Pass is worded as in 4.5 (see N1 for
  its threshold).
- **Risk acceptance can't cover Fail:** the only release-by-decision clause ("release stays blocked until the person
  records a decision") is inside the Burst-bound parentheses; Fail says "stop, tell security" with no decision path.
  4.5 (c) (risk acceptance, the person only, security doesn't accept) stays a Burst-bound option only and is unchanged.
- Only the person runs it, agents never test production, result goes to a `tasks/decisions/` file (the archive
  `tasks/decisions.md` is frozen since 4a). Brief AC8 is amended to the same text (orchestrator entry "gate round 1
  fixes").

**F1 is fixed.**

## Old vs new text (does anything weaken a rule?)

| File:line | Change | Weakens production / secrets / gates / labels / DONE / repo settings / destructive rules? |
|-----------|--------|--------------------------------------------------------------------------------------------|
| `roles/db-architect.md:33-34` | output 9 gains per-object, per-API-role privilege tests incl. roles with none and the rule 7 pattern; new output 10 Grants | No. Adds. |
| `roles/db-architect.md:42` (rule 6) | revoke all from `anon`/`authenticated` (+ `public` for functions), then grant only what ACs need; per-column INSERT/UPDATE; never rely on default privileges; `service_role` no explicit grant unless needed, but stated and tested | No. Strengthens rows 2/14. |
| `roles/db-architect.md:43-47` (rule 7) | `throws_ok`/`lives_ok` with trailing `; reset role`, reason, assertions as `postgres`, `current_user` check | No. |
| `roles/db-architect.md:56` | Done when gains Grants entry + grant test | No. |
| `roles/devops-cicd.md:62` (rule 6) | any `next` version change: CSP e2e + T1 suite on a production build, results in Handoff, no merge before security re-check; nonce CSP / `cacheComponents` caveat | No. Adds a gate. |
| `roles/security.md:9` | Next.js upgrade re-check per section; missing re-check is FAIL (fail closed); round-1 N2 ("rule 1") removed | No. |
| `roles/security.md:34-37` | L20 pattern reference; row-9 proofs, burst, check wording | No (F1 fixed). |
| `roles/git-release.md:18` | ownership claim "Plus GitHub repository settings: branch protection, labels, merge settings" replaced by: documents and proposes, the person sets them; creating labels fine; applying the two approval labels is the person's alone | No. Removes the contradiction with `rules/AGENT_RULES.md:41` (18a). Label creation was already in Outputs (`roles/git-release.md:33`); creating a label grants nothing. |
| `roles/git-release.md:24` | Never touches gains "never changes branch protection or other repository settings" | No. Strengthens. |
| `roles/git-release.md:51` (rule 3) | "behind main → merge before gates (until 4b, L22)" becomes "conflicts with main → merge before gates; a clean catch-up merge after the gates is fine unless it brings in a change to a file this PR also changes (ORCHESTRATOR 3a)" | No. Matches 3a (`ORCHESTRATOR.md:83-84, 115-118`) and the merged gate-check; the rest of the rule (no history rewrite, conflicting-PR CI facts, check other PRs) is unchanged. |
| `ORCHESTRATOR.md:74-75` | residual risk no longer lists "`tasks/**`-only changes" (S5); still names S14 / task 4c | No. S5 is fixed in the merged script: G must be in `MB..HEAD` for every PR (`scripts/gate-check.sh:122-126`) and `tasks/decisions*` count as code (`:91`). |
| `ORCHESTRATOR.md:81-103` | freshness, protected paths, re-label rules | No. Protected list grows from 5 to 11 entries; label tied to a push time (S16). |
| `ORCHESTRATOR.md:115-119` | "merge main before the gates, not after (L22)" becomes a recommendation only for conflicting PRs; a clean catch-up merge can still need a re-label (case c) | No. Matches the script. |

Who may mark DONE, production access, secret handling, destructive-change rules and the AGENT_RULES are not touched
(no `rules/**` file in the diff; ORCHESTRATOR hunks are all inside 3a).

## ORCHESTRATOR 3a vs `scripts/gate-check.sh` (identical on branch and main; no `scripts/**` change)

- **Protected paths** (`ORCHESTRATOR.md:92-94`): `.github/**`, `scripts/**`, `rules/**`, `roles/**`, `templates/**`,
  `ORCHESTRATOR.md`, `AGENTS.md`, `.gitleaks.toml`, `package.json`, `package-lock.json`, `supabase/config.toml`.
  `PROTECTED_SPEC` (`scripts/gate-check.sh:93-94`): the same 11 entries (directory pathspec = `<dir>/**`).
  **Identical.** "A protected file changed on main and brought in by a catch-up merge doesn't count"
  (`ORCHESTRATOR.md:96-97`) matches `git diff --name-only "$MB" "$HEAD_REF"` (`:145`) and `net_diff` from the
  merge-base.
- **Freshness** (`ORCHESTRATOR.md:81-91`): gate files committed on the branch after the last net code change = G in
  `MB..HEAD`, G changes no code, net code at G = net code at HEAD (`:119-137`); code = everything except the two gate
  files, `specs/<id>/post-deploy.md` and `tasks/**`, with `tasks/decisions.md` and `tasks/decisions/**` added back
  (`:89-92`); tasks-only PR still needs both gate files on the branch (`:123-126`); ERR = stale, no merge-base = FAIL
  (`:117-118`). **Catch-up-merge caveat** (`:83-84`, round-1 N1): a clean merge where main changed a file this PR also
  changes changes the net diff text (blob ids in the `index` line, context, offsets), so the script may report stale;
  3a now says so ("may be reported stale: fail safe"). Correct; "may" also covers an overlapping `tasks/**` file,
  which isn't in the code diff.
- **Label time and re-label cases** (`ORCHESTRATOR.md:98-103`): "strictly after the last push that changed the PR's
  net change on protected paths; commit dates never used" = push time is the earliest "same" push strictly after the
  latest "different" push, label strictly later (`:30-46, 155-188`). (a) force-push: replaced tips are unknown to git
  or differ, so they count as "different" (conservative instruction); (b) any push changing a protected file,
  including a revert to old content: "different"; (c) catch-up merge where main changed a protected file the PR also
  changes: the net protected diff from the new merge-base changes. A main change to a protected file the PR doesn't
  touch is outside the net diff, so (c)'s precise form is right. "A push that changes only non-protected files needs
  no re-label": the tip's net protected diff equals HEAD's, correct. "Label time or push times can't be read: fail"
  matches `:151-152, 159-181` (also a missing push for HEAD, `:178`). No 3a sentence tells the person a stale label
  is fine.
- **git-release rule 3 vs 3a:** consistent (merge first only when conflicting; clean catch-up merge after the gates
  is fine unless it touches a file the PR changes; pointer to 3a for staleness/re-label).

## Lessons bookkeeping

- `bash scripts/lessons.sh` on the branch: `lessons.sh: 6 open (4 archive, 2 per-task)`, exit 0; no `L14 `, `L17 `,
  `L20 `, `L21 `, `L22 `, `L25 `, `L26 ` line; `L11 ` still listed. On an exported copy of `origin/main` (`1bccd4c`):
  `lessons.sh: 13 open (11 archive, 2 per-task)`, exit 0. Delta 7 = amended AC16.
- `tasks/4h/lessons.md:15` `Closes: L14, L20, L21, L25, L26`, each backed by contract text above. No `Closes:` for
  L11 (`:11-13`): L11 keeps S14 (task 4c), S19, S26, S27 open, which is right; S20/S21 fixed here, S5/S15/S16 by 4b.
- **L17/L22 closing (`tasks/4h/lessons.md:17-20`) is justified by 4b (`26119bc`, PR #17, on main):** L17's fix
  (exclude `specs/<id>/post-deploy.md` from code) is `CODE_SPEC` (`scripts/gate-check.sh:90`); L22's suggested fix
  (compare the PR's net diff at the gate commit vs. HEAD) is exactly the freshness check (`:119-137`). 4b's brief
  names both (`tasks/4b/TASK_BRIEF.md:1, 16-18, 245`).
- `bash scripts/board.sh`: 4h `IN_REVIEW`, owner orchestrator.

## Standing checks

- **Workflows:** no `.github/**` change in the diff; no new `SUPABASE_*` secret use.
- **Label:** every changed non-`tasks/**` file is protected, so `merge-gate` needs the person's
  `framework-change-approved` label, applied after the last push (AGENT_RULES 18a; agents never add it). The round-2
  fix commits touched `roles/` and `ORCHESTRATOR.md`, so any label from before them is stale (3a case b).

## Findings (not blocking this PR)

- **N1 (row 9 Pass threshold, `roles/security.md:37`):** Pass uses "the baseline's attempt limit" (baseline row 9:
  "before 10 attempts", `rules/security-baseline.md:24`), while 4.5 uses the stricter task-specific target "at or
  before attempt 6" (2b item 22, configured limit + 1). For task 3's numbers a first 429 at 7..9 is Burst-bound under
  4.5 but could read as Pass under the generic text. Not a weakening of a rule: the baseline is the floor, the role
  text doesn't forbid a stricter limit, `specs/3/threat-model.md` 4.5 is unchanged and stays the operative check for
  task 3, and with Supabase's 30-request bucket that band doesn't occur. Suggest later: "the threat model's attempt
  limit (at most the baseline's; task 3: 6)". The person can also decide this with the 4.5 baseline proposal.
- **N2 (post-wait wording):** Burst-bound allows "at most one non-429 among the 2 requests after the wait"; 4.5 says
  "at most 1 non-429 then 429". Same number of allowed guesses (one per refill), so no security difference.
- **N3 (Pass and the post-wait requests):** "every later one 429" in Pass (same words as 4.5) may be read to include
  the 2 post-wait requests; a correctly refilling small bucket then gives one non-429 and lands in Fail. That errs
  safe (stop, tell security); worth a clarifying clause when the row-9 baseline wording is decided.
- **N4 (process):** no `specs/4h/threat-model.md` exists (the brief expected a short "docs only" one,
  `tasks/4h/TASK_BRIEF.md:215`); the brief's "Security rows that apply" section carries the design checks, as for
  4a/4b/4d. Not checked by the merge gate.

## Result

PASS. Round-1 F1 is fixed: the three row-9 outcomes cover every result with no gap or overlap, are no weaker than
`specs/3/threat-model.md` 4.5 (stricter for the cases 4.5 left open), and risk acceptance can't release a Fail. No
rule on production, secrets, gates, labels, DONE, repository settings or destructive changes is weakened; 3a matches
`scripts/gate-check.sh` exactly (protected paths, freshness incl. the catch-up-merge caveat, re-label cases,
fail-closed reads, S14 still open); git-release rule 3 is consistent with 3a; L17/L22 closing is backed by 4b; L11
stays open. No workflow change. Merge still needs the person's `framework-change-approved` label after the last push.

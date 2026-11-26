# Task 4h: role-contract lessons (L14, L20, L21, L25, L26, L11 S20/S21, ORCHESTRATOR 3a after 4b)

| Field | Value |
|-------|-------|
| State | SPEC_READY |
| Owner role | orchestrator (drafts the text in `roles/*.md` and `ORCHESTRATOR.md`, the person's files; the person approves the exact text with the `framework-change-approved` label, AGENT_RULES 18a) |
| Branch | `chore/4h-role-lessons` |
| Worktree | `../wt-4h-roles` |
| Depends on | 4b merged (PR #17, `26119bc`): AC10-AC13 describe its gate rules |

## Request

Orchestrator, 2026-11-26, step 4 plan approved by the person (`tasks/4/PLAN.md` row 4h, "role-contract lessons").
Turn these lessons into contract text (docs only, no scripts):

- L14: db-architect: every migration that creates an object in an exposed schema grants exactly the privileges the
  API needs (revoke-then-grant, column grants where sensible), and a pgTAP test checks those grants.
- L20: the `; reset role` pattern for `throws_ok`/`lives_ok` strings, where the schema.md / threat-model conventions
  live (db-architect, security).
- L21 + the task 3 row-9 burst finding (`specs/3/threat-model.md` section 4): security's threat-model guidance: per-IP
  auth limits are proven by a static config test plus a person-run production check, not a local live test; note
  Supabase's token-bucket burst and how to word the production check.
- L25 + L26: devops-cicd upgrade rule: at every Next.js upgrade, re-run the CSP e2e tests and the T1 proxy-bypass
  header suite, and security re-checks the threat model's CSP and header sections before the upgrade merges.
- L11 S20/S21: `roles/git-release.md` "Owns ... branch protection, labels, merge settings" contradicts AGENT_RULES
  18a; fix the wording (git-release documents and proposes, the person sets).
- `ORCHESTRATOR.md` 3a is the person's file. Its update after 4b goes in this PR as explicit ACs so the person approves
  the exact text with the label: the new freshness rule, the protected-path list, and "re-label after a force-push,
  a push that changes protected files, or a catch-up merge where main changed a protected file".

## Goal

Every agent that reads its role contract follows the five lessons without having read `tasks/lessons.md`, the
git-release contract no longer claims repository settings, and ORCHESTRATOR.md 3a tells the person exactly when the
merge gate is green and when to re-label, matching `scripts/gate-check.sh` as merged in 4b.

## Acceptance criteria

How to check: each AC names a file and the statements that must be in it. A reviewer checks them by reading the
diff (`git diff origin/main...HEAD`); the quoted fragments must appear literally, the rest is free wording with the
same meaning. Each new rule cites its lesson id (e.g. "(L14)") so later readers can find the history. Contract text
stays generic (it will be packaged as a template in 4i); pilot file names appear only as examples ("here: ...").

L14, grants (roles/db-architect.md):

- [ ] AC1: Given `roles/db-architect.md`, Then its **Rules** contain a rule saying: every migration that creates a
  table, view, sequence or function in an exposed schema (`PROJECT_CONTEXT.md` "Exposed DB schemas") grants exactly
  the privileges the API needs; it first revokes all privileges on the object from the API roles (`anon`,
  `authenticated`; for functions also `public`), then grants only what the brief's ACs need; INSERT/UPDATE are
  granted per column when clients may set only some columns; the design never relies on default privileges, because
  production's defaults can differ from the local image (L14). Example named: `specs/3/schema.md` section 4.
- [ ] AC2: Given the same file, Then **Outputs** require a "Grants" part in `schema.md` for every such object (the
  exact `revoke`/`grant` statements and, per API role including `service_role`, the resulting privileges in plain
  words, also "none"), and output 9 (test list for db-builder) requires, per object and per API role, a pgTAP test of
  the exact privileges (e.g. `table_privs_are`, `column_privs_are`, `function_privs_are`), including roles that must
  have none. **Done when** gains: "every object in an exposed schema has a Grants entry and a grant test in the test
  list". Example named: `supabase/tests/03_todos_test.sql`.

L20, `; reset role` (roles/db-architect.md, roles/security.md):

- [ ] AC3: Given `roles/db-architect.md`, Then output 9 (or a rule it points to) gives the pattern literally:
  `throws_ok($q$ set local role <role>; <statement>; reset role $q$, '<sqlstate>', '<message>', '<description>')`
  and `lives_ok($q$ set local role <role>; <statement>; reset role $q$, '<description>')`, with the reason (if the
  statement wrongly succeeds, the subtransaction commits and the role stays active for the rest of the file, so
  later assertions run as the wrong role or never run) and the rule that assertions run as `postgres` and the test
  checks `current_user = 'postgres'` after each role block (L20).
- [ ] AC4: Given `roles/security.md`, Then the threat-model **Outputs** say that any SQL abuse test written out in a
  threat model uses the AC3 pattern (with the trailing `; reset role`), referring to the db-architect contract (L20).
- [ ] AC5: Given `roles/`, Then no `set local role` example in any contract lacks the trailing `; reset role`
  (`grep -n "set local role" roles/*.md` shows only the safe form).

L21 and the row-9 burst caveat (roles/security.md):

- [ ] AC6: Given `roles/security.md`, Then the threat-model **Outputs** (or a rule) say: for per-IP auth rate limits
  enforced by the auth provider (baseline row 9), the threat model names two proofs: (1) a static config test that the
  configured limit values equal the required ones (here: `supabase/config.toml` `[auth.rate_limit]`,
  `tests/integration/auth-config.test.ts`), and (2) a person-run production check after the first deploy; a live
  rate-limit test against the local/CI stack is **not** proof, because the local stack doesn't enforce the per-IP
  limits; if such a test exists, the test plan marks it non-proof (L21).
- [ ] AC7: Given the same section, Then it says: provider limiters can be token buckets, where the configured value is
  the refill rate and an idle client can first burst up to the bucket size (Supabase, read 2026-11-25: most auth
  buckets hold up to 30 requests); the threat model states the provider's documented burst size with its source and
  the date it was read (task 3 example: `specs/3/threat-model.md` section 4).
- [ ] AC8: Given the same section, Then it says how the production check is worded: sent from one machine, back to
  back, **more requests than the bucket size plus a margin** (e.g. 35 for a bucket of 30), using only wrong codes
  against a test address; every status code recorded; then a wait just longer than one refill interval and 2 more
  requests, recorded; three outcomes defined in advance: **Pass** (first 429 at or before the baseline's attempt
  limit, every later one 429, never a success), **Burst-bound** (first 429 later than that but within the bucket size;
  release stays blocked until the person records a decision), **Fail** (no 429 within bucket plus margin, or any
  success: stop, tell security); the result is recorded in a `tasks/decisions/` file; only the person runs it (agents
  never test against production); the key is named only by its env/shell variable, never written down.

L25 and L26, Next.js upgrades (roles/devops-cicd.md, roles/security.md):

- [ ] AC9: Given `roles/devops-cicd.md`, Then its **Rules** contain a rule: at every version change of `next` in
  `package.json` (major, minor or patch), in that upgrade's own commit and PR, devops-cicd runs the project's CSP e2e
  tests (here: `tests/e2e/csp.spec.ts`) and the T1 proxy-bypass header suite (here:
  `tests/e2e/abuse/row1-admin-and-proxy-bypass.spec.ts`) against a production build and pastes their result lines
  into the brief's Handoff; and the upgrade doesn't merge until security has re-checked the threat model's CSP section
  and its header/proxy-bypass sections (task 3: sections 6, 3.5, 3.7) (L25, L26). It also notes that a nonce CSP
  needs per-request rendering (`cacheComponents` / partial prerendering off) and that the next Next.js major is
  expected to make those always-on, so that upgrade needs a CSP re-design, not only a re-run (L25).
- [ ] AC10: Given `roles/security.md`, Then **When it runs** gains: at every Next.js version change, before it
  merges: re-check the current threat model's CSP and header/proxy-bypass sections against the new version's release
  notes and docs, and record "still holds" or "changes needed: ..." per section in that task's `security-gate.md`; a
  missing re-check is a FAIL (fail closed, rule 1) (L25, L26).

L11 S20/S21 (roles/git-release.md):

- [ ] AC11: Given `roles/git-release.md`, Then the line "Plus GitHub repository settings: branch protection, labels,
  merge settings." is gone from **Owns**; instead the contract says git-release documents the required repository
  settings (branch protection, merge settings) and proposes changes, and the person sets them (AGENT_RULES 18a);
  **Never touches** lists changing branch protection or repository settings. Creating the label set stays as in
  Outputs today (see Q5); applying `destructive-approved` or `framework-change-approved` stays the person's alone.
  `grep -rn "branch protection" roles/` shows no text saying an agent sets or changes it.

ORCHESTRATOR.md 3a after 4b (the person approves this exact text with the label):

- [ ] AC12 (freshness): Given `ORCHESTRATOR.md` 3a, Then the third bullet says: both gate files must be committed on
  the branch after the PR's last **net code change** (what the branch changes compared with `main`); a clean
  catch-up merge of `main` doesn't make them stale, but a conflict resolution or any other edit inside a merge commit
  that changes code does; `specs/<id>/post-deploy.md` doesn't count as code; `tasks/decisions.md` and
  `tasks/decisions/**` do count as code; a PR that changes only `tasks/**` still needs both gate files committed on
  the branch; if equality can't be shown the gate is stale (fail safe). The sentence "Merge `main` before running the
  gates, not after: until task 4b, a catch-up merge ... (L22)" is replaced by the new rule (merging `main` first stays
  a recommendation only for PRs whose code conflicts with main).
- [ ] AC13 (protected paths): Given 3a, Then the label bullet lists exactly the protected paths of
  `scripts/gate-check.sh` (`PROTECTED_SPEC`): `.github/**`, `scripts/**`, `rules/**`, `roles/**`, `templates/**`,
  `ORCHESTRATOR.md`, `AGENTS.md`, `.gitleaks.toml`, `package.json`, `package-lock.json`, `supabase/config.toml`,
  and says a protected file changed on `main` and brought in by a catch-up merge doesn't count as the PR's change.
- [ ] AC14 (re-label): Given 3a, Then it says: the label must be applied (GitHub server time) strictly after the last
  push that changed the PR's net change on protected paths; commit dates are never used; so **the person re-labels
  after** (a) a force-push, (b) any push that changes a protected file, (c) a catch-up merge where `main` changed a
  protected file that this PR also changes; a push that changes only non-protected files needs no re-label; when the
  label time or the push times can't be read, the gate fails (fail closed).
- [ ] AC15 (stale text): Given 3a, Then the residual-risk sentence no longer lists "`tasks/**`-only changes" (fixed by
  4b, S5) and still names the PR-defined job with the same check name (S14, task 4c). Given `roles/git-release.md`
  rule 3, Then its "(until task 4b, a catch-up merge ... L22)" clause is replaced by a pointer to ORCHESTRATOR 3a
  (see Q3).

Lessons bookkeeping:

- [ ] AC16: Given the branch, Then `tasks/4h/lessons.md` exists in the format of `tasks/4a/lessons.md` with the line
  `Closes: L14, L20, L21, L25, L26` and a sentence that L11 S20/S21 are fixed by this task while L11 stays open (no
  `Closes:` for L11). When `bash scripts/lessons.sh` runs from the repo root, Then it prints no line starting with
  `L14 `, `L20 `, `L21 `, `L25 ` or `L26 `, still prints `L11 `, its last line's open count is 5 lower than on
  `origin/main` at the same time, and it exits 0.

Scope and done gate:

- [ ] AC17 (no other text changed): `git diff --name-only origin/main...HEAD` lists only `roles/db-architect.md`,
  `roles/security.md`, `roles/devops-cicd.md`, `roles/git-release.md`, `ORCHESTRATOR.md` and files under `tasks/4h/`
  and `specs/4h/`; every changed hunk in those five files belongs to one of AC1-AC15 (no reflow, renumbering or
  rewording elsewhere; adding a rule at the end of a numbered list is fine). No file under `scripts/`, `rules/`,
  `tests/`, `.github/`, `templates/`, `app/`, `lib/` or `supabase/` changes.
- [ ] AC18: `bash scripts/verify.sh` on the branch prints `verify.sh: PASS` (summary line pasted in the Handoff);
  `specs/4h/security-gate.md` first line `Result: PASS` and `specs/4h/review.md` first line `Result: APPROVE`, each
  committed after the last code change; required CI checks `verify`, `db-check`, `secrets` green; `merge-gate` green
  after the person adds `framework-change-approved` after the last push that touched `roles/` or `ORCHESTRATOR.md`
  (4b rule, AC14). The PR description quotes the new 3a text in full so the person approves exactly that text.

## Security rows that apply

From `rules/security-baseline.md` (security confirms in Design). Docs only, but the text instructs later agents
on controls, and 3a is the person's guide to the merge-approval control: wrong text there means a wrong label.

- [ ] Row 9: AC6-AC8 don't weaken the baseline's target; they change only what counts as proof. abuse test: none
  (docs); security checks the wording against `specs/3/threat-model.md` 4.1-4.5.
- [ ] Rows 2 and 14: AC1-AC3 (grants, RLS tests). abuse test: none (docs).
- [ ] Rows 1 and 11: AC9-AC10 (proxy bypass, CSP at upgrades). abuse test: none (docs).
- [ ] Merge approval (ORCHESTRATOR 3a, not a numbered row): AC12-AC14 must match `scripts/gate-check.sh` exactly
  (read its header and code); any 3a sentence that would let the person keep a stale label is a FAIL.
- [ ] Row 13: AC8 names keys by variable only; no secret in any file.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
# orchestrator drafts; the person approves via the framework-change-approved label
roles/*.md
ORCHESTRATOR.md
# only if the person answers Q1 with "new templates"; otherwise unused
templates/**
```

`rules/` is not needed: AGENT_RULES 18a already says the right thing (S20/S21 is a contract wording bug), and the
baseline row 9 wording change is a separate decision for the person (`specs/3/threat-model.md` 4.5 proposal), not
part of this task.

**Protected-path note:** every file this PR changes outside `tasks/**` is protected, so the merge gate needs the
person's label, applied after the last push that touches them (4b's rule is live on main). Push the final text,
then label; any later wording fix needs a re-label.

**Out of scope:**

- Any script, workflow or test change: the other 4x PRs (verify.sh 4d, drift 4e, prod auth 4f, worktree DB 4g,
  gate spoofing 4c). In particular no new check that enforces AC1/AC2 or AC9 automatically.
- `rules/security-baseline.md` row 9 wording (the person's decision, threat model 4.5) and `rules/**` in general.
- `roles/db-builder.md` and `roles/qa-test.md` (they follow `schema.md`'s test list and the threat model; see Q7).
- The L21 alternative "find a CLI setting that enables the rate-limit header locally" (needs devops-cicd and the
  person's OK; not requested).
- Other parts of L11 (S14, S19, S26, S27) and other open lessons (L5, L12, L13, L15, L17, L22, L24, L27); 4b's S5,
  S15, S16, L17, L22 bookkeeping is the orchestrator's, not this task's.
- Changing `tasks/lessons.md` (frozen archive) or any existing spec under `specs/`.

## Inputs

- `tasks/lessons.md` L11 (S20/S21), L14, L20, L21, L25, L26; `tasks/incidents/2026-11-25-drift.md`.
- `specs/3/schema.md` sections 4 and 7, `supabase/tests/03_todos_test.sql` (grant and `; reset role` examples).
- `specs/3/threat-model.md` sections 3.5, 3.7, 4 (burst caveat), 6, 9; `specs/2a/schema.md` (old unsafe form);
  `tests/integration/auth-config.test.ts` (S5).
- `scripts/gate-check.sh` header and `PROTECTED_SPEC` (as merged in 4b), `tasks/4b/TASK_BRIEF.md` (AC4-AC22 and the
  F1 fix entry), current `ORCHESTRATOR.md` 3a.
- No `specs/4h/schema.md` (no DB). `specs/4h/threat-model.md` from security: short ("docs only") plus the checks above.

## Destructive change?

- [x] No (contract text only; no data, no production)
- [ ] Yes

## Open questions (each has a default; the build goes ahead on the default unless the person says otherwise)

- Q1 (the person): `templates/` has no `schema.md` or `threat-model.md` template; today the conventions live in the
  role contracts' Outputs. Default: put L20/L21 text into `roles/db-architect.md` and `roles/security.md` (AC3-AC8),
  no new template files. Alternative: create `templates/schema.md` and `templates/threat-model.md` (bigger, overlaps
  4i packaging).
- Q2 (the person): which upgrades trigger AC9/AC10. Default: any version change of `next` (patch included; the
  header-bypass behavior in L26 can change in a patch). `eslint-config-next` alone doesn't trigger it.
- Q3 (the person): `roles/git-release.md` rule 3 still says "until task 4b, a catch-up merge ... makes the gates
  stale (L22)", which is false after 4b and would contradict the new 3a. Default: fix it in this PR (AC15), the only
  text outside the listed lessons; strike AC15's second sentence if you'd rather keep this PR narrower.
- Q4 (the person): the request's re-label trigger "a catch-up merge where main changed a protected file". gate-check
  only sees protected files the PR itself changes (a main change to another protected file isn't part of the PR's net
  change). Default: AC14 (c) uses the precise form "a protected file that this PR also changes".
- Q5 (the person): is creating labels a "repository setting" under 18a? Default: no, git-release may create the label
  set (as its Outputs say today); only applying the two approval labels is the person's.
- Q6 (orchestrator): `service_role` in AC1/AC2. Default: its expected privileges are stated and tested, but it gets
  no explicit grant unless the brief needs one (task 3 practice: it keeps task 1's defaults).
- Q7 (orchestrator): should `roles/db-builder.md` repeat the L14/L20 patterns? Default: no; db-builder already writes
  every test in schema.md's list ("Done when"), and one place for the pattern avoids drift between contracts.

## Handoff notes for others

- **The person:** read the 3a text in the PR description (AC12-AC14) and the answers to Q1-Q5 before labeling; label
  after the last push.
- **Orchestrator (builder here):** keep each edit minimal and in place; cite the lesson id in each new rule; run
  `bash scripts/lessons.sh` before and after and paste both last lines in the Handoff (AC16).
- **security (Design and gate):** compare AC12-AC14's text with `scripts/gate-check.sh` line by line; compare AC6-AC8
  with `specs/3/threat-model.md` 4.1-4.5.

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-26

- **Changed:** `tasks/4h/TASK_BRIEF.md` (new).
- **Verified:** read AGENT_RULES, the five role contracts, ORCHESTRATOR 3/3a/7/8, PLAN row 4h, lessons L11/L14/L20/
  L21/L25/L26, `specs/3/threat-model.md` 3.5/3.7/4/6/9, `specs/3/schema.md` 4/7, `scripts/gate-check.sh` header and
  `PROTECTED_SPEC`, `scripts/lessons.sh` header. `bash scripts/lessons.sh` on the branch before any edit:
  `lessons.sh: 14 open (14 archive, 0 per-task)`.
- **Left to do:** security threat model (`specs/4h/threat-model.md`); the orchestrator drafts the text; verify.sh;
  gates; the person's label.
- **Next role must know:** the words "Allowed paths" appear first in the Scope section on purpose (verify.sh reads
  the first fenced block after them). `templates/**` is allowed only for Q1's alternative.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-26 (inputs)

- Q1-Q7: build with the stated defaults; the person sees them in the PR before adding the label.

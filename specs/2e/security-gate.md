Result: PASS

# Security gate: task 2e (close out task 2a with the person's production `pg_default_acl` check)

- **Role:** security (gate), 2026-11-25, fresh context, judged from the repo only.
- **Branch:** `chore/2e-2a-close-out`, base `origin/main`. Commits reviewed: `33fbfae`, `8076308`, `d11fab2`.
- **Diff (`git diff --name-only origin/main...HEAD`):** `specs/2a/post-deploy.md` (+16/-5), `tasks/2e/TASK_BRIEF.md`
  (new), `tasks/board.md` (+3/-2). Documentation only.
- No production access by this role: no SQL, no Supabase tools, no dashboard. `scripts/verify.sh` not run by this role.

## Limitation: the production rows are relayed, not re-run

The two `pg_default_acl` results in `specs/2a/post-deploy.md:51-59` were run by the person in the dashboard SQL editor
(SELECT only) and relayed to git-release by the orchestrator from the person's screenshots. Security cannot re-run them
(agents may not run SQL on production, `rules/database-and-deploy.md` rule 4, AGENT_RULES 12-13). This gate judges that
the **recorded** rows meet the expected values and security's rule; it does not independently prove production state.
The record names who ran them, when and how (`:51-53`), which is what AC1 asks for.

## Applicable baseline rows

The brief lists row 13 only (`tasks/2e/TASK_BRIEF.md:28-30`). No route, client-trusted value, raw SQL in code,
`dangerouslySetInnerHTML`, env var, dependency, LLM use or upload is in the diff, so no abuse test is required.

| Row | Control | Evidence | Result |
|-----|---------|----------|--------|
| #13 | No `.env` tracked | `git ls-files` matches only `.env.example` | PASS |
| #13 | No secret, key or project-ref value in the diff | Pattern scan of the full diff for JWTs (`eyJ`), `sb_secret_`/`sb_publishable_`, `*.supabase.co`, `postgres://`/`postgresql://`, `password=`/`token=`, `sk_live`/`sk_test`, `ghp_`, `AKIA`, 20-char lowercase project-ref shapes: no hit. Role names (`anon`, `authenticated`, `service_role`) inside ACL text (`specs/2a/post-deploy.md:56`) are not secrets. Project named only as "AutomationTests" (`:12`, pre-existing and public in `PROJECT_CONTEXT.md`) | PASS |

Other identifiers (run IDs, commit SHAs, migration versions, `sha256 e3b0c44298fc` = prefix of the SHA-256 of empty
input) are public and non-sensitive.

## Scope

Allowed: `specs/2a/post-deploy.md` plus `tasks/**` (`tasks/2e/TASK_BRIEF.md:32-38`). Every changed path is in that set.
This gate file (`specs/2e/security-gate.md`) is security's own path. No app code, migration, test, workflow, script,
rulebook or role file changed.

## Recorded production rows vs. expected values and security's rule

Expected values: `specs/2a/schema.md:199-214` (section 7), mirrored in `specs/2a/post-deploy.md:35-49`. Local reference
for `storage`: `specs/2a/threat-model.md:188` (`{postgres=X, anon=X, authenticated=X, service_role=X}`); the storage
exception is the exact schema name `storage` (`specs/2a/threat-model.md:212-217`, pgTAP T6
`supabase/tests/02_function_privileges_test.sql:65-74`).

- **Query 1** (`specs/2a/post-deploy.md:55`): exactly one row, `postgres | f | {postgres=X/postgres}`. Equals
  `schema.md:203`. Meaning: global default for functions created by `postgres` keeps EXECUTE only for the owner; PUBLIC,
  `anon`, `authenticated` have no default EXECUTE (AC8 core claim). PASS.
- **Query 2** (`specs/2a/post-deploy.md:56`): two rows only.
  - `public | {postgres=X/postgres}`: equals `schema.md:209`. PASS.
  - `storage | {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`: same grantees,
    same privilege (`X` only), same order as local `{postgres=X, anon=X, authenticated=X, service_role=X}`. The
    `/postgres` grantor suffix is how PostgreSQL prints the ACL; the threat-model shorthand omits it. Matches local. PASS.
  - No other schema: no row other than `public` and `storage`, so nothing escalates under `schema.md:212-214`. PASS.
- The `storage` row is the accepted exception (threat model Q1 option (a)); it stays safe only while no migration of
  ours creates a function in `storage` (`specs/2a/threat-model.md:218-220`). Unchanged by this task.

## 2a to DONE (ORCHESTRATOR.md section 3, `ORCHESTRATOR.md:60`)

DONE needs `post-deploy.md` showing: migrations in production history, drift check green, feature tested as a real user.

- Migration history: `20261125150215 function_privileges` listed (`specs/2a/post-deploy.md:14-18`, read-only
  `list_migrations`, from task 2d, not re-checked here).
- Drift: two green runs with empty diff (`:22-25`); the record correctly does not rest AC8 on drift alone (`:26-27`).
- Real-user test: no user-facing feature; the behavior is proven by pgTAP in CI (`:67-68`), and the production state is
  proven by the read-only check above. Same reasoning as 2c's DONE in task 2d.
- AC8 now complete (`:65-66`); Result DONE (`:72-73`). Justified. Moving the board is the orchestrator's call
  (AGENT_RULES 22); the board edit in this PR records that decision.

## Instructions to change production by hand

None. The only production action in the diff is the person's past SELECT-only check (`specs/2a/post-deploy.md:51`).
The instruction text at `:31-33` is pre-existing (from task 2d) and asks only for two read-only SELECTs. Nothing tells an
agent or the person to write to production.

## Automated results

- `scripts/verify.sh`: not re-run by this role (instructed not to). git-release recorded
  `verify.sh: PASS 17/17 (1 skipped)` (`tasks/2e/TASK_BRIEF.md:57`).
- Secret scan: manual pattern scan of the diff above: clean. CI `secrets` (gitleaks) runs on the PR.
- `npm audit`: not applicable (no dependency change).
- Supabase security advisors / RLS check: not applicable (no schema change).

## Findings (informational, not blocking)

- **I1, owner: git-release (optional).** `specs/2a/post-deploy.md:29-33` heading says PASS but the paragraph below still
  reads as an open request ("this item is the person's ... run only these two ... and paste the rows"). Harmless, but a
  past-tense note ("the person ran these on 2026-11-25; result below") would avoid it being read as still to do.
- **I2, owner: the person / orchestrator.** Carried over from the 2d gate (I1): the check was run in the dashboard SQL
  editor, while `rules/database-and-deploy.md:24` (rule 4) says "no SQL editor" for changes. A read-only SELECT changes
  nothing and `specs/2a/schema.md:196-197` names the person, so this is within the rules, but recording in
  `tasks/decisions.md` that read-only verification SELECTs by the person are allowed would stop it becoming an unwritten
  precedent.
- **I3, owner: orchestrator.** 2d to DONE (`tasks/board.md:10`) rests on the orchestrator's decision in
  `tasks/2e/TASK_BRIEF.md:58` (docs only, nothing to deploy); ORCHESTRATOR.md section 3 literally asks for a
  `post-deploy.md`, which 2d does not have. Not a security issue; the orchestrator may record the docs-only rule in
  `tasks/decisions.md`.
- **I4, owner: git-release (optional).** `tasks/2e/TASK_BRIEF.md:55` still says "check result table"; since `8076308` it
  is a list. Wording only.

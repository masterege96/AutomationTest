Result: PASS

# Security gate: task 2d (post-deploy records for tasks 2a, 2b and 2c)

- **Role:** security (gate), 2026-11-25, fresh context, judged from the repo and read-only GitHub data only.
- **Branch:** `chore/2d-post-deploy-records`, base `origin/main`. Commits reviewed: `44a96e4`, `de750be`.
- **Diff (`git diff --name-only origin/main...HEAD`):** `specs/2a/post-deploy.md` (new), `specs/2b/post-deploy.md` (new),
  `specs/2c/post-deploy.md` (new), `tasks/2d/TASK_BRIEF.md` (new), `tasks/board.md` (+4/-3). Documentation only.
- No production access by this role: no SQL, no Supabase tools, no dashboard.

## Applicable baseline rows

The brief lists row 13 only (no `.env` tracked; the records must hold no secret or key value). No route, client-trusted
value, raw SQL in code, `dangerouslySetInnerHTML`, env var, dependency, LLM use or upload is in the diff, so no abuse
test is required for this task.

| Row | Control | Evidence | Result |
|-----|---------|----------|--------|
| #13 | No `.env` tracked; no secret in changed files | `git ls-files` matches only `.env.example`. Pattern scan of all five changed files for JWTs (`eyJ...`), `sb_secret_`/`sb_publishable_`, `service_role` assignments, `*.supabase.co` URLs, `postgres://` strings, `password=`/`token=`, 20-char lowercase project-ref shapes, `sk_live`/`sk_test`, `ghp_`, `AKIA`: no hit except the literal role name `service_role` inside an ACL description (`specs/2a/post-deploy.md:48`), which is not a secret | PASS |
| #13 | Project ref not written | Project is named only as "AutomationTests" (already public in `PROJECT_CONTEXT.md`); no ref, URL or key anywhere | PASS |

Other identifiers in the files are public and non-sensitive: migration versions, GitHub run/job IDs, commit SHAs, and
`sha256 e3b0c44298fc`, which is the first 12 hex chars of the SHA-256 of an empty input (as the drift log prints it).

## Scope

Allowed: the three `specs/2{a,b,c}/post-deploy.md` files plus `tasks/**`. Every changed path is in that set. No app code,
migration, test, workflow, script, rulebook or role file changed (AC3 holds).

## Claims of production proof (checked against what exists)

Verified read-only with `gh`:

- PR #9 merged as `69c6151` 15:22 UTC, PR #10 as `9f742a9` 15:32 UTC, PR #11 as `af59b2d` 16:06 UTC: match the records.
- Drift run 45651393581: `workflow_dispatch`, `main`, head `af59b2d`, conclusion success; log prints
  `diff: 0 non-comment lines, sha256 e3b0c44298fc` and `No drift.` Matches all three records.
- Drift run 45647204820: `workflow_dispatch`, `main`, head `9f742a9`, success. Matches `specs/2a/post-deploy.md:22`.
- PR #11 `verify` job 139328558684 (run 45649162423): sections in order `[scope]`, `[migrations]`, `[secrets]`,
  `[code safety]`, `[database]`, `[project]`, ending `verify.sh: PASS 17/17 (1 skipped)`. Matches `specs/2c/post-deploy.md:27-29`.
- Production migration history (`list_migrations`) was not re-checked by this role (no Supabase tools); the records say it
  was read-only, and the drift run on `af59b2d` being empty is consistent with `20261125150215` being applied.

State judgments:

- **2a = VERIFYING** (`specs/2a/post-deploy.md:61`, `tasks/board.md:8`): correct. The two read-only `pg_default_acl`
  SELECTs required by `specs/2a/schema.md` section 7 are left open and assigned to the person, because agents may not run
  SQL on production (`rules/database-and-deploy.md` rule 4, AGENT_RULES 12-13). The record does not claim the drift check
  proves the global default-ACL row (`:25-26`). The queries and expected rows are copied exactly from schema.md section 7,
  and security's escalation rule for unexpected per-schema rows is kept (`:47-48`).
- **2b = VERIFYING** (`specs/2b/post-deploy.md:45`, `tasks/board.md:9`): correct. Dashboard items 1-21 and item 22 / P1
  (production OTP rate limit) are marked open for the person (`:36-38`); the record says headers are not served to real
  users yet (no hosting) and that `config.toml` auth values are local/CI only (`:9-13`). The release block on task 3's
  login until item 22 passes is kept (`:46`). The integration check still `in_progress` is recorded as seen, not as success.
- **2c = DONE** (`specs/2c/post-deploy.md:35`, `tasks/board.md:7`): supported. The task ships no migration and no app code;
  its "real user" is the CI done gate, and the first post-merge CI run (verified above) shows the new section order.

## Instructions to change production by hand

None. The records tell nobody to write to production. The only production actions they describe are the person's:
two `SELECT`-only statements (2a), dashboard auth settings (2b items 1-21, which `rules/database-and-deploy.md` "How, per
hosting type" puts in the Supabase dashboard), and the P1 OTP rate-limit probe defined in `specs/2b/security-gate.md`.
Agents are told they never do these (`specs/2a/post-deploy.md:30-31`, `specs/2b/post-deploy.md:36`).

## Automated results

- `scripts/verify.sh`: not re-run by this role (already run by git-release: `verify.sh: PASS 17/17 (1 skipped)`, recorded in
  the brief Handoff).
- Secret scan: manual pattern scan of the changed files above: clean. CI `secrets` (gitleaks) runs on the PR.
- `npm audit`: not applicable (no dependency change).
- Supabase security advisors / RLS: not applicable (no schema change).

## Findings (informational, not blocking)

- **I1, owner: the person / orchestrator.** `specs/2a/post-deploy.md:31` asks the person to use the dashboard SQL editor.
  `rules/database-and-deploy.md` rule 4 reads "No table editor, no SQL editor" for changes; a read-only `SELECT` changes
  nothing and `specs/2a/schema.md` section 7 already names the person, so this is within the rules. To avoid the wording
  being read as a precedent for other SQL, the person may record in `tasks/decisions.md` that read-only verification
  SELECTs in the SQL editor are allowed for the person.
- **I2, owner: git-release (optional).** `specs/2b/post-deploy.md:37` summarizes P1 but omits two details that live in
  `specs/2b/security-gate.md` (P1): the publishable/anon key goes in a shell variable only (never written down), and "no
  429 by attempt 9 = stop and tell security". The row links the gate, so the person gets both; repeating them would make
  the record self-contained. "Record the ten codes" means the HTTP status codes, which hold no secret.

# Lessons

Every entry ends with a fix to a role contract, a rulebook or a script. A lesson without a fix stays open.

## L1. verify.sh: CR check is a false FAIL on Windows Git Bash (fixed)

- **Seen:** Task 0, 2026-11-25, Git Bash 5.2.37 (MSYS), Windows 11.
- **Exact error:**
  ```
  FAIL  CR line endings in migrations
        supabase/migrations/20261125104017_init.sql
        Fix: git add --renormalize . (with .gitattributes eol=lf)
  ```
  The file has no CR (`od -c` shows only `\n`; a direct `grep -lU $'\r' file` exits 1).
- **Cause:** In Git Bash, `$'\r'` written inside a command substitution `$( ... )` is dropped
  while the substitution is parsed, so the line becomes `grep -lU '' files`, and an empty
  pattern matches every file. Reproduced: `X=$(printf '%s' $'\r' | od -c)` prints no `\r`;
  `X=$(grep -c $'\r' lf-only.txt)` prints the line count.
- **Suggested fix (scripts/verify.sh, owner: the person, since it's a framework file):**
  define `CR=$(printf '\r')` once near the top and use `CRFILES=$(grep -lU "$CR" "$MIG_DIR"/*.sql 2>/dev/null || true)`.
  Same pattern for any future `$'\r'` inside `$( )`. Linux CI is not affected.
- **Not changed here:** verify.sh is copied unmodified; local verify.sh shows this one false FAIL until the fix lands.

## L2. verify.sh: SQL lint passes when the local database isn't running (fixed)

- **Seen:** Task 0, first verify.sh run. `supabase start` had failed (port clash, L3), `db reset` and
  `test db` failed, but `SQL lint (no errors)` was PASS.
- **Cause:** the lint step greps the output for `"level": "error"` / `^error`; a connection error
  doesn't match, so it counts as clean.
- **Suggested fix (scripts/verify.sh):** use the exit code, `$SB db lint --level error --fail-on error`
  (flag exists in CLI 3.2.0), and FAIL when it exits non-zero. ci.yml `db-check` already does this.

## L3. verify.sh hides why `supabase start` failed; local port clash with another project (fixed)

- **Seen:** Task 0. Another local Supabase project (`ramoerp`) was running on the default ports
  54320-54329. verify.sh writes the `supabase start` output to /tmp/verify-db.log, then `db reset`
  overwrites the same log, so the report only said `ResetLocalDbNotRunningError`. The real error:
  `Bind for 0.0.0.0:54322 failed: port is already allocated`.
- **Fixed in scope (devops-cicd):** `supabase/config.toml` ports moved to 55420-55429 so this project
  doesn't clash. The other project was not stopped.
- **Suggested fixes:** (a) verify.sh: if `supabase start` fails, FAIL with its own log tail
  (separate log file). (b) roles/devops-cicd.md Phase 0 outputs: "pick a local port range for
  `supabase/config.toml` that no other local project uses, and record it in PROJECT_CONTEXT.md".

## L4. Next.js 16: `tsc --noEmit` fails before route types are generated (closed)

- **Exact error:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.`
- **Cause:** Next 16 generates `LayoutProps`/`PageProps` globals into `.next/types`; `next-env.d.ts`
  and `.next/` are gitignored, so a clean checkout (CI) has no types until a build.
- **Fix (done, devops-cicd scope):** `"typecheck": "next typegen && tsc --noEmit"`.
  **Framework fix suggested:** templates/PROJECT_CONTEXT.md, Commands table: note this for Next.js 16+.

## L5. `vitest run` fails with no test files (open until the first unit test)

- **Fix (done, devops-cicd scope):** `"test": "vitest run --passWithNoTests"`, because no test exists in Phase 0.
- **Follow-up:** qa-test removes `--passWithNoTests` in the first feature task that adds a unit test,
  so an accidentally empty suite can't pass. Suggested framework fix: roles/qa-test.md "Done when" item.

## L6. Framework gaps found while bootstrapping (fixed)

- `rules/database-and-deploy.md` "Starting a new project" refers to `new-supabase-project.ps1`, which
  isn't in the framework. Fix: remove the reference or add the script.
- No contract owns the one-off Phase 0 paths (app scaffold `app/**`, `public/**`, `AGENTS.md`,
  `tsconfig.json`, `eslint.config.*`, `.npmrc`, the framework copy itself). They were listed by hand in
  `tasks/0/TASK_BRIEF.md`. Fix: add a Phase 0 brief template (`templates/PHASE0_BRIEF.md`) with this
  allowed-path list, and add tooling configs (`tsconfig.json`, `eslint.config.*`, `.npmrc`,
  `vitest.config.*`) to devops-cicd in `roles/README.md`.
- `bootstrap-check.sh` requires `"supabase"` pinned in package.json but has no check that
  `package.json` has the `typecheck`/`lint`/`test`/`build` scripts verify.sh needs. Fix: add that check.
- devops-cicd outputs say drift.yml "opens/updates an issue labeled `drift`", but git-release's label
  list doesn't include `drift`. Created `drift` too. Fix: add `drift` to roles/git-release.md labels.

## L7. Machine setup notes (info)

- Global `core.autocrlf=true` on this machine. Repo-local `core.autocrlf=false` set; `.gitattributes`
  forces LF either way. pnpm and gitleaks are not installed locally (npm is used; verify.sh falls
  back to the pattern scan locally, CI installs gitleaks 8.30.1).
- Supabase CLI 3.4.0 is out; 3.2.0 is pinned (matches the framework docs). Upgrade only deliberately.
- create-next-app 16.4.6 still scaffolds ESLint 9 (npm marks 9.39.5 deprecated). Kept; upgrading is a separate, deliberate change.

## L8. verify.sh: gitleaks step always FAILs in CI, because `-q` isn't a gitleaks flag (fixed)

- **Seen:** first CI run on `main`, run 45598529613, job `verify`, gitleaks 8.30.1.
- **Exact output:**
  ```
  FAIL  gitleaks found secrets
        Run: gitleaks detect --redact  (then STOP and tell the person)
  ```
- **Not a real leak:** the `secrets` job in the same run scanned the same 2 commits and logged
  `no leaks found`. verify.sh runs `gitleaks detect --no-banner --redact -q`; gitleaks 8.30.1 has no
  `-q`/`--quiet` flag (checked `cmd/root.go` and `cmd/detect.go` at tag v8.30.1), so the command exits 1 with
  an unknown-flag error, and verify.sh sends that output to /dev/null and reports it as found secrets.
- **Suggested fix (scripts/verify.sh, owner: the person):** `gitleaks detect --no-banner --redact --log-level error`,
  and tell "leaks found" apart from "gitleaks failed to run" (exit code 1 is leaks only with `--exit-code`;
  show the output tail on failure). Until it lands, the `verify` required check can't pass.

## L9. CI on push to `main` fails verify.sh's scope check (closed)

- **Seen:** same run: `FAIL  scope check (no --brief given) (skipped, but required in CI)`. On a push to
  `main` there is no `<type>/<id>-<name>` branch, so there's no brief.
- **Fix (done, devops-cicd scope, branch `ci/0-phase0-fixes`):** ci.yml runs on `pull_request` only, as
  roles/devops-cicd.md specifies. Suggested framework fix: say in roles/devops-cicd.md that ci.yml must not
  run verify.sh on push.

## L10. One required review vs. a single-account owner (fixed)

- `main` requires 1 approving review, and GitHub doesn't let a PR's author approve it. Everything here is
  pushed from the owner's only account (`masterege96`), so no PR can merge without a second reviewer
  account, or an admin bypass (`enforce_admins` is off; git-release must never use it).
- **Options for the person:** add a second GitHub account/collaborator as reviewer; or set required
  reviews to 0 and rely on required checks plus the code-reviewer role's `review.md`; record the choice in
  `tasks/decisions.md` and in roles/git-release.md.

## Fixes applied (2026-11-25, branch `ci/0-phase0-fixes`, the person approved via the coordinator)

Applied in this repo and in the master framework copy (`C:\Users\tubae\Claude\agent-team-framework`):

- **L1:** verify.sh uses `CR=$(printf '\r')` and `grep -lU "$CR"`.
- **L2 + L3:** verify.sh appends start, db reset, test db and db lint to one log (path printed). A failed
  `supabase start` is its own FAIL ("local database could not start", log tail, Docker/port hint) and the
  other DB steps are skipped. SQL lint is `db lint --level error --fail-on error`, judged by exit code.
- **L6:** roles/devops-cicd.md and roles/README.md give devops-cicd the tooling configs and the Phase 0
  scaffold; roles/git-release.md lists the `drift` label; rules/database-and-deploy.md says no bootstrap
  script exists yet. bootstrap-check.sh checks that the npm scripts typecheck, lint, test, build exist.
- **L8:** verify.sh runs `gitleaks detect --no-banner --redact --log-level error`; exit 0 PASS, exit 1
  "found secrets" with the output tail, any other exit "could not run (exit N)".
- **L10:** the person chose 0 required approvals plus a required `gate` check. `scripts/gate-check.sh`
  passes only when `specs/<id>/security-gate.md` says `Result: PASS` and `specs/<id>/review.md` says
  `Result: APPROVE`, both committed after the last code change. ci.yml has a `gate` job; branch protection
  requires `verify`, `db-check`, `secrets`, `gate`. ORCHESTRATOR.md "Merge approval", roles/security.md,
  roles/code-reviewer.md, roles/git-release.md and roles/devops-cicd.md updated. Recorded in tasks/decisions.md.

## L11. Merge-gate residual risks from the PR #2 security gate (open)

- **Fixed in PR #2 after the first security FAIL (F1):** gate.yml always judges against `origin/main`,
  fails for any other base, and re-runs on `edited` (retargeted base). Also fixed: S17 (gate judges the
  reported `head.sha`, concurrency group), S18 (drift log shows only a line count and hash, not the diff).
- **Open (devops-cicd; the person decides):**
  - S14 (**accepted for the pilot**, see tasks/decisions.md 2026-11-25; fix in plan step 4 with a GitHub App that posts the gate result): a PR can add its own `pull_request` job named `merge-gate`. Suggested: gate-check FAILs when a
    workflow at the PR head defines a job named `merge-gate`/`gate`, or the person accepts the risk (the person accepted it for the pilot, see the entry above).
  - S5: a `tasks/**`-only PR (including `tasks/decisions.md`) passes with stale gate files. Suggested:
    protect `tasks/decisions.md`, and require gate commits in `MB..HEAD` even when there's no code change.
  - S15: protected-path list misses `.gitleaks.toml`, the rest of `.github/**`, `package.json`, lockfile,
    `supabase/config.toml`, `templates/`, `AGENTS.md`.
  - S16: the `framework-change-approved` label isn't tied to a commit (pushes after labeling still pass).
  - S19: bootstrap-check should verify the `production` environment exists with a main-only policy and
    that no repo-level `SUPABASE_*` secrets exist.
  - S20/S21 (the person): roles/git-release.md "Owns ... branch protection, labels, merge settings"
    contradicts AGENT_RULES 18a.
- **Added from security passes 2 and 3 (open):**
  - S14 second variant (**accepted for the pilot** with S14, tasks/decisions.md 2026-11-25): open a PR against a branch whose own `gate.yml` always passes
    (`pull_request_target` runs the base branch's workflow), then retarget to `main` and re-run the old green
    run. A full fix needs a check source workflows can't imitate (GitHub App / org-level required workflow).
    With the Supabase integration on, a spoofed merge is a path to a production write: decide before the first real table.
  - S26: an odd diff count in drift.yml is reported as `drift=yes` (opens a drift issue, stop rule 1) when
    the check itself broke. Fix: non-numeric → exit 1 without `drift=yes`.
  - S27: drift.yml comment about adding a post-deploy trigger "once the deploy path exists" is now due.

## L12. First drift run fails at `supabase link`: SUPABASE_PROJECT_ID isn't a project ref (open, the person)

- **Seen:** drift run 45613825796 on main (workflow_dispatch, 2026-11-25), step "Link the production project".
- **Exact error:** `Cannot resolve branch "***": the linked project ref is invalid (checked SUPABASE_PROJECT_ID, supabase/.temp/linked-project.json, supabase/.temp/project-ref). Relink the parent project first: supabase link --project-ref <parent-ref>`
- **Cause:** Supabase CLI 3.2.0 treats a value that is exactly 20 lowercase letters as a project ref and
  other values can be read as a branch name. The stored `SUPABASE_PROJECT_ID` (masked) isn't a 20-letter ref, so it was
  read as a branch of a not-yet-linked project. Likely the project name, URL or a copy with spaces was stored.
  The CLI also reads `SUPABASE_PROJECT_ID` from the environment itself.
- **Fix (the person):** set the `production` environment secret `SUPABASE_PROJECT_ID` to the project's
  20-character reference ID (Dashboard > Project Settings > General), with no spaces or URL. Then re-run
  `gh workflow run drift.yml --ref main`. Don't paste the value into chat or files.
- **Framework fix suggested (devops-cicd):** drift.yml's secrets step should check the ref format
  (`^[a-z]{20}$`) and fail with this hint, without printing the value.
- **Update after the person fixed the secret:** drift run 45615531058 got past the ref check; see L13.

## L13. Drift token lacks scopes; production migration history is empty (open, the person)

- **Seen:** drift run 45615531058 on main, step "Link the production project".
- **Exact error:** `Unexpected error retrieving remote project status: {"message":"Your account does not have the necessary privileges to access this endpoint. ..."}`
- **Cause:** `SUPABASE_ACCESS_TOKEN` is a scoped token without the scopes the pinned CLI 3.2.0 lists in
  `--help` (PERMISSIONS): `link` requires `project_admin_read` (may need `projects_read`,
  `branching_production_read`, `database_pooling_config_read`); `db diff --remote` may need `projects_read`,
  `database_pooling_config_read`, `branching_production_read` and also lists `database_write`.
- **Tension:** the drift check is meant to be read-only, but the CLI may ask for `database_write`. The person
  decides whether to grant it or to have the diff use only the DB password with a read-only role (follow-up).
- **Production migration history (read-only, via the Supabase connector's list_migrations):** empty. The init
  migration `20261125104017` is not applied, so the Supabase GitHub integration hasn't deployed yet. The
  person checks the integration (production branch `main`, directory `supabase`, "Deploy to production" on).
  Nothing was changed in production.
- **Note (AGENT_RULES 13):** the Supabase connector on this machine also exposes write tools
  (`execute_sql`, `apply_migration`). They were not used and must never be used against production.

## L14. Production default privileges differ from the local image (open, see tasks/incidents/2026-11-25-drift.md)

- The first real drift (12 lines) is production's stricter default privileges in `public` (no
  SELECT/INSERT/UPDATE/DELETE for anon/authenticated/service_role on future tables). Real, not noise:
  local/CI would allow what production denies.
- **Fix to the framework (suggested, db-architect contract):** every migration that creates an object in an
  exposed schema grants exactly the privileges the API needs, and a pgTAP test checks those grants.
- **Process note:** drift run 45624888333's artifact was downloaded and deleted about a minute after upload;
  the opt-in upload path worked as designed (gitleaks clean).

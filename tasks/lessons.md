# Lessons

Every entry ends with a fix to a role contract, a rulebook or a script. A lesson without a fix stays open.

## L1. verify.sh: CR check is a false FAIL on Windows Git Bash (open)

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

## L2. verify.sh: SQL lint passes when the local database isn't running (open)

- **Seen:** Task 0, first verify.sh run. `supabase start` had failed (port clash, L3), `db reset` and
  `test db` failed, but `SQL lint (no errors)` was PASS.
- **Cause:** the lint step greps the output for `"level": "error"` / `^error`; a connection error
  doesn't match, so it counts as clean.
- **Suggested fix (scripts/verify.sh):** use the exit code, `$SB db lint --level error --fail-on error`
  (flag exists in CLI 3.2.0), and FAIL when it exits non-zero. ci.yml `db-check` already does this.

## L3. verify.sh hides why `supabase start` failed; local port clash with another project (open)

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

## L6. Framework gaps found while bootstrapping (open)

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

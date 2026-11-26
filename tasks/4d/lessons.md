# Lessons from task 4d

New lessons for this task go here as `## L4d.<n>. <title> (<status>)` (ORCHESTRATOR.md section 8).

Fixed by this task, in the frozen archive `tasks/lessons.md`: L5 (verify.sh FAILs on `--passWithNoTests` once test
files exist; roles/qa-test.md "Done when"), L15 (destructive scan ignores comments and GRANT/REVOKE statements),
L27 (client-bundle scan after the build, local stack values, secret patterns, FAIL without a bundle). L11 S19 is built
in bootstrap-check; L11 stays open for its other items.

Closes: L5, L15, L27

## L4d.1. Production credentials are repository secrets, and `production` deploys from any branch (open, the person)

- **Seen:** 2026-11-25, devops-cicd, the new S19 lines in `bash scripts/bootstrap-check.sh` (full, read-only `gh api` GET):
  `FAIL  production deploys only from main (deployment branch policy)` (`deployment_branch_policy` is `null`: all
  branches) and `FAIL  no repository-level SUPABASE_* secrets (found: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD,
  SUPABASE_PROJECT_ID)`. The `production` Environment has no secrets of its own.
- **Why it matters:** repository secrets are readable by any workflow run on a branch of this repo, not only by jobs
  with `environment: production` on `main`; PROJECT_CONTEXT.md says they live in the main-only Environment.
- **Fix (the person only, AGENT_RULES 18a):** Settings > Environments > production: Deployment branches "Selected
  branches and tags", one branch rule `main`; add the three secrets as Environment secrets, then delete the repository
  secrets. Rotating `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` afterwards is the person's call. Re-run
  bootstrap-check (full) to confirm.

## L4d.2. A file's mtime doesn't prove the build wrote it (fixed)

- **Seen:** while building AC3/AC4, a test build that copied files with Node's `fs.cpSync` on Windows kept the source
  mtimes, so an mtime-only "written by this build" check reported no bundle on a clean tree.
- **Fix:** verify.sh counts bundle files as this build's when the bundle dirs held no files before the build, or the
  file list changed, or a file is newer than a marker taken before the build.

## L4d.3. Follow-ups from the 4d round-2 gates (open, devops-cicd)

- Fail closed when the destructive-scan awk itself errors (`verify.sh` `|| true` treats an error as "no hits"; same
  pattern as the old grep on main). Suggested: `hits=$(destructive_hits "$m") || hits="0:(destructive scan failed)"`.
- Raw-scan a migration that has nested `/* */` comments or a dollar tag right after an alphanumeric number, because
  the Supabase CLI's statement splitting isn't modelled (security N1, N2).
- `bootstrap-check.sh` close-line check and the vitest-config check: use `grep … < <(…)` instead of a pipe under
  `pipefail` (SIGPIPE on files > ~64 KB).
- Scan `.next/server/app` (prerendered pages) for secrets too; fixture verify runs inside `npm test` overwrite the
  fixed `/tmp/verify-*.log` paths (use `${TMPDIR:-/tmp}` / a per-run dir; ties in with 4g's lock).
- Statements split over lines (`drop\ntable t`) are still not caught (same as main).
- The fresh-build rule (L4d.2) has two narrow edge cases (qa-test, after the PR #19 CI failure): a build that only
  deletes/renames stale files changes the file list without writing a bundle; stale files with a future mtime (clock
  skew, restored caches) or one within the 2 s marker backdating count as fresh. Real Next.js builds write new chunks.
  Suggested hardening: require at least one bundle file newer than the marker, in addition to a changed list.
- PR #19's first CI run failed on Linux only: the stale-bundle fixture was < 2 s older than the backdated marker
  (Windows passed by luck, Git Bash is slow). Fixed in the test (8026081). Lesson: fixtures that depend on mtimes set
  them explicitly.

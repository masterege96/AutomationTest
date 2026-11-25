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

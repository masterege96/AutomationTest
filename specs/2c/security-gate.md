Result: PASS

# Security gate: task 2c (verify.sh runs the database section before the project checks)

- **Role:** security (gate), 2026-11-25, fresh context, judged from the repo only.
- **Branch:** `ci/2c-verify-db-first`, base `origin/main`. Commits reviewed: `a59c96f`, `b1d00d6`, `e2d68fe`.
- **Diff:** `scripts/verify.sh` (+27/-25), `tasks/2c/TASK_BRIEF.md` (new), `tasks/board.md` (+1 row), `tasks/lessons.md` (L18). No app code, migrations, workflows, env vars or dependencies changed.

## Applicable baseline rows

The brief lists none beyond "no check is weakened" (AC2, AC3, AC6). This PR only reorders the done gate, so
the relevant question is whether the controls verify.sh enforces for rows #3 (client/server secret split),
#13 (`.env` in Git / secret scan) and #14 (RLS on every public table) are unchanged. They are:

| Row | Control in verify.sh | Changed by this PR? | Evidence |
|-----|----------------------|---------------------|----------|
| #3 | "no service-role key referenced in client components" (section 3) | No | byte-identical to `origin/main` |
| #3 | "client bundle has no server secrets" (section 3) | No | byte-identical; see finding F1 (pre-existing) |
| #13 | ".env files tracked", gitleaks / fallback pattern scan, CI "gitleaks not installed" FAIL (section 3) | No | byte-identical |
| #14 | "RLS enabled on every public table (static check)" (section 2) | No | byte-identical |
| (destructive SQL) | "no destructive statements in new migrations" + `DESTRUCTIVE_APPROVED` (section 2) | No | byte-identical |

No new route, client-trusted value, raw SQL, `dangerouslySetInnerHTML`, env var, LLM use or upload in the diff,
so no abuse test is required for this task.

## Review of the change

Method: split old (`git show origin/main:scripts/verify.sh`) and new files at the section headings and `diff`ed the parts.

- Lines 1-198 (args, helpers `ok`/`bad`/`skip`, scope, migrations, secrets, code safety): **identical**.
- Old section 5 body (project checks) vs new section 6 body: **identical**.
- Old section 6 body (database) vs new section 5 body: **identical** (same commands and flags:
  `status`, `start`, `db reset`, `test db`, `db lint --level error --fail-on error`).
- Summary/exit (`TOTAL=` to end): **identical**.
- Only other changes: the two headings renumbered and a 2-line comment. No CR characters in the file.
  `git diff --color-moved=zebra` shows the project block as moved.

Security conclusions:

1. **No check removed, weakened or renamed.** All security checks (scope, migrations incl. RLS and destructive SQL,
   secrets incl. service-role and bundle scan, code safety) still run first, in the same order, with identical code.
   The move is only between the two last sections, neither of which feeds a security check.
2. **"Skipped but required in CI" still holds for the DB section.** The `skip ... required` calls and the `skip()`
   helper are unchanged. Re-run here: `CI=true bash scripts/verify.sh --brief tasks/2c/TASK_BRIEF.md --no-db` gives
   `FAIL  database build from scratch (--no-db) (skipped, but required in CI)`, exit 1. (The other FAIL in that run,
   `secret scan (gitleaks not installed in CI)`, is because gitleaks isn't installed on this machine; CI installs it.)
3. **No new untrusted code execution.** The DB section runs the same `supabase`/`npx --no-install supabase` commands as
   before (`--no-install`: no download). The project section still runs only the repo's own `package.json` scripts,
   as before. Running the DB first does not make the project scripts run anything they didn't before; tests now just
   find a running, freshly reset **local** stack.
4. **No secret-bearing output added.** Nothing new is echoed. The DB section prints only the log path; DB output goes to
   `$DB_LOG` and only its last 20 lines are printed on a failure, as before. The local stack's keys are the Supabase CLI's
   local defaults, not project secrets, and that behavior is unchanged. The bundle check compares env var values with
   `grep -qF` and prints only the variable **names**, unchanged. The CI `verify` job (`.github/workflows/ci.yml`) is
   untouched and passes no new env.
5. **Stack left running** after verify.sh: same as before (no `supabase stop` existed or was added). It is the local Docker
   stack only; no exposure change.

## Automated results

- `bash scripts/verify.sh --brief tasks/2c/TASK_BRIEF.md` (run once, under the shared `.verify-lock`):
  `verify.sh: PASS 18/18 (1 skipped)`, exit 0. Section order: `[scope]`, `[migrations]`, `[secrets]`, `[code safety]`,
  `[database]`, `[project]`. Skip: `test:e2e (no script)`.
- Secret scan: gitleaks not installed locally, so the fallback pattern scan ran on changed files: PASS. CI runs gitleaks
  (pinned, checksum verified) on the PR.
- `npm audit --audit-level=high`: found 0 vulnerabilities.
- RLS check from verify.sh: PASS (static check). No migrations in this diff.
- Supabase security advisors: not run (no schema change, and this role doesn't use cloud tools for this task).

## Findings (not blocking this PR)

- **F1 (pre-existing, row #3), owner: devops-cicd.** "client bundle has no server secrets" runs in section 3, before the
  build in the project section, and only when `.next/static` (or `dist`/`build`) already exists. In CI (fresh checkout) and on
  a clean tree the check does not run at all and prints nothing (not even a SKIP), so the summary count changes (17 vs 18)
  and the built bundle of **this** run is never scanned. This is identical on `origin/main` (secrets section 3 was already
  before project section 5); this PR neither causes nor worsens it. Recommended follow-up task: run the bundle scan after the
  build (or re-run it after `build`), and emit `skip "client bundle scan (no build output)" required` when no bundle exists so
  CI fails closed. That touches `scripts/verify.sh` (framework path, needs `framework-change-approved`).
- **F2 (informational), owner: devops-cicd.** When the stack has to be started, `supabase start` output (local default URL and
  keys) goes into `$DB_LOG` (`/tmp/verify-db.log`), and its tail is printed on a start failure. Pre-existing and local-only
  defaults; noted so that a future change that passes real keys into the CI `verify` job (L18 follow-up) does not echo them.
  That task should use GitHub secrets/masked values and must not print the env.

## Protected path

`scripts/**` is a framework path (ORCHESTRATOR.md 3a). This gate does not replace the person's `framework-change-approved`
label, which only the person adds.

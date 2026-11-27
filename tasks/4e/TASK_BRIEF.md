# Task 4e: drift check with a read-only DB role (L13, S26, S27, L12)

| Field | Value |
|-------|-------|
| State | SPEC_READY |
| Owner role | devops-cicd (build: `.github/workflows/drift.yml`, `scripts/ci/drift-*`, `supabase/production/drift-role.sql`, `roles/devops-cicd.md` Outputs item 5); qa-test (tests: `tests/integration/**`) |
| Branch | `ci/4e-drift-readonly` |
| Worktree | `../wt-4e-devops-cicd` |
| Depends on | 4c-stopgap (merged, `34fcc34`); base `origin/main` at `34fcc34` |

## Request

Orchestrator, step 4 plan row 4e (`tasks/4/PLAN.md`), with the person's decision
`tasks/decisions/2026-11-25-4-step4-choices.md` item 2: "the drift check uses a read-only database role, not an
access token with the `database_write` scope". Rework `.github/workflows/drift.yml`:

1. **L13:** the diff connects as a dedicated read-only Postgres role (`drift_reader`) through a connection URL, instead
   of `supabase link` with `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` / `SUPABASE_PROJECT_ID`. The role is created
   by a SQL file the **person** runs once in the production Dashboard SQL editor; agents never run it against production.
2. **Connection:** one new `production`-environment secret `SUPABASE_DRIFT_DB_URL` (Supavisor session pooler URL).
3. **S26** (`tasks/lessons.md` L11): a diff the check can't read (missing output, empty or non-numeric count, CLI
   failure) is "drift check broken": exit 1, no drift issue.
4. **S27** (L11): drift also runs after each deploy, not only nightly.
5. **L12:** format check of the URL and project ref without printing them.
6. Least privilege of the role and the secret written down in the workflow and the devops-cicd role contract.
7. Everything else drift.yml does today stays.

Sources: `tasks/lessons.md` L11 (S26, S27), L12, L13; `tasks/incidents/2026-11-25-drift.md`; decisions
`2026-11-25-4-step4-choices.md`, `2026-11-25-4d-supabase-secrets-accepted-until-step4.md`,
`2026-11-26-4h-full-suite-on-ci-only.md`.

## Goal

The drift check reads production's `public` schema as a login role that can't write anything and can't read table
data, using one secret that only the `production` environment holds. It runs nightly, after every deploy to `main` and
on demand; it opens a drift issue only for real drift, and fails loudly as "drift check broken" when it couldn't judge.

## Definitions (used by every AC)

- **drift.yml**: `.github/workflows/drift.yml` on this branch. **Role file**: `supabase/production/drift-role.sql`.
- **Executable SQL**: the role file with `--` line comments and `/* */` block comments removed.
- **The URL secret**: `SUPABASE_DRIFT_DB_URL`, a Postgres URL of the form
  `postgresql://drift_reader.<ref>:<password>@<pooler-host>:5432/postgres`, where `<ref>` is exactly 20 lowercase
  letters (`^[a-z]{20}$`, L12) and `<pooler-host>` matches `^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$`.
  Scheme `postgres://` is accepted too. A query string, if present, may contain only `sslmode=<value>`.
- **Old secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.
- **Supabase deploy check**: the check run named `Supabase Preview` posted by the GitHub App with slug `supabase`
  (app id 330661). Read-only `gh api` on 2026-11-27: it is posted on every `main` commit (suite `head_branch: main`,
  e.g. `34fcc34`) and also on PR head commits (e.g. PR #21 head `2b64fcd`). The post-deploy records
  (`specs/2a`, `specs/3/post-deploy.md`) treat its success on a `main` commit as "deployed".
- **Judge**: the logic that turns the CLI's exit status and `diff.sql` into "no drift", "drift" or "broken". **URL
  check**: the logic of AC11-AC14. Both must be runnable by tests without GitHub, Docker or network (a script under
  `scripts/ci/drift-*` or an equivalent devops-cicd chooses); devops-cicd writes the call interface in a
  "contract for qa-test" Handoff entry before the build, as in 4d.
- **GITHUB_OUTPUT**: the file the judge writes `drift=...` / `diff_ok=...` to (tests point it at a temp file).

## Acceptance criteria

Static ACs are checked by Vitest text tests on drift.yml and the role file (no YAML library: none is a direct
dependency; read the text, as `tests/integration/gate-spoof.test.ts` does). Behaviour ACs run the judge / URL check
with fixture inputs. Live ACs (AC31-AC33) are run by the person after merge.

### A. Read-only role file (L13)

- [ ] **AC1 (location, not a migration):** Given the branch, When `git diff --name-status origin/main` is listed, Then the
  role file is added at `supabase/production/drift-role.sql`, and no file under `supabase/migrations/`,
  `supabase/tests/` or `supabase/seed.sql` is added or changed. The file's header comment says: the person runs it once
  in the production Dashboard SQL editor; agents never run it against production (AGENT_RULES 12); why it is not a
  migration (see Inputs, "Why not a migration").
- [ ] **AC2 (role attributes):** Given the executable SQL, Then it creates role `drift_reader` with `LOGIN` and
  explicitly `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, a `CONNECTION LIMIT` of at most
  3, and sets `default_transaction_read_only = on` and a `statement_timeout` for the role (`ALTER ROLE drift_reader SET ...`).
- [ ] **AC3 (no object grants in diffed schemas):** Given the executable SQL, Then it contains no `GRANT` on any schema,
  table, view, sequence, function, procedure, type or `ALL ... IN SCHEMA`, no `ALTER DEFAULT PRIVILEGES`, and no grant of
  any role to `drift_reader` (no `GRANT <role> TO drift_reader`, in particular never `pg_read_all_data`,
  `pg_write_all_data`, `postgres`, `service_role`, `authenticated`, `anon`). At most `GRANT CONNECT ON DATABASE postgres TO drift_reader`
  is allowed. Reason: the diff of `public` includes ACLs and default privileges (incident 2026-11-25: 12 `ALTER DEFAULT
  PRIVILEGES` lines), so any grant on a `public` object to `drift_reader` would itself show up as drift. If AC28 shows
  the diff needs more, devops-cicd sets `BLOCKED` (the person decides); it never adds a grant silently.
- [ ] **AC4 (no password in the file):** Given the role file, Then no executable statement contains `PASSWORD`, and no
  line (comments included) contains a password-looking value, a project ref (20 lowercase letters in a row next to
  `.`, `@` or `:`), a pooler host, or a URL with credentials. Setting the password is a separate step described in a
  comment, following the chosen flow (Q2); a placeholder is written only as `<typed in the SQL editor, never saved>`.
- [ ] **AC5 (rerun-safe):** Given the executable SQL is run twice on a database (local stack, by devops-cicd), Then the
  second run succeeds without error and leaves the same role attributes and settings (role creation guarded by a
  `pg_roles` existence check, settings re-applied).
- [ ] **AC6 (rollback section):** Given the role file, Then it ends with a rollback section in which every line is a
  `--` comment (so running the whole file never drops anything), containing, in order: end the role's sessions
  (`pg_terminate_backend` for `usename = 'drift_reader'`), revoke whatever AC3 allowed (e.g. `REVOKE CONNECT ...`),
  `DROP ROLE IF EXISTS drift_reader;`, and a note that the person also deletes `SUPABASE_DRIFT_DB_URL` from the
  `production` environment.

### B. Connection and secrets (L13)

- [ ] **AC7 (one secret, the right steps):** Given drift.yml, Then the only `secrets.` expression it contains is
  `secrets.SUPABASE_DRIFT_DB_URL`, used only in step-level `env:` of (a) the "require the secret" step (as
  `secrets.SUPABASE_DRIFT_DB_URL != ''`), (b) the URL-check step and (c) the diff step. No workflow-level or job-level
  `env:` contains a secret; `npm ci`, gitleaks, upload and issue steps get no secret.
- [ ] **AC8 (old path removed):** Given drift.yml, Then it contains none of `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `supabase link`, `--project-ref`, nor `--remote` without `=`
  (the CLI 3.2.0 flag is `--remote[=<ref|branch|url>]`; a value needs `=`). The diff command is
  `npx --no-install supabase db diff --remote="$<env name>" --schema "$DRIFT_SCHEMAS"` (no `--db-url`: that flag doesn't
  exist in CLI 3.2.0, see Inputs).
- [ ] **AC9 (missing secret):** Given `SUPABASE_DRIFT_DB_URL` is empty or unset, When the run reaches the require step,
  Then it fails with exactly `::error::Drift check not configured. Missing GitHub Secret: SUPABASE_DRIFT_DB_URL (production environment)`
  and no later step that reaches production runs.
- [ ] **AC10 (step-4 security condition):** Given every file under `.github/workflows/` on this branch, Then no file other
  than drift.yml contains `secrets.SUPABASE_` (decision `2026-11-25-4d-supabase-secrets-accepted-until-step4.md`
  condition 1). This holds for the old and the new secret names.

### C. URL and ref format check, nothing printed (L12)

All URL-check output goes to the log; the value or any part of it is never printed.

- [ ] **AC11 (valid URL):** Given a URL matching the Definitions (fixtures with a random 20-letter ref, a random
  password of 32 letters and digits, hosts `aws-0-eu-west-1.pooler.supabase.com` and `aws-1-eu-west-1.pooler.supabase.com`,
  with and without `?sslmode=require`), When the URL check runs, Then it exits 0 and prints
  `URL check: session pooler URL for drift_reader (format OK)`.
- [ ] **AC12 (each wrong part):** Given a URL that is wrong in exactly one part, When the URL check runs, Then it exits 1
  and prints `::error::drift check broken: SUPABASE_DRIFT_DB_URL <part> is not in the expected format (<hint>)`, one test
  each, where `<part>` / `<hint>` is:
  scheme (`mysql://`, `https://`) / `postgresql://`;
  user `postgres.<ref>`, `drift_reader` without ref, `DRIFT_READER.<ref>` / `drift_reader.<project ref>`;
  ref of 19 or 21 letters, with a digit, upper case, or a space / `20 lowercase letters (Project Settings > General > Reference ID)`;
  missing password / `password required`;
  host `db.<ref>.supabase.co` (direct, IPv6-only), `<ref>.supabase.co`, `localhost` / `session pooler host aws-<n>-<region>.pooler.supabase.com (GitHub runners have no IPv6)`;
  port `6543` (transaction pooler), missing port, `5433` / `port 5432 (session mode)`;
  database `template1` or missing / `database postgres`;
  query `?options=x` / `only sslmode=...`;
  leading or trailing whitespace or a newline / `no spaces or line breaks`.
- [ ] **AC13 (nothing leaks):** Given AC11's and every AC12 fixture, When the combined stdout+stderr of the URL check is
  searched, Then neither the full URL, the password, the ref, the host nor the user string appears (only the fixed
  `<part>`/`<hint>` texts above).
- [ ] **AC14 (masking before the CLI):** Given drift.yml, Then before the first step that runs the Supabase CLI with the URL,
  the run registers `::add-mask::` for the password, the ref and the host separately (the whole-secret mask doesn't
  cover a part the CLI might print in an error), and no step uses `set -x` or echoes the URL variable.

### D. Broken check vs. drift (S26)

- [ ] **AC15 (clean):** Given the CLI exits 0 and `diff.sql` holds only blank lines and `--` comments (or is empty), When
  the judge runs, Then it prints `diff: 0 non-comment lines, sha256 <12 hex>` and `No drift.`, writes `diff_ok=true` and
  `drift=no` to GITHUB_OUTPUT, exits 0.
- [ ] **AC16 (real drift):** Given the CLI exits 0 and `diff.sql` holds at least one other line, Then it prints
  `diff: <n> non-comment lines, sha256 <12 hex>` and `::error::Drift: production differs from supabase/migrations`, writes
  `diff_ok=true` and `drift=yes`, exits 1. The diff content is never printed (S18).
- [ ] **AC17 (CLI failed):** Given the CLI exits non-zero (with or without a partial `diff.sql`), Then it prints
  `::error::drift check broken: supabase db diff exited <code>` followed by at most the last 20 lines of the CLI's
  stderr, writes neither `diff_ok=true` nor `drift=yes`, exits 1.
- [ ] **AC18 (output unreadable):** Given the CLI exits 0 but (a) `diff.sql` doesn't exist, (b) is a directory, or (c) the
  line count is empty or not matching `^[0-9]+$` (simulate by making the count step fail, e.g. an unreadable file), Then it
  prints `::error::drift check broken: diff output could not be read (<reason>)`, writes neither `diff_ok=true` nor
  `drift=yes`, exits 1. Today's "anything but an exact 0 is drift" is gone: only a numeric count `>0` is drift.
- [ ] **AC19 (issue only on real drift):** Given drift.yml, Then the "open or update the drift issue" step runs only when
  `steps.<judge>.outputs.drift == 'yes'` (as today with `failure() &&`); given AC17/AC18, no issue is opened or
  commented (the judge never writes `drift=yes` there). The issue body still links to the run and never contains the
  diff; its reproduction hint no longer mentions a command that needs the old secrets.

### E. After each deploy (S27) and main only

- [ ] **AC20 (triggers):** Given drift.yml, Then its triggers are exactly `schedule` (cron `17 3 * * *`, unchanged),
  `workflow_dispatch` (input `upload_diff` unchanged) and `check_run` with `types: [completed]`. No `push`,
  `pull_request`, `pull_request_target`, `workflow_run`, `repository_dispatch` or `merge_group`. The "add a workflow_run
  trigger" comment is gone. Reason in Inputs, "Trigger choice".
- [ ] **AC21 (which check_run runs):** Given a `check_run` event, Then the drift job runs only if all hold:
  `check_run.app.slug == 'supabase'`, `check_run.name == 'Supabase Preview'`, `check_run.check_suite.head_branch == 'main'`;
  otherwise the job is skipped (it never enters the `production` environment). Any conclusion counts (a failed deploy
  can leave production behind `main`, which is drift).
- [ ] **AC22 (only main's current commit):** Given a matching `check_run` whose `head_sha` is not the commit the run
  checked out (main's head when the run starts; a fork branch named `main`, or an older main commit after a newer
  merge), Then the run makes no connection to production and ends green with the notice
  `::notice::drift skipped: the deploy check is for <sha 12>, not main's head <sha 12>; the run for main's head or the nightly run covers it`.
  `head_sha` is only compared (passed via `env:`), never used as a checkout `ref:` or executed.
- [ ] **AC23 (never PR code):** Given drift.yml, Then the checkout step has no `ref:` (it checks out `github.sha`, which for
  `schedule`, `workflow_dispatch` on main and `check_run` is main's head), keeps `persist-credentials: false`, and the job
  runs only when `github.ref == 'refs/heads/main'` (a dispatch on another ref is skipped). The job keeps
  `environment: production`.
- [ ] **AC24 (kept):** Given drift.yml, Then unchanged from `main`: workflow-level `permissions:` exactly `contents: read`
  and `issues: write` (no job-level permissions, no `checks`/`statuses` write); `concurrency: {group: drift,
  cancel-in-progress: false}`; `runs-on: ubuntu-24.04`, `timeout-minutes: 30`, `DRIFT_SCHEMAS: public`,
  `GITLEAKS_VERSION: 8.30.1`; every `uses:` pinned to a 40-hex SHA with a version comment (same four actions and SHAs as
  `main`); the opt-in upload (S28 gitleaks, S29 only a complete diff, `workflow_dispatch` + `upload_diff` only,
  1-day retention) behaves as today.
- [ ] **AC25 (merge-gate spoof rules):** Given drift.yml, Then it contains no text `merge-gate`, no job id or `name:`
  equal to `gate`/`merge-gate`, and keeps workflow-level `permissions:` (4c rules S14-A, B1-B3).
  `tests/integration/gate-spoof.test.ts` AC1 (main's unchanged workflows -> PASS, using this worktree's drift.yml) still passes.

### F. Least privilege written down

- [ ] **AC26 (workflow comment):** Given drift.yml, Then a comment block near the top states: the role `drift_reader`
  and where it comes from (`supabase/production/drift-role.sql`, run once by the person); its attributes (AC2) and that
  it has no grants on objects in the diffed schemas and no table data access; the one secret `SUPABASE_DRIFT_DB_URL`,
  stored only as a `production`-environment secret, session pooler form; that no Supabase access token is used; the
  three triggers and the main-only rule; "broken" vs "drift" (S26).
- [ ] **AC27 (role contract):** Given `roles/devops-cicd.md`, Then only Outputs item 5 changes: it describes the read-only
  role, the single environment secret, the triggers (nightly, after the Supabase deploy check on main's head, manual),
  and the broken-check rule, and no longer says "link". Nothing else in the file changes. This is the person's file:
  the `framework-change-approved` label approves the exact text (AGENT_RULES 18a).

### G. Proof and no regression

- [ ] **AC28 (local equivalence proof, devops-cicd, local stack only):** Given the local stack with all migrations, the
  role file run against the **local** database, and a throwaway local test password for `drift_reader`, When
  `npx --no-install supabase db diff --remote="<local URL as drift_reader>" --schema public` and the same command with the
  local `postgres` URL are run, Then both outputs are identical (empty) on the clean local DB; and after a deliberate
  **local-only** change (one new table with RLS and a grant, one changed policy, one `ALTER DEFAULT PRIVILEGES` in
  `public`), both outputs are again identical and non-empty; then the local DB is reset. Also: running a write
  (`create table public.x(id int)`) as `drift_reader` fails, and `select` on `public.todos` as `drift_reader` fails with
  permission denied. Commands and results (line counts and sha256 prefixes, never content of anything but the local
  probe objects) go in the build Handoff. Runs only when no other test job uses the shared local stack (decision
  2026-11-26). Never against production.
- [ ] **AC29 (bootstrap-check unaffected):** Given this branch, When `bash scripts/bootstrap-check.sh --offline` runs,
  Then the `[ci/cd]` line `  PASS  scheduled drift check` is still printed (drift.yml still contains `schedule` and
  `db diff`), and `scripts/bootstrap-check.sh` is unchanged (see Inputs, "bootstrap-check S19").
- [ ] **AC30 (CI):** The PR's required checks `verify`, `db-check`, `secrets`, `merge-gate` are green on the final head;
  gitleaks finds nothing in the role file or fixtures (fixture URLs and passwords are generated at test run time).

### H. Live checks after merge (the person; recorded by git-release in `specs/4e/post-deploy.md`)

- [ ] **AC31 (first manual run green):** After the person's steps 1-3 below, When `gh workflow run drift.yml --ref main`
  runs, Then the run succeeds, its log shows `URL check: session pooler URL for drift_reader (format OK)`,
  `diff: 0 non-comment lines, sha256 e3b0c44298fc` and `No drift.`, no drift issue is opened, and the log contains no
  `SUPABASE_ACCESS_TOKEN` and no unmasked part of the URL.
- [ ] **AC32 (after-deploy run fires):** On the next merge to `main` after AC31, a drift run with event `check_run` starts
  after that commit's `Supabase Preview` check completes, and is green (or skipped per AC22 if another merge followed).
  A `Supabase Preview` completion on a PR commit shows only a skipped drift run.
- [ ] **AC33 (nightly):** The next scheduled run (03:17 UTC) is green.

## Security rows that apply

From `rules/security-baseline.md`; security confirms in Design.

- [ ] Row 13 (secrets): AC4, AC7-AC9, AC13, AC14, AC30. abuse test: AC12/AC13 (no URL part printed on any wrong input).
- [ ] Row 14 (query your database / least privilege): AC2, AC3, AC28 (the role can't write or read `public` data).
  abuse test: AC28's write and `select` attempts.
- [ ] Production-access control (AGENT_RULES 12-13, not a numbered row): AC1, AC20-AC23 (PR code never runs with the
  secret; only the person runs the role file).
- Security, please also check in Design: (a) what `drift_reader` can still do through privileges granted to `PUBLIC`
  in production (e.g. `SECURITY DEFINER` functions executable by `PUBLIC` in Supabase-managed schemas;
  `default_transaction_read_only` is a default the client can override, not a boundary); (b) Q2, the password flow and
  whether Postgres statement logging in production could record an `ALTER ROLE ... PASSWORD` in plain text (the person
  can check with a read-only `show log_statement;`, decision item 3); (c) Q3, the secret in an environment without a
  main-only branch policy; (d) the step-4 condition AC10.
- **Merge-gate note:** this PR changes `.github/**`, `scripts/**` (if the judge/URL check live there) and `roles/**`
  (protected paths). It needs the person's `framework-change-approved` label, applied after the last push that changed
  a protected file (4b rule; agents never add it, AGENT_RULES 18a). `supabase/production/**` is not a protected path.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
# devops-cicd (build)
.github/workflows/drift.yml
scripts/ci/drift-*                  # judge / URL check, if devops-cicd puts the logic in scripts
supabase/production/drift-role.sql  # new; run by the person only (not in the ownership map yet, see Q4)
roles/devops-cicd.md                # AC27 only (Outputs item 5); the person's text, approved via the label
# qa-test (tests and fixtures)
tests/integration/**
```

Ownership within the task: devops-cicd builds drift.yml, the role file, `scripts/ci/drift-*` and the AC27 text;
qa-test writes `tests/integration/**`.

**Tests the PC runs** (decision 2026-11-26: only the touched tests, one test job at a time; the full suite runs on
GitHub CI): the new drift test file qa-test adds (suggested `tests/integration/drift-workflow.test.ts`) and
`tests/integration/gate-spoof.test.ts` (it reads this worktree's drift.yml). Run as
`npx vitest run tests/integration/drift-workflow.test.ts tests/integration/gate-spoof.test.ts`. AC28 is a separate
local-stack job, never at the same time as another test job.

**Out of scope:**

- Running the role file, setting a password or creating/deleting any secret: the person only (steps below).
- Moving or deleting the old secrets, adding a main-only branch policy to `production`, or recording the decision that
  closes `2026-11-25-4d-supabase-secrets-accepted-until-step4.md`: the person's later step (at the latest before 4i;
  see "After merge"). Not this PR.
- `scripts/bootstrap-check.sh`: no change (Inputs, "bootstrap-check S19"). An extra check that the environment secret
  exists is not added here (Q5).
- `rules/database-and-deploy.md` "How, per hosting type" rows "Database credentials in CI" and "Drift check"
  (Supabase-hosted column still names the token/password and `--remote` without a URL): the person's file; handoff note.
- `PROJECT_CONTEXT.md` environment-variable table (lists the old secrets as "CI only (drift check)"): git-release,
  after merge, with the person's OK; handoff note.
- `roles/README.md` ownership map entry for `supabase/production/**`: the person's file (Q4).
- `ci.yml`, `gate.yml`, `scripts/gate-check.sh`, `scripts/verify.sh`, migrations, 4f's `supabase/production/auth.json`.
- A runtime privilege self-check inside the run (connecting with `psql` to assert `current_user` and privileges):
  `psql` is not a listed tool (AGENT_RULES 8); Q6.
- Any production write, a deliberate drift in production, or a diff run by an agent against production.

## Inputs

- `.github/workflows/drift.yml`, `.github/workflows/ci.yml`, `.github/workflows/gate.yml`, `scripts/bootstrap-check.sh`,
  `roles/devops-cicd.md` on `origin/main` `34fcc34`; `PROJECT_CONTEXT.md` (deploy path: Supabase GitHub integration;
  drift schemas: `public`); `rules/database-and-deploy.md` rules 4 and 7 (its self-hosted column already uses
  `supabase db diff --remote="$DATABASE_URL"`).
- **CLI 3.2.0 `supabase db diff --help`** (run 2026-11-27 with the pinned CLI, no DB touched): there is **no
  `--db-url` flag**. Targets: `--remote[=<ref|branch|url>]` ("the linked project, or --remote=<ref|branch|url>"), or
  `--from`/`--to` with "a Postgres URL". "Compares a shadow built from supabase/migrations with a live database" (the
  shadow runs in Docker on the runner, as today). PERMISSIONS (scoped access token) lists `database_write`,
  `database_pooling_config_read`, `projects_read`, `branching_*_read` as "may be required" with `--remote`; with a URL
  target no token should be needed. **Assumption A1** (confirmed by AC31): the diff step runs with no
  `SUPABASE_ACCESS_TOKEN` in its environment.
- **Assumption A2 (network):** GitHub-hosted runners have no IPv6; Supabase's direct host `db.<ref>.supabase.co` is
  IPv6-only, so the URL is the Supavisor **session** pooler (port 5432, user `drift_reader.<ref>`), Dashboard > Connect >
  Session pooler, with the user and password replaced. Supavisor accepting a custom role is confirmed by AC31.
- **Assumption A3 (deploy timing):** the `Supabase Preview` check on a `main` commit completes after the integration
  has applied that commit's migrations (post-deploy records 2a, 3: check success, then migrations in history). If AC32
  shows a false red right after a migration, devops-cicd adds a wait in a follow-up.
- **Why not a migration:** (1) the deploy path would apply it to production automatically, and every local reset, CI
  `db-check` and preview branch would create a login role; (2) a migration can't hold the password (AGENT_RULES 14), so
  a manual step remains anyway; (3) roles are cluster-level and not part of the `public` diff, so a migration gains no
  drift coverage, while any grant on a `public` object it made would be drift-checked and differ from the local image;
  (4) rule 3: once merged it could never be edited, only superseded. Running it by hand is a production change outside
  migrations, see Q1.
- **Does the role show up as drift?** Role attributes, role settings, `CONNECT` on the database and role memberships
  are outside schema `public`; ACLs on `public` objects and default privileges in `public` are inside it (incident
  2026-11-25). Hence AC3. AC28 proves it on the local stack; AC31 in production.
- **Trigger choice (S27):** the deploy path is the Supabase GitHub App, not a workflow, so `workflow_run` can't be used.
  `check_run: completed` fires for check runs created by other GitHub Apps (GitHub doesn't trigger it for runs created by
  GitHub Actions itself); the workflow always runs from the default branch's file and `github.sha` is main's head, so
  PR code never runs. Chosen over `push` + polling the check (needs `checks: read`, a wait loop and a timeout). Limitations:
  (a) every `Supabase Preview` completion on a PR commit creates a skipped drift run in the Actions list; (b) if the
  integration posts no check (disconnected, renamed check), no after-deploy run happens and only the nightly run
  catches drift; (c) the `check_run` trigger only exists once this drift.yml is on `main`.
- **bootstrap-check S19:** its checks read only names: the environment's branch policy and repository-level secret
  names starting `SUPABASE_`, with the three old names accepted as risk while the 4d decision is open. A repository-level
  `SUPABASE_DRIFT_DB_URL` (stored in the wrong place) is not in the accepted list and FAILs, which is the wanted
  behaviour. Deleting the old secrets makes that line PASS. The "scheduled drift check" line greps `schedule` and
  `db diff`, both kept. So no change is needed; it never prints values.
- **Old secrets after 4e:** drift.yml no longer reads them, and no other workflow does (ci.yml, gate.yml read no
  `SUPABASE_*` secret), and the Supabase GitHub integration doesn't use GitHub secrets. So nothing in the repo needs them:
  the person can **delete** them (instead of moving them) and revoke the access token in Supabase, after AC31-AC33.
  Until then they stay as a rollback path (revert this PR).
- Example tests: `tests/integration/gate-spoof.test.ts` (reads workflow text), `tests/integration/verify-fixes.test.ts`
  (runs a bash script with stubs and temp dirs).
- No `specs/4e/schema.md` (no migration). `specs/4e/threat-model.md` from security (role privileges, Q2, Q3).

## Destructive change?

- [x] No (workflow, a person-run role file and tests; no data or schema change; the commented rollback drops only the
  role this task adds, run by the person if ever)
- [ ] Yes

## Open questions

Q1 must be answered by the person before step 1 of "After merge"; the build can start with the defaults.

- **Q1 (the person, rule 4):** `rules/database-and-deploy.md` rule 4 says nobody changes production by hand (SQL editor
  included). Creating `drift_reader` in the SQL editor is such a change, outside `public` and not drift-checked. Does
  decision item 2 cover it as a one-off, or does the person want a decision file recording it as an allowed exception?
  **Default:** orchestrator records a decision file (the person's words) before the person runs the file.
- **Q2 (the person + security, password flow):** the Dashboard SQL editor has no hidden-input prompt and `psql` isn't
  installed on this PC. **Default:** the person generates a 32+ character password of letters and digits only (no
  URL-encoding needed) in the password manager, runs `alter role drift_reader with password '...'` as a separate,
  unsaved SQL editor query, and puts the same password into `SUPABASE_DRIFT_DB_URL`. Alternative: `psql`'s `\password`
  (hashes on the client, the plain text never reaches the server or its logs), if the person installs `psql`. Security
  decides after checking `log_statement` (Security rows, b).
- **Q3 (the person):** the `production` environment has no deployment branch policy yet (accepted risk, decision 4d),
  so a workflow pushed on any branch that declares `environment: production` could read `SUPABASE_DRIFT_DB_URL`. AC23
  stops main's drift.yml from running elsewhere, but not a modified copy on a branch. **Default:** the person sets the
  main-only branch policy (Settings > Environments > production > Deployment branches: selected, `main`) when adding the
  new secret, since nothing else needs `production` from other branches. Impact if not: a catalog-only read role leaks.
- **Q4 (the person):** owner of `supabase/production/**` in `roles/README.md` (also needed by 4f's `auth.json`).
  **Default:** devops-cicd for this task via the Allowed paths above; the map entry in a later framework PR.
- **Q5:** should bootstrap-check also verify that the environment secret `SUPABASE_DRIFT_DB_URL` exists (names only)?
  **Default:** no (AC9 already fails the run with a clear message).
- **Q6:** a runtime self-check that the connected role is `drift_reader`, not superuser, and can't select from `public`
  tables. **Default:** no (needs `psql`, a new tool); AC12's user check plus AC28 cover it.

## Handoff notes for others

- **The person:** label after the last protected-path push. Answer Q1 (and Q2/Q3 if not the defaults) before the steps
  below. Never paste the URL, password or ref into chat or files.
- **Orchestrator:** after AC31-AC33 are green, add `Closes: L12, L13` to `tasks/4e/lessons.md` and mark S26/S27 fixed in a
  4e lesson (L11 stays open for its other items); ask the person to delete the old secrets and record the decision that
  closes `2026-11-25-4d-supabase-secrets-accepted-until-step4.md` (before 4i).
- **git-release:** after merge, `PROJECT_CONTEXT.md` env table: replace the three drift rows with
  `SUPABASE_DRIFT_DB_URL | CI only (drift check) | GitHub Environment production secret (main only)` (the person's OK);
  write `specs/4e/post-deploy.md` with the run ids of AC31-AC33.
- **The person (rules):** `rules/database-and-deploy.md` "How, per hosting type", Supabase-hosted column: drift check
  becomes `supabase db diff --remote="$SUPABASE_DRIFT_DB_URL" --schema <schemas>` with a read-only role; later framework PR.
- **devops-cicd:** if AC28 shows `drift_reader` sees less than `postgres` (e.g. objects filtered by privilege), stop and
  set `BLOCKED` with the exact difference (object types only); don't add grants (AC3). The judge must keep today's
  "judge on content, not exit code" rule for the drift/no-drift decision.
- **qa-test:** generate fixture refs/passwords at run time (gitleaks scans history); AC13 searches every output for
  each generated part.

### After merge, the person's steps (plain words)

1. **Create the role.** Open Supabase Dashboard > project AutomationTests > SQL Editor. Paste the part of
   `supabase/production/drift-role.sql` above the rollback section and run it. It should finish with no error.
2. **Set its password.** Make a new password in your password manager (32+ letters and digits). In a new SQL editor
   query, run the password line described in the file with your password, then close that query without saving it
   (or follow the Q2 alternative).
3. **Store the secret.** Dashboard > Connect > Session pooler: copy the URL, replace the user with
   `drift_reader.<your project ref>` and the password with the new one. GitHub > Settings > Environments > production >
   Environment secrets > add `SUPABASE_DRIFT_DB_URL` with that URL. Not a repository secret. (Q3: also set the
   deployment branch policy to `main` only.)
4. **Run it.** `gh workflow run drift.yml --ref main`, then open the run (`gh run list --workflow drift.yml`).
   **Green looks like:** the run succeeds; the log shows `URL check: session pooler URL for drift_reader (format OK)`,
   `diff: 0 non-comment lines, sha256 e3b0c44298fc` and `No drift.`; no new issue labeled `drift`.
5. **If it fails:** "drift check broken ... <part>" means the URL is in the wrong format (fix the secret, re-run);
   "supabase db diff exited ..." means it couldn't connect or read (tell the orchestrator; don't change production);
   "Drift: production differs" on this first run may mean the role can't see something, not real drift: tell the
   orchestrator before anything else. Undo: the rollback section of the file, and delete the secret.
6. **Later (after a green nightly run and one green after-deploy run):** delete the old repository secrets
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` and revoke the access token in your Supabase
   account; the orchestrator records the closing decision (at the latest before 4i).

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-27

- **Changed:** `tasks/4e/TASK_BRIEF.md` (new), `tasks/4e/lessons.md` (new, heading only).
- **Verified:** read drift.yml, ci.yml, gate.yml, `scripts/bootstrap-check.sh`, `roles/devops-cicd.md`, `roles/README.md`,
  `rules/database-and-deploy.md`, `PROJECT_CONTEXT.md`, L11-L13, the drift incident, the 4c/4d briefs and the three
  decisions, on `34fcc34`. Ran the pinned CLI 3.2.0 `supabase db diff --help` (no DB contact). Read-only `gh api`:
  check runs on `34fcc34` (main, `Supabase Preview` by app `supabase`, suite `head_branch: main`) and on PR #21's head
  (`Supabase Preview` also posted on PR commits). No test suite or verify.sh run.
- **Left to do:** security Design (threat model: Security rows a-d); devops-cicd contract for qa-test, then build
  (AC1-AC29); qa-test tests; gates; the person's steps and AC31-AC33 after merge.
- **Next role must know:** the CLI has no `--db-url`; use `--remote=<url>`. Q1 needs the person before the SQL is run.
  The only tests to run on the PC are listed under Scope.

### devops-cicd, 2026-11-27 (contract for qa-test)

Result lines are exactly the brief's texts. Call interface and precisions qa-test can rely on:

- **URL check:** `DRIFT_DB_URL=<url> bash scripts/ci/drift-url-check.sh` (the workflow maps the secret to the env var
  `DRIFT_DB_URL`, not a `SUPABASE_*` name, so the CLI can't read it as config). All output on stdout. Exit 0 + AC11 line;
  exit 1 + AC12 line; exit 2 on a bad argument. `<part>` words: `value` (empty, leading/trailing whitespace, CR or LF
  anywhere; hint `no spaces or line breaks`, empty: `set the session pooler URL`), `scheme`, `user`, `ref`, `password`,
  `host`, `port`, `database`, `query`. Checked in that order; a space inside the ref gives `ref`. "Missing password" =
  `drift_reader.<ref>@host` or `drift_reader.<ref>:@host`. "Missing port" = `...pooler.supabase.com/postgres`.
  "Database missing" = no `/` after the port, or `/` with an empty name.
- **Masks (AC14):** `--add-masks` runs the same check and, only after it passes, also prints `::add-mask::<password>`,
  `::add-mask::<ref>`, `::add-mask::<host>` (one line each, after the OK line). AC13 applies to the call without
  `--add-masks`; with it, the three mask lines are the only lines holding parts. drift.yml calls it with
  `--add-masks` in the URL-check step, before the diff step.
- **Judge:** `GITHUB_OUTPUT=<file> bash scripts/ci/drift-judge.sh <cli exit code> <diff.sql path> <cli stderr path>`.
  Appends `diff_ok=true` then `drift=no|yes` (one per line) only on AC15/AC16. Exit 0 = no drift, 1 = drift or broken,
  2 = wrong argument count. AC17 code text is the given code (`unknown` if not a number); stderr tail via `tail -n 20`,
  nothing printed if the stderr file is missing. AC18 reasons: `diff file missing`, `diff path is a directory`,
  `diff path is not a regular file`, `diff file not readable`, `line count failed` (grep exit >1), `line count is not a
  number`, `sha256 failed`. Unset `GITHUB_OUTPUT` -> `::error::drift check broken: GITHUB_OUTPUT is not set`, exit 1.
  Calls `grep`, `sha256sum`, `cut`, `tail` from `PATH`: for AC18(c), put a stub `grep` first on `PATH` that exits 2 or
  prints `abc` (chmod-unreadable files don't work on Windows). Runs with `LC_ALL=C`.
- **drift.yml shape:** step ids `head` (check_run head_sha guard, `skip=true` output), `diff` (CLI + judge in one
  step; so `steps.diff.outputs.drift` / `diff_ok`, upload and issue conditions as on main). `concurrency: {group: drift,
  cancel-in-progress: false}` is on the `drift` job, not at workflow level (orchestrator decision 2026-11-27, L4e.1;
  replaces AC24 for that point): test for it under `jobs.drift`, and for no top-level `concurrency:`. Secret env names in steps:
  `HAS_DRIFT_DB_URL` (require), `DRIFT_DB_URL` (URL check, diff). Diff command:
  `npx --no-install supabase db diff --remote="$DRIFT_DB_URL" --schema "$DRIFT_SCHEMAS"`.
- **Role file:** lowercase SQL (repo style, as the migrations): match keywords case-insensitively. No `/* */`
  comments, no `--` inside strings. The only grant is `grant connect on database postgres to drift_reader`;
  `statement_timeout = '120s'`.

### devops-cicd, 2026-11-27 (build)

- **Summary:** drift.yml reworked to `drift_reader` via `SUPABASE_DRIFT_DB_URL` (`--remote=`), `check_run` trigger,
  main-head guard, URL check + masks, broken-vs-drift judge; role file `supabase/production/drift-role.sql`; scripts
  `scripts/ci/drift-url-check.sh`, `scripts/ci/drift-judge.sh`; `roles/devops-cicd.md` Outputs item 5 only. Static
  checks only (js-yaml parse, `bash -n`, text greps for AC3/AC4/AC7/AC8/AC10/AC20/AC25); no tests, no verify.sh, no local
  stack. **Left:** qa-test tests; AC28 (local-stack proof, scheduled separately: also proves AC5 and that
  `grant connect on database postgres` works as `postgres`); verify.sh summary line. See `tasks/4e/lessons.md` L4e.1.

- orchestrator decision 2026-11-27: concurrency moved to job level, L4e.1

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

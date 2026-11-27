Result: PASS

# Security gate: task 4e (drift check with the read-only role `drift_reader`)

- **Role:** security (gate), 2026-11-27. Fresh context, judged from the repo and the brief only.
- **Branch:** `ci/4e-drift-readonly`, HEAD `ea73293`, draft PR #23. Diff `git diff origin/main...HEAD`:
  `.github/workflows/drift.yml`, `scripts/ci/drift-judge.sh` (new), `scripts/ci/drift-url-check.sh` (new),
  `supabase/production/drift-role.sql` (new), `roles/devops-cicd.md` (Outputs item 5 only),
  `tests/integration/drift-workflow.test.ts` (new), `tasks/4e/**`, `tasks/4c/live-checks.md` (`tasks/**`, text only).
  No app code, no migration, no new env var reaching the client, no new dependency.
- **CI on `ea73293`** (`gh pr checks 23`, run `45986003737`, event `pull_request`, headSha `ea73293...`): `verify`,
  `db-check`, `secrets` pass. `merge-gate` (run `45986003015`) fails only on `specs/4e/security-gate.md missing` and
  `specs/4e/review.md missing`.
- **Run here:** `npm audit --audit-level=high` (read-only) and one
  `npx --no-install vitest run tests/integration/drift-workflow.test.ts`: `Test Files 1 passed (1)`,
  `Tests 127 passed (127)`. Nothing else (no verify.sh, no stack, no production).
- **No `specs/4e/threat-model.md` exists** (no security Design output for 4e, as for 4b-4d). This gate therefore
  also answers the brief's Design items (a)-(d) below. Process note for the orchestrator, not a FAIL: the brief's
  abuse tests were assigned in the brief itself and exist.
- **Protected paths:** `.github/**`, `scripts/**`, `roles/**` changed: the person's `framework-change-approved`
  label after the last protected push is still needed (not present on the PR now; agents never add it).

## Applicable rows

| Row | Control (file:line) | Abuse test | Result |
|-----|---------------------|------------|--------|
| #13 secrets | One secret only, `secrets.SUPABASE_DRIFT_DB_URL`, only in step `env:` of require (`drift.yml:88`, as `!= ''`), URL check (`:110`), diff (`:117`); no workflow/job-level secret env (`:61-63` holds only `DRIFT_SCHEMAS`, `GITLEAKS_VERSION`). Mapped to `DRIFT_DB_URL` (not a `SUPABASE_*` name). Old secrets/`supabase link` gone. URL check prints only fixed texts (`drift-url-check.sh:23-26`, `:108`); masks password, ref, host after a passing check and before the CLI (`:110-115`, called with `--add-masks` at `drift.yml:111`, diff at `:123`). No `set -x`, URL never echoed. | `AC12/AC13: %s -> exit 1, the fixed <part>/<hint> line only, no part printed`, `AC11/AC13: valid URL ...`, `abuse (AC13): %s -> no URL part printed ...`, `abuse: shell metacharacters in the URL are never executed`, `AC14: --add-masks prints ...`, `AC14: the URL check with --add-masks runs before the diff step; no set -x; ...`, `AC7`, `AC8` | PASS (127/127) |
| #13 `.env`/history | gitleaks in CI job `secrets`: `gitleaks detect --source . --redact`, 8.30.1 checksum OK, `251 commits scanned`, `no leaks found`. Fixture URLs/passwords are generated at run time. Added lines contain no 20-letter ref, no real pooler host (tests use generic `aws-0/1-eu-west-1`), no credential URL (grep of `+` lines of the diff). | `AC4: no PASSWORD in executable SQL; no password value, ref, pooler host or credential URL on any line` | PASS |
| #14 least privilege | `drift-role.sql:30-44` creates `drift_reader` `login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 3`; `:47-49` re-applies attributes, `default_transaction_read_only = on`, `statement_timeout = '120s'`; `:52` the only grant `grant connect on database postgres`; `:55-81` final check raises on any wrong attribute or any membership. No `alter default privileges`, no object grant, no role grant. | `AC2`, `AC3`, `AC5 (static part)`, `AC6`; AC28 local abuse (brief Handoff, devops-cicd AC28): `create table public.x` -> read-only error, and with `default_transaction_read_only = off` -> `permission denied for schema public`; insert/update/select on `public.todos` -> `permission denied for table todos`. AC28 also shows `drift_reader` and `postgres` give identical diffs (clean 0 / `e3b0c44298fc`, probe 15 / `143a34b3afd2`), so no grant is needed. | PASS |
| Production access (AGENT_RULES 12-13) | Role file is not a migration (`supabase/production/`, header `:3-13`), run only by the person. Workflow: see "PR code and secrets" below. | `AC1`, `AC20`-`AC23`, `abuse (AC22): a crafted head_sha can't inject ...` | PASS |
| #1-#12 | Not touched: no route, UI, payment, upload, AI, auth or schema change. | - | N/A for this diff |

## Step-4 condition (decision `2026-11-25-4d-supabase-secrets-accepted-until-step4.md`, condition 1)

Every file under `.github/workflows` at `ea73293` (`git ls-tree`): `ci.yml`, `drift.yml`, `gate.yml`.

- `drift.yml`: `secrets.SUPABASE_DRIFT_DB_URL` at `:88`, `:110`, `:117` only. Allowed (it is drift.yml).
- `ci.yml`: no `secrets.` expression. `ci.yml:61` names `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  read from the local stack's `supabase status`, not a secret. Unchanged by this PR.
- `gate.yml`: no `secrets.` expression, no `SUPABASE_`. Unchanged by this PR.
- Test `AC10: no workflow other than drift.yml contains secrets.SUPABASE_` passes. **Condition 1 holds.**

## PR code and secrets (drift.yml)

- **Triggers** (`:21-33`): `schedule`, `workflow_dispatch`, `check_run: [completed]` only; no `pull_request*`,
  `push`, `workflow_run`. For `schedule` and `check_run` GitHub always runs the default branch's file with
  `github.sha` = main's head, so a PR can't change what runs. (`check_run` is not raised for check runs created by
  Actions, so no workflow can fake the deploy check via `GITHUB_TOKEN`.)
- **Job `if`** (`:45-50`): `github.ref == 'refs/heads/main'` and, for `check_run`, `app.slug == 'supabase'`,
  `name == 'Supabase Preview'`, `check_suite.head_branch == 'main'`. Payload values are only compared. A PR commit's
  check, or another app's check with the same name, skips the job before it enters `production`.
- **head_sha guard** (`:71-83`): `head_sha` and `github.sha` reach the shell only via `env:` (`:75-76`), compared as
  strings; the notice prints them only after `tr -cd '0-9a-f' | cut -c1-12`, so a crafted value can't inject a
  workflow command or a newline. Writes only the fixed `skip=true`. Every later production step has
  `if: steps.head.outputs.skip != 'true'` (`:86`, `:96`, `:102`, `:108`, `:115`). Covers a fork branch named `main`
  and an older main commit.
- **Checkout** (`:66-68`): no `ref:`, `persist-credentials: false`. `head_sha` is never a ref.
- **`environment: production`** (`:53`) kept; `concurrency` on the job (`:56-58`, L4e.1) so skipped runs never join.
- **Permissions** (`:35-37`): `contents: read`, `issues: write`, no job-level block. All four `uses:` pinned to 40-hex
  SHAs (test `AC24: every uses: pinned ...`).
- **No `${{ }}` of untrusted values in `run:`**: all six `${{ }}` in the file are in `env:` (`:75`, `:76`, `:88`,
  `:110`, `:117`) or `if:`; the github-script body uses only `context.*` JS template strings (`:168-169`). Test
  `AC23: ... no ${{ }} in run:`.
- **GITHUB_OUTPUT injection:** only fixed strings are written: `skip=true` (`:82`), `diff_ok=true` / `drift=yes|no`
  (`drift-judge.sh:77-83`), `clean=true` (`drift.yml:147`). The count is validated `^[0-9]+$` and never written.
  Tests `abuse: output-looking lines in diff.sql or stderr never reach GITHUB_OUTPUT`,
  `abuse: a CLI exit code with an injected newline is 'unknown', never written to GITHUB_OUTPUT`.
- **Masking before the CLI:** URL-check step (`:107-111`) precedes the diff step (`:113-127`); the mask lines are
  printed only after the whole format check passed (`drift-url-check.sh:108-115`).
- **S18, nothing of the diff printed:** the diff goes to `diff.sql`; the judge prints only count and 12-hex hash
  (`drift-judge.sh:75`). On a CLI failure it prints the last 20 lines of the CLI's stderr (`drift-judge.sh:44-46`,
  AC17 by design): that can name schema objects in an error, never table data (the role can't read any), and URL
  parts are masked. Accepted. The issue body (`drift.yml:169`) links the run, never the diff.
- **S28/S29 upload** (`:132-159`): only `workflow_dispatch` + `inputs.upload_diff` + `steps.diff.outputs.diff_ok ==
  'true'` (written only for a complete, readable diff) + gitleaks `clean=true` (`--redact`, output to `/dev/null`,
  exit 99 -> not uploaded, other codes -> not uploaded); `retention-days: 1`. Test `AC24: the opt-in upload keeps
  S28/S29 ...`.

## S26 broken vs drift, L4e.2

- CLI exit != 0 -> `drift check broken: supabase db diff exited <code>`, nothing written (`drift-judge.sh:38-48`);
  missing / directory / non-regular / unreadable file, failed or non-numeric count, failed hash -> `diff output could
  not be read (<reason>)`, nothing written (`:50-53`, `:67-73`). Only a validated count > 0 writes `drift=yes`
  (`:78-82`); the issue step runs only on `drift == 'yes'` (`drift.yml:163`). Test
  `S26: across every broken case, drift=yes and diff_ok=true are never written` and AC15-AC19 tests pass.
- **L4e.2:** the diff step unsets `AI_AGENT`/`CLAUDECODE` and passes `--agent no --output-format text`
  (`drift.yml:123`); the judge treats a first non-blank line starting with `{` or `[` as broken
  (`drift-judge.sh:57-64`), checked before the count, so JSON output can never be drift or "no drift". Fail closed.
  Tests in `L4e.2: JSON instead of SQL ...` pass.
- Residual (accepted): a CLI that exits 0 with an empty `diff.sql` while it silently saw nothing would read as
  "no drift"; AC28 shows `drift_reader` sees exactly what `postgres` sees, and a role that saw less would produce
  CREATE lines (drift), not an empty diff. AC31 confirms in production.

## URL check accepting `@` in the password (qa-test observation)

`drift-url-check.sh:56-58` splits user info from host at the **last** `@`, so `drift_reader.<ref>:ab@cd@host` passes
(test `abuse (AC13): extra @ inside the password` only asserts no leak). **Decision: acceptable.** Reasons: Go's
`net/url` (used by the CLI's Postgres driver) also splits at the last `@`, so the CLI connects to the same host the
check validated; the whole password is masked as one value and the whole secret by GitHub; the host is still forced
to `aws-<n>-<region>.pooler.supabase.com:5432`. The person's procedure already requires letters and digits only.
**Recommendation (non-blocking, devops-cicd, later task):** reject any password character outside `[A-Za-z0-9]`
(also covers `%` escapes and inner spaces, which are accepted today), so the check matches the procedure exactly.

## Least privilege of `drift_reader` (brief Design items a, d)

- No password, ref or host in the file: `:22-28` give only the placeholder `<typed in the SQL editor, never saved>`
  and `drift_reader.<project ref>`; test AC4 passes.
- No object grants, no `alter default privileges`, no membership; only `connect` on `postgres` (`:52`). Rollback
  section `:83-88` is all comments: terminate sessions, revoke connect, `drop role if exists`, delete the secret.
- **(a) What is left through `PUBLIC`:** `default_transaction_read_only` (`:48`) and `statement_timeout` (`:49`) are
  client-overridable defaults, not boundaries; the boundary is the absence of privileges (AC28 shows write and read
  of `public` fail even with read-only switched off). In `public`, migrations revoke function EXECUTE from `PUBLIC`
  (`20261125150215_function_privileges.sql:7`, `20261125165117_create_todos.sql:29`), so no `public` function is
  callable. Remaining by Postgres/Supabase defaults: reading the system catalog (needed; the schema is in the public
  repo anyway), `TEMP` on the database (session-local temp tables, bounded by the connection limit of 3 and the
  timeout), and EXECUTE on functions that Supabase-managed schemas grant to `PUBLIC`. Those are already designed to be
  callable by any role, and reaching them needs the secret. Residual: low, accepted.
- **(d)** Step-4 condition: holds (section above).

## Q2: password via the Dashboard SQL editor (brief Design item b)

**Risk:** `alter role drift_reader with password '...'` sends the plain text to the server. It is written in plain
text to the Postgres log if `log_statement` is `ddl`, `mod` or `all` (ALTER ROLE is DDL), and **always** if the
statement fails (`log_min_error_statement` defaults to `error`, which logs the failing statement's text). It may also
be kept by `pg_stat_statements` (utility statements are tracked) and by the Dashboard's query history if the snippet is
saved. Whoever can read production logs could then read the password. Impact if read: a catalog-only, connection
limit 3, read-only-by-default login (no table data), still a credential that must not leak.

**Decision:** the SQL-editor flow is acceptable **only** with these steps; the orchestrator must put them into the
person's step 2 (or the Q1 decision file) before the person runs it:

1. Before setting the password, run the read-only `show log_statement;` and record the value (only the value) in the
   Q1 decision file.
2. If it is `none`: set the password in the SQL editor as written in `drift-role.sql:23-25`, as its own query, never
   saved, letters and digits only, 32+ characters.
3. If it is `ddl`, `mod` or `all`: use `psql`'s `\password drift_reader` (client-side hashing) if the person installs
   `psql`, or the person accepts in the decision file that the password may sit in the production log for the log
   retention period.
4. If the password query errors for any reason, treat that password as logged: generate a new one and run it again.
5. Never paste the password, URL or ref into chat, files or the brief (AGENT_RULES 14).

## Q3: secret in an environment without a branch policy (brief Design item c)

`drift.yml:51-52` and `roles/devops-cicd.md` item 5 say the `production` environment is "restricted to main". That is
**not true today** (decision 4d: no deployment-branch policy), so a modified workflow pushed on any branch that
declares `environment: production` could read `SUPABASE_DRIFT_DB_URL`. Impact is smaller than the already accepted
repository secrets (an access token with `database_write`), and nothing but main's drift.yml needs `production`.
**Condition:** the person's step 3 must make the main-only branch policy **mandatory, not optional** (set it before
or together with adding `SUPABASE_DRIFT_DB_URL`). Then the comment and role contract text are true.

## 4c spoof rules

- `drift.yml`: no `merge-gate` text, no job id or `name:` `gate`/`merge-gate` (only job `drift`, `:40-41`), keeps
  workflow-level `permissions:`. Test `AC25: no merge-gate text, no gate/merge-gate job id or name` passes.
- Other workflows at HEAD: `merge-gate` appears only in `gate.yml` (the trusted gate itself, job `:19`) and in a
  comment at `ci.yml:3`; both files are unchanged from `origin/main`, so the 4c spoof check judges them as on main.

## Automated results

- **Secret scan:** CI job `secrets` on `ea73293`: gitleaks 8.30.1, `251 commits scanned`, `no leaks found`.
- **`npm audit --audit-level=high`:** `found 0 vulnerabilities` (exit 0). No dependency change in the diff.
- **Supabase security advisors:** not applicable. Agents have no production access (AGENT_RULES 12-13), and this PR
  changes no schema; the role is created after merge by the person.
- **RLS check:** `verify` green on `ea73293`; no migration changed.

## Manual review checklist (roles/security.md)

New routes: none. Client-trusted values: only GitHub event payload values, compared or sanitized (above). Raw SQL
from strings: none (the role file is static SQL). `dangerouslySetInnerHTML`: none. New env vars reaching the client:
none (`DRIFT_DB_URL`, `HAS_DRIFT_DB_URL` exist only in CI step env). LLM output: none. Uploads: only the S28/S29
artifact, unchanged rules.

## Findings

| # | Severity | Where | Finding | Owner | Blocks merge |
|---|----------|-------|---------|-------|--------------|
| G1 | Medium | brief "After merge" step 2; `supabase/production/drift-role.sql:22-28` | Q2: SQL-editor password may be logged; steps must include the `log_statement` check and the rules in "Q2" above. | orchestrator (person's steps / Q1 decision) | No; blocks the person's step 2 until added |
| G2 | Medium | `.github/workflows/drift.yml:51-52`, `roles/devops-cicd.md:53` (item 5) | Says `production` is restricted to main; not true until Q3 is done. | the person (branch policy, mandatory in step 3) | No; blocks adding the secret until the policy is set |
| G3 | Low | `scripts/ci/drift-url-check.sh:56-58`, `:66`, `:78` | `@`, `%` and inner spaces accepted in the password. Acceptable (see above); tighten to `[A-Za-z0-9]` later. | devops-cicd (later task) | No |
| G4 | Low | `scripts/ci/drift-judge.sh:44-46` | CLI stderr tail can name schema objects (no data, URL parts masked). Accepted by AC17. | - | No |
| G5 | Info | `specs/4e/` | No threat model for 4e; this gate records the Design answers (a)-(d). | orchestrator (process) | No |

# Task 4d: verify.sh and bootstrap-check fixes (L27, L15, L5, S19)

| Field | Value |
|-------|-------|
| State | SPEC_READY |
| Owner role | devops-cicd (build: `scripts/verify.sh`, `scripts/bootstrap-check.sh`, `roles/qa-test.md`); qa-test (tests: `tests/integration/**`, fixture dirs) |
| Branch | `ci/4d-verify-fixes` |
| Worktree | `../wt-4d-devops-cicd` |
| Depends on | none (base `origin/main` at `5c3aa7e`). Runs alongside 4a (removes `tasks/board.md`), 4b (gate-check), 4e (drift). |

## Request

Orchestrator, 2026-11-25, step 4 plan approved by the person (plan row 4d "verify.sh"). Fix:

- **L27:** verify.sh's client-bundle secret scan runs after `npm run build` (today it runs before, so on a clean tree there's no bundle and it silently skips), reads the local secret values itself from `npx supabase status -o env` when the local stack is running (never printed, never written), also scans for secret-looking patterns (`sb_secret_`, service-role JWT role claim) independent of the local values, and FAILs when the build produced no client bundle to scan.
- **L15:** the destructive-statement scan in migrations ignores SQL comments and privilege lists in GRANT/REVOKE (e.g. `REVOKE TRUNCATE ON ...`), matching `truncate` only as a statement; real `DROP`/`TRUNCATE TABLE`/`DELETE FROM`/`ALTER ... DROP`/`RENAME` still FAIL without approval.
- **L5:** roles/qa-test.md "Done when" says no `--passWithNoTests` once tests exist (person's text; label approves it), and verify.sh FAILs if `package.json`'s test script contains `--passWithNoTests` while test files exist.
- **S19:** bootstrap-check (full, not `--offline`) verifies via read-only `gh api` that the GitHub Environment `production` exists with a deployment branch policy limited to `main`, and that no repository-level secret named `SUPABASE_*` exists (names only, never values).

Sources: `tasks/lessons.md` L5, L11 (S19), L15, L27.

## Goal

The done gate can no longer pass by accident: the client bundle is always built and scanned for server secrets, a
GRANT/REVOKE or comment no longer forces a `destructive-approved` override, and an empty test suite can't pass once
tests exist. The Phase 0 gate proves that production credentials live only in the main-only `production` Environment.

## Acceptance criteria

Conventions for every AC:

- "verify.sh" means `bash scripts/verify.sh` run in a git repository; "bootstrap-check" means `bash scripts/bootstrap-check.sh`.
- Result lines are quoted exactly as printed (two leading spaces, `PASS`/`FAIL`/`SKIP`, two spaces, name). A FAIL may print
  indented detail lines below it, as today.
- Summary lines keep today's format: `verify.sh: PASS <p>/<t> (<s> skipped)` exit 0, or
  `verify.sh: FAIL <f>/<t> failed: <names> (<s> skipped)` exit 1; `bootstrap-check: PASS <p>/<t> (<s> skipped)` exit 0, or
  `bootstrap-check: FAIL <f> of <t> checks failed (<s> skipped). Phase 0 is not complete: ...` exit 1.
  "verify.sh FAILs" below means the named FAIL line is printed, its name appears in the summary's failed list, and the exit code is 1.
- "Fixture repo" means a temporary git repo the test builds from fixture files (see Inputs, Test fixtures), with a
  stub `package.json` whose `typecheck`/`lint`/`test`/`build` scripts are deterministic stand-ins, run with `--no-db`
  and a fake `supabase` on `PATH` where an AC says "local stack running". No real network, Docker or GitHub call.

### A. Client-bundle secret scan (L27)

- [ ] **AC1 (placement):** Given any repo with `package.json`, When verify.sh runs, Then the `[secrets]` section no longer
  prints a client-bundle line, and in `[project]` exactly one client-bundle line is printed immediately after the
  `npm run build` line (before the summary). Every other line keeps its current section and order.
- [ ] **AC2 (clean tree, happy path):** Given a fixture repo with no `.next/`, `dist/` or `build/` before the run, whose build
  writes a client bundle under `.next/static/` containing only public values (the fixture anon JWT with `"role":"anon"`,
  a publishable key `sb_publishable_...`, the API URL), and the local stack is running, When verify.sh runs, Then it prints
  `  PASS  client bundle has no server secrets`.
- [ ] **AC3 (no bundle):** Given a fixture repo whose build script exits 0 but creates no `.next/static`, `dist` or `build`
  directory (or only empty ones), When verify.sh runs, Then it prints
  `  FAIL  client bundle scan (no client bundle from this build)` and exits 1. It never prints a PASS or SKIP for the bundle.
- [ ] **AC4 (build failed):** Given a fixture repo whose build script exits non-zero (with or without a stale `.next/static/`
  left from an earlier run), When verify.sh runs, Then it prints `  FAIL  npm run build` and
  `  FAIL  client bundle scan (no client bundle from this build)`, and does not scan or PASS the stale bundle.
  The same bundle FAIL line is printed when the `build` script is missing (after the existing `script 'build' missing` FAIL).
- [ ] **AC5 (local values):** Given the local stack is running and `supabase status -o env` reports `SERVICE_ROLE_KEY`,
  `SECRET_KEY`, `JWT_SECRET`, `DB_URL` and `S3_PROTOCOL_ACCESS_KEY_SECRET`, When the built bundle contains the exact value of
  any one of them (one test per name), Then verify.sh prints `  FAIL  server secrets in client bundle: <NAME>` (the
  status variable name, e.g. `SERVICE_ROLE_KEY`; several names separated by spaces) and exits 1. The values come from
  the status output at run time; the user doesn't need to export anything.
- [ ] **AC6 (values never shown or stored):** Given AC5's failing run, When the full stdout+stderr of verify.sh and every
  file it writes (its `/tmp/verify-*.log` and database log, the repo working tree) are searched for the secret values,
  Then none of the values appears anywhere; the FAIL detail names only the variable or pattern name and the bundle file
  path(s). The same holds for a passing run.
- [ ] **AC7 (public values are not secrets):** Given the bundle contains the exact values of `ANON_KEY`, `PUBLISHABLE_KEY`
  and `API_URL` from the status output, When verify.sh runs, Then the bundle line is PASS (these are meant for the client).
- [ ] **AC8 (secret-key pattern, stack not running):** Given the local stack is not running (status fails) and the bundle
  contains a value shaped like a Supabase secret key (`sb_secret_` followed by at least 20 characters from `A-Za-z0-9_-`)
  that matches no local value, When verify.sh runs, Then it prints `  FAIL  server secrets in client bundle: sb-secret-key-pattern`.
- [ ] **AC9 (service-role JWT pattern):** Given the bundle contains a JWT-shaped token (three base64url parts, the first two
  starting `eyJ`) whose decoded payload has `"role":"service_role"`, signed with any key and matching no local value, When
  verify.sh runs (stack running or not), Then it prints `  FAIL  server secrets in client bundle: service-role-jwt-pattern`.
- [ ] **AC10 (pattern false positives):** Given the bundle contains (a) the bare prefix as library code does today, e.g.
  `` e.startsWith(`sb_secret_`) `` and `sb_secret_…`, (b) the anon JWT (`"role":"anon"`), and (c) the word `service_role`
  outside a JWT, When verify.sh runs, Then the bundle line is PASS.
- [ ] **AC11 (existing checks kept):** Given the bundle contains (a) the value of a shell-exported `SUPABASE_SERVICE_ROLE_KEY`,
  `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `DATABASE_URL` (16+ chars), or (b) `sk_live_`/`sk_test_`,
  When verify.sh runs, Then it FAILs with `  FAIL  server secrets in client bundle: <NAME or stripe-secret-pattern>`
  exactly as today. `dist/` and `build/` are still scanned alongside `.next/static/`.
- [ ] **AC12 (stack not running locally):** Given the local stack is not running and `CI` is not `true`, When verify.sh
  runs on a clean bundle, Then it prints the info line `  (local stack not running: client bundle checked for secret patterns only)`
  (not counted) followed by `  PASS  client bundle has no server secrets`.
- [ ] **AC13 (stack not running in CI):** Given `CI=true` and `supabase status -o env` fails or reports no
  `SERVICE_ROLE_KEY`, When verify.sh runs, Then it prints
  `  FAIL  client bundle has no server secrets (local stack values unavailable, required in CI)` and exits 1
  (CI starts the stack before verify.sh, so this means the step broke). See Q1.

### B. Destructive-statement scan (L15)

All in `[migrations]`, on new migrations only (as today). Line names unchanged:
`  PASS  no destructive statements in new migrations`, `  FAIL  destructive statements need approval`,
`  PASS  destructive statements approved (destructive-approved label)`.

- [ ] **AC14 (privileges are not statements):** Given a new migration containing only
  `revoke truncate on table public.t from anon;`, `grant select, insert, update, delete, truncate, references, trigger on public.t to authenticated;`
  and a multi-line `REVOKE ALL\n  ON ALL TABLES IN SCHEMA public\n  FROM anon, authenticated;` (upper and lower case variants),
  When verify.sh runs without `DESTRUCTIVE_APPROVED`, Then it prints `  PASS  no destructive statements in new migrations`.
- [ ] **AC15 (comments ignored):** Given a new migration whose only destructive words are in comments
  (`-- drop table x`, `create table t (id int); -- truncate later`, and a `/* delete from t; rename to u */` block spanning
  several lines), When verify.sh runs, Then the destructive line is PASS.
- [ ] **AC16 (real statements still FAIL):** Given a new migration with any one of (one fixture each):
  `drop table public.t;`, `DROP TABLE IF EXISTS t;`, `alter table public.t drop column c;`, `drop function f();`,
  `drop view v;`, `drop schema s;`, `drop type ty;`, `drop policy p on t;`, `drop trigger tr on t;`, `truncate public.t;`,
  `TRUNCATE TABLE t;`, `delete from public.t;`, `alter table t rename to u;`, `alter table t rename column a to b;`,
  When verify.sh runs without `DESTRUCTIVE_APPROVED`, Then it prints `  FAIL  destructive statements need approval`
  with the file name and the matching line number and line text below it, and exits 1.
- [ ] **AC17 (statement after a comment, privilege or string on the same line):** Given lines
  `grant select on t to anon; truncate t;`, `select 1; -- note` followed by `truncate t;` on the next line,
  `select '--'; drop table t;`, and `select '/*'; delete from t;`, When verify.sh runs, Then each FAILs as in AC16
  (comment markers inside single-quoted strings don't start a comment).
- [ ] **AC18 (approval still works):** Given AC16's migration and `DESTRUCTIVE_APPROVED=1`, When verify.sh runs, Then it
  prints `  PASS  destructive statements approved (destructive-approved label)`.
- [ ] **AC19 (nothing else exempted):** Given a destructive statement inside a function body
  (`create function f() returns void language sql as $$ delete from public.t; $$;`), When verify.sh runs, Then it still
  FAILs as today. Only comments and GRANT/REVOKE statements are exempt.

### C. Empty test suite (L5)

- [ ] **AC20 (FAIL):** Given `package.json`'s `scripts.test` contains `--passWithNoTests` and at least one test file exists
  (a file named `*.test.*` or `*.spec.*` with extension `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `mts` or `cts`, outside
  `node_modules/`, `.next/` and `tests/e2e/`), When verify.sh runs, Then in `[project]`, immediately before the
  `npm run test` line, it prints `  FAIL  test script has --passWithNoTests while test files exist` with the
  first test file path(s) and `Remove --passWithNoTests from package.json#scripts.test (tasks/lessons.md L5).` as detail, and exits 1.
- [ ] **AC21 (PASS, flag absent):** Given `scripts.test` has no `--passWithNoTests` (as on `main` today, `vitest run`),
  When verify.sh runs, Then it prints `  PASS  test script has no --passWithNoTests` in the same position.
- [ ] **AC22 (PASS, no tests yet):** Given `scripts.test` contains `--passWithNoTests` and no test file exists (only
  `tests/e2e/*.spec.ts`, or none at all), When verify.sh runs, Then it prints
  `  PASS  test script may use --passWithNoTests (no test files yet)`.
- [ ] **AC23 (no test script):** Given `scripts.test` is missing, When verify.sh runs, Then this check prints nothing and
  the existing `  FAIL  script 'test' missing from package.json` behaviour is unchanged.
- [ ] **AC24 (role contract):** `roles/qa-test.md` "Done when (gate)" gains exactly this bullet after the `verify.sh`
  bullet, and nothing else in the file changes:
  ``- `package.json`'s `test` script has no `--passWithNoTests` once any test file exists (verify.sh FAILs otherwise; tasks/lessons.md L5).``
  The person approves the wording with the `framework-change-approved` label (see Q3).

### D. GitHub production Environment and repo secrets (S19)

All in bootstrap-check's `[github]` section, after the existing branch-protection lines, using only read-only
`gh api` GET requests. Secret values are never requested (the API returns names only) and nothing is written.

- [ ] **AC25 (all good):** Given the repo has an Environment `production` whose deployment branch policy is custom
  branch policies with exactly one policy, type `branch`, name `main`, and no repository-level Actions secret whose name
  starts with `SUPABASE_`, When bootstrap-check runs (full), Then it prints
  `  PASS  GitHub Environment production exists`,
  `  PASS  production deploys only from main (deployment branch policy)` and
  `  PASS  no repository-level SUPABASE_* secrets`.
- [ ] **AC26 (no Environment):** Given `gh api` returns 404 for `environments/production`, When bootstrap-check runs, Then it
  prints `  FAIL  GitHub Environment production exists` with a `fix:` line (Settings > Environments: create `production`,
  deployment branches: selected branches, `main` only), prints `  FAIL  production deploys only from main (deployment branch policy)`,
  and exits 1.
- [ ] **AC27 (policy not main-only):** Given `production` exists with (a) no deployment branch policy (all branches),
  (b) `protected_branches: true`, (c) custom policies `main` plus another name, (d) a single pattern other than `main`
  (e.g. `*` or `ma*`), or (e) a single policy of type `tag`, When bootstrap-check runs, Then it prints
  `  FAIL  production deploys only from main (deployment branch policy)` with a `fix:` line, and exits 1 (one test per case).
- [ ] **AC28 (repo secret exists):** Given repository-level Actions secrets `SUPABASE_ACCESS_TOKEN` and `OTHER_TOKEN`, When
  bootstrap-check runs, Then it prints `  FAIL  no repository-level SUPABASE_* secrets (found: SUPABASE_ACCESS_TOKEN)` with
  a `fix:` line (move it to the `production` Environment and delete the repository secret), and exits 1. Only names matching
  `SUPABASE_*` are listed. Secrets on more than one API page (over 30) are all checked.
- [ ] **AC29 (offline):** Given `--offline`, When bootstrap-check runs, Then it makes no `gh` call and prints
  `  SKIP  production environment and repo secrets (offline mode: CI must run the full check)` after the existing
  offline SKIP line; nothing about them is PASS.
- [ ] **AC30 (gh missing or signed out):** Given `gh` is not on `PATH` or `gh auth status` fails, When bootstrap-check runs
  (full), Then it prints, after the existing branch-protection FAIL,
  `  FAIL  production environment and repo secrets (gh CLI missing or not signed in, so they can't be verified)`, and exits 1.
- [ ] **AC31 (API error is not a pass):** Given the environment exists but the secrets listing or the branch-policy listing
  returns an error other than 404 (e.g. 403 for missing permission), When bootstrap-check runs, Then the matching line FAILs
  with `(could not read: HTTP <code>)` appended to its name; it never PASSes on an unreadable answer.

### E. No regression

- [ ] **AC32 (nothing removed or weakened):** Every check verify.sh and bootstrap-check run on `main` today still runs with
  the same name and the same PASS/FAIL conditions, except the bundle line (moved per AC1, stricter per AC3/AC4/AC13) and the
  destructive scan (narrowed only per AC14/AC15). Code review compares `git diff origin/main -- scripts/` against this list.
- [ ] **AC33 (repo still green):** Given this branch with the local stack running, When
  `bash scripts/verify.sh --brief tasks/4d/TASK_BRIEF.md` runs, Then it ends `verify.sh: PASS <n>/<n> (0 skipped)` with exit 0,
  including `  PASS  client bundle has no server secrets` after `npm run build` and `  PASS  test script has no --passWithNoTests`;
  and `bash scripts/bootstrap-check.sh` (full, the person's `gh`) passes, or fails only on S19 lines that reflect real
  repository settings (recorded in the Handoff for the person, not fixed by an agent).
- [ ] **AC34 (CI):** The PR's required checks `verify`, `db-check`, `secrets` and `merge-gate` are green, and gitleaks finds
  no secret in the fixtures (fixtures hold no secret-shaped strings; see Inputs).

## Security rows that apply

From `rules/security-baseline.md`; security confirms during Design.

- [ ] Row 3 (API key in the browser): AC2-AC13 are the automated client-bundle check for this row.
- [ ] Row 13 (`.env` in Git / secrets): AC6, AC34; S19 (AC25-AC31) keeps production credentials out of reach of PR workflows.
- Merge-gate note: this PR changes `scripts/**` and `roles/**` (protected paths). It needs the person's
  `framework-change-approved` label; agents never add it (AGENT_RULES 18a). See L11 S16 (label not tied to a commit):
  the person should label after the last push.

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). `tasks/**` is always allowed.

```
scripts/verify.sh
scripts/bootstrap-check.sh
roles/qa-test.md          # AC24 only; the person's text, approved via the framework-change-approved label
tests/integration/**      # qa-test: tests and fixture dirs (tests/integration/fixtures/4d/**)
```

Ownership within the task: devops-cicd builds `scripts/verify.sh`, `scripts/bootstrap-check.sh` and the AC24 line in
`roles/qa-test.md` (`roles/**` is the person's; the label is the approval). qa-test writes `tests/integration/**`.

**Out of scope:**

- `scripts/gate-check.sh`, `gate.yml`, merge-gate behaviour and protected-path list (task 4b; L11 S5/S14/S15/S16).
- `.github/workflows/drift.yml` and the drift check (task 4e; L11 S26/S27).
- `.github/workflows/ci.yml`: no change needed (it already starts the stack before verify.sh). If devops-cicd finds one is
  needed, write a handoff note and set `BLOCKED`; don't widen the scope.
- `tasks/board.md` (task 4a removes it; this task's state lives in the State row above).
- Creating or changing the `production` Environment, branch policy or any secret: the person only. bootstrap-check reports.
- New destructive patterns (e.g. `drop constraint`, `drop index`, `alter ... drop default`): not added here; the pattern list stays as today.
- `package.json`: `scripts.test` is already `vitest run` on `main` (no `--passWithNoTests`), so nothing to change.
- Running bootstrap-check in CI.

## Inputs

- `tasks/lessons.md` L5, L11 (S19), L15, L27; `scripts/verify.sh` and `scripts/bootstrap-check.sh` on `origin/main` (`5c3aa7e`).
- Local stack status names (checked 2026-11-25 with CLI 3.2.0, names only): `ANON_KEY`, `API_URL`, `DB_URL`, `FUNCTIONS_URL`,
  `GRAPHQL_URL`, `JWT_SECRET`, `MAILPIT_URL`, `MCP_URL`, `PUBLISHABLE_KEY`, `REST_URL`, `S3_PROTOCOL_ACCESS_KEY_ID`,
  `S3_PROTOCOL_ACCESS_KEY_SECRET`, `S3_PROTOCOL_REGION`, `SECRET_KEY`, `SERVICE_ROLE_KEY`, `STORAGE_S3_URL`, `STUDIO_URL`.
  Server-only for AC5: `SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET`, `DB_URL`, `S3_PROTOCOL_ACCESS_KEY_SECRET`.
  Public for AC7: `ANON_KEY`, `PUBLISHABLE_KEY`, `API_URL` (and the other URLs).
- Observed: `node_modules/@supabase` (in the client bundle) contains the bare text `` startsWith(`sb_secret_`) `` and
  `sb_secret_…`; the local `SECRET_KEY` has a 31-character body after `sb_secret_`. Hence AC8's "at least 20 characters" and AC10.
- **CLI call (testability):** verify.sh reads status through the same CLI resolution the `[database]` section uses
  (`supabase` on `PATH` first, else `npx --no-install supabase`), so tests can put a fake `supabase` on `PATH`.
  bootstrap-check uses `gh` from `PATH`, so tests can stub it with canned JSON per AC.
- **Test fixtures (qa-test):** under `tests/integration/fixtures/4d/`. Rules:
  - No secret-shaped string is committed (gitleaks scans history): fake JWTs, `sb_secret_` keys and status values are
    generated at test run time with random bytes, never real local or production values.
  - Fixture files that must look like test files (AC20) are stored under a non-test name and renamed when copied into the
    temporary repo, so Vitest doesn't collect them.
  - Each test runs verify.sh/bootstrap-check against a temporary git repo outside the worktree, with `--no-db` and stub
    scripts; it never runs the real `npm run build`, starts Docker, or calls GitHub.
- Test plan: `specs/4d/test-plan.md` is not in Allowed paths; qa-test writes the AC-to-test map in its Handoff entry instead (see Q2).

## Destructive change?

- [x] No (gate scripts and tests only; no data or schema change)
- [ ] Yes

## Open questions (defaults apply unless the person says otherwise)

- **Q1 (AC13):** In CI, should missing local stack values FAIL the bundle check? **Default: yes** (CI always starts the
  stack first, so missing values mean a broken step, and a silent pattern-only scan is what L27 complained about).
  Locally it degrades to patterns only with an info line (AC12).
- **Q2:** `specs/4d/test-plan.md` is outside the requested allowed paths. **Default:** qa-test puts the AC-to-test table in
  its Handoff entry; no `specs/4d/` file.
- **Q3 (AC24):** exact wording of the qa-test "Done when" bullet. **Default:** the text in AC24; the person's
  `framework-change-approved` label on the PR approves it.
- **Q4 (AC27b):** `protected_branches: true` counts as not main-only, even if `main` is the only protected branch today.
  **Default: FAIL** (a later protected branch would silently gain production access).

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/4d/TASK_BRIEF.md` (this file).
- **Verified:** read `scripts/verify.sh`, `scripts/bootstrap-check.sh`, `.github/workflows/ci.yml`, `roles/qa-test.md`,
  lessons L5/L11/L15/L27 on `origin/main` `5c3aa7e`; listed local `supabase status -o env` variable names (no values);
  checked `node_modules/@supabase` for the `sb_secret_` literal.
- **Left to do:** devops-cicd builds A-D; qa-test writes tests for AC1-AC31 with fixtures; AC32-AC34 at review.
- **Next role must know:** defaults Q1-Q4 apply unless the person overrides. The PR needs the person's
  `framework-change-approved` label (scripts/** and roles/**). Don't edit `tasks/board.md`.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

### orchestrator, 2026-11-25 (inputs)

- Q1-Q4: build with the stated defaults; the person sees them in the PR before adding the label.
- PR #16 (4a) is open in parallel and removes `tasks/board.md`; this branch merges main before its gates run.

### devops-cicd, 2026-11-25 (contract for qa-test, before the build)

Result lines are exactly the brief's texts (AC1-AC31). Additions and precisions qa-test can rely on:

- **Bundle FAIL name has no trailing space** (today's line ended with a space after the last name):
  `  FAIL  server secrets in client bundle: <NAME> [<NAME> ...]`. Order of names: shell-exported vars
  (`SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY OPENAI_API_KEY ANTHROPIC_API_KEY DATABASE_URL`), then status names
  (`SERVICE_ROLE_KEY SECRET_KEY JWT_SECRET DB_URL S3_PROTOCOL_ACCESS_KEY_SECRET`), then `stripe-secret-pattern`,
  `sb-secret-key-pattern`, `service-role-jwt-pattern`. Detail lines: `<NAME>: <bundle file path(s)>`, then
  `Only NEXT_PUBLIC_* values may reach the client.`
- **Status values shorter than 8 characters are not compared** (avoid trivial matches); generate longer fakes.
  Shell-exported vars keep today's 16-character minimum.
- **Patterns skip a hit equal to a local server value** (so a bundle holding the local `SERVICE_ROLE_KEY` prints only
  `SERVICE_ROLE_KEY`, not also `service-role-jwt-pattern`).
- **"From this build":** after the build exits 0, there must be at least one regular file under `.next/static`, `dist`
  or `build`, and either those dirs held no files before the build, or the sorted file list changed, or a file is newer
  than a marker taken just before the build (backdated 2 s where `touch -d` supports it). Stale files alone give
  `  FAIL  client bundle scan (no client bundle from this build)`. (Updated in the build: mtime alone wrongly failed a
  build that copies files, since Node's `cpSync` on Windows keeps the source mtime.)
- **In CI with a leak and no local values**, one line is printed: the leak FAIL, with an extra detail line
  `local stack values unavailable (required in CI)`. Without a leak: the AC13 line.
- **Fake `supabase` stub:** verify.sh calls `supabase status -o env` (first `supabase` on `PATH`; else
  `npx --no-install supabase status -o env`), stdout lines `NAME="value"` (quotes optional); non-zero exit = not running.
  It's called only once, after a successful build. With `--no-db` the `[database]` section never calls the stub.
- **Destructive scan:** also exempts `ALTER DEFAULT PRIVILEGES ... GRANT|REVOKE ...` statements (a GRANT/REVOKE in
  Postgres grammar; task 1's migration uses it). Strings and identifiers in quotes stay scanned; `/* */` nests as in Postgres.
- **L5 test-file search:** `find` from the repo root, pruning every `node_modules`, `.next` and `.git` directory and
  `./tests/e2e`. Detail lists up to 5 paths.
- **bootstrap-check `gh` stub:** calls are
  `gh auth status`,
  `gh api repos/{owner}/{repo}/branches/main/protection` (unchanged from `main`, no `--method`),
  `gh api --method GET repos/{owner}/{repo}/environments/production`,
  `gh api --method GET repos/{owner}/{repo}/environments/production/deployment-branch-policies?per_page=100`
  (only when the environment says `"custom_branch_policies": true`),
  `gh api --method GET --paginate repos/{owner}/{repo}/actions/secrets?per_page=100` (print every page; concatenated
  JSON objects are fine). Errors: exit non-zero and print `gh: <message> (HTTP <code>)` to stderr, as real `gh` does.
  JSON may be compact or pretty. A policy must have `"type": "branch"` explicitly.
- **S19 error lines:** `... (could not read: HTTP <code>)`; if stderr has no HTTP code: `... (could not read: gh api failed)`.
  A non-404 error on `environments/production` FAILs both the environment and the policy line with that suffix.
  AC28 lists several names separated by a comma and space: `(found: SUPABASE_A, SUPABASE_B)`.

### devops-cicd, 2026-11-25 (build)

- **Changed:** `scripts/verify.sh` (bundle scan moved from `[secrets]` to `[project]` right after `npm run build`, AC1-AC13;
  destructive scan via a comment/GRANT/REVOKE-aware awk pass, AC14-AC19; `--passWithNoTests` check before `npm run test`,
  AC20-AC23), `scripts/bootstrap-check.sh` (S19 lines in `[github]`, AC25-AC31), `roles/qa-test.md` (AC24 bullet, exact
  text), `tasks/4d/lessons.md` (new, per ORCHESTRATOR.md section 8 as on main after 4a; `Closes: L5, L15, L27`). Contract
  for qa-test: the entry above (freshness rule updated during the build, see L4d.2).
- **Verified (manual, scratchpad repos, cleaned up; no committed tests):**
  - Real `next build` in this worktree with the local stack running: `  PASS  client bundle has no server secrets`
    (local values read, no info line).
  - Copy of the real `.next/static` in a temp repo: PASS with the real local values; with a planted **fake**
    service-role JWT and fake `sb_secret_` key: `  FAIL  server secrets in client bundle: sb-secret-key-pattern service-role-jwt-pattern`
    (detail names only `.next/static/chunks/planted.js`). Stale bundle + build that writes nothing, build failing with a
    stale bundle, and a build that writes only empty dirs: each `  FAIL  client bundle scan (no client bundle from this build)`.
    The real `.next/static` contains the bare `sb_secret_` prefix (1 file) and still PASSes (AC10).
  - Fixture with random fake status values via a fake `supabase` on `PATH`: AC2/AC7/AC10 PASS; AC5 FAIL with exactly the one
    name for each of the five; AC8, AC9 (stack up and down), AC11, AC12 (info line + PASS), AC13 CI FAIL; CI + leak prints the
    leak FAIL with the `local stack values unavailable (required in CI)` detail. No value found in stdout/stderr or
    `/tmp/verify-*.log` in any run.
  - Destructive scan on sample SQL: every AC14/AC15 line gives no hit; every AC16/AC17/AC19 line is reported with its line
    number; AC18 approval PASS. On the four existing migrations: 0 hits (old grep: 6 false hits in
    `20261125135502_default_privileges_baseline.sql`, all `ALTER DEFAULT PRIVILEGES ... GRANT/REVOKE ... TRUNCATE` and one
    comment: the L15 case, hence the ALTER DEFAULT PRIVILEGES exemption).
  - L5 fixture: AC20 FAIL lists `lib/foo.test.ts` (not `node_modules/`), AC21, AC22 (none / only `tests/e2e/*.spec.ts`), AC23.
  - bootstrap-check with a stub `gh`: AC25 all PASS; AC26 404; AC27 a-e (a against the real repo, b-e stubbed); AC28 over two
    concatenated pages; AC29 `--offline`; AC30 failing `gh auth status`; AC31 403 on environment, policies and secrets.
- **`bash scripts/verify.sh --no-db`** (public stack env exported in memory as CI does, for `test:e2e`):
  `verify.sh: PASS 17/17 (1 skipped)`. Without that export `test:e2e` FAILs on its documented precondition (not this change).
  The full run with the database (AC33) is the orchestrator's.
- **bootstrap-check (full, real repo, read-only GET):** `bootstrap-check: FAIL 2 of 34 checks failed (0 skipped)`, both S19
  lines reflecting real settings: `production` has `deployment_branch_policy: null` (all branches), and
  `SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_ID` are repository secrets (the Environment has none).
  **For the person** (agents don't change settings): see `tasks/4d/lessons.md` L4d.1.
- **Left / must know:** qa-test writes `tests/integration/**` per the contract above. origin/main moved to `fcf8ec2` (4a);
  no overlap with this task's files; this branch isn't merged with main yet (orchestrator). `ci.yml` needs no change. The PR
  needs the person's `framework-change-approved` label. Decisions for review: the ALTER DEFAULT PRIVILEGES exemption, the
  8-character minimum for status values, and the trailing space removed from the bundle FAIL name.

Result: PASS

# Security gate: task 0 (Phase 0 bootstrap)

- **Reviewer:** security (fresh context, no builder conversation)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-phase0-fixes` @ `195834a` (full tree as of HEAD, including the Phase 0 commits already on `main`: `d3aa366`, `b69d33e`, plus the branch commits `d2a77b5`, `10f8be1`, `1c80e60`, `195834a`)
- **Scope reviewed:** `.github/workflows/ci.yml`, `.github/workflows/drift.yml`, `scripts/verify.sh`, `scripts/bootstrap-check.sh`, `scripts/gate-check.sh`, `scripts/ci/install-gitleaks.sh`, `.gitignore`, `supabase/.gitignore`, `.env.example`, `.npmrc`, `package.json`, `supabase/config.toml`, `supabase/migrations/20261125104017_init.sql`, `supabase/tests/00_bootstrap_test.sql`, `next.config.ts`, `app/*`.

The verdict covers the baseline rows that apply to task 0. Findings below that don't break an
applicable row are listed as should-fix with an owner; none of them is exploitable in the code as
it stands, but two of them (S1, S2) weaken the merge-approval process itself and should be dealt
with before GitHub's required review count is set to 0.

## Applicable baseline rows

The brief (`tasks/0/TASK_BRIEF.md`, "Security rows that apply") lists only row 13. Task 0 has no
app feature, no route, no table, no auth flow and no client code that reads env vars, so rows 1-12
have nothing to check yet. Rows 4, 6, 7, 10, 12 are proposed N/A in `PROJECT_CONTEXT.md`; security
confirms or rejects that in the first feature's threat model, not here. Row 14 (RLS) is checked
below as well, because Phase 0 ships the RLS check that every later task depends on.

### Row 13: `.env` in Git

| Control | Where | Proof | Result |
|---|---|---|---|
| `.gitignore` ignores `.env*` except `.env.example` | `.gitignore:2-3` (also `supabase/.gitignore:5-8` for `.env.keys`, `.env.local`, `.env.*.local`; `.gitignore:26` `supabase/.env`; `.gitignore:37` `*.pem`) | `git ls-files` lists no `.env` file other than `.env.example`; `bootstrap-check.sh` "no .env files tracked by git" PASS | PASS |
| `.env.example` has names only | `.env.example:1-5` | Every variable is empty (`NAME=`) | PASS |
| CI secret scan on full history | `.github/workflows/ci.yml:87-100` (`secrets` job, `fetch-depth: 0`, `gitleaks detect --redact`), gitleaks pinned `ci.yml:18` (8.30.1), checksum-verified install `scripts/ci/install-gitleaks.sh:9-12` | CI run 45602038832 on HEAD `195834a`: job `secrets` = success. Also `verify` (which runs gitleaks inside verify.sh) = success | PASS |
| Secret scan in verify.sh | `scripts/verify.sh:151-173` (tracked-env check, gitleaks if installed, pattern fallback; fails in CI if gitleaks is missing, `verify.sh:170`) | Local run: "no .env files tracked" PASS, "basic secret pattern scan" PASS (gitleaks not installed locally, so the fallback ran) | PASS |
| bootstrap-check (abuse test named by the baseline) | `scripts/bootstrap-check.sh:47-52` (.gitignore + tracked env), `:85` (CI secret scan present) | Local run: all three PASS | PASS |

Abuse test for row 13 per the baseline is "bootstrap-check + CI secret scan": both present and green.

### Row 14: Query your database (RLS)

| Control | Where | Proof | Result |
|---|---|---|---|
| Static RLS check on every `create table` in migrations | `scripts/verify.sh:135-146` | Local verify.sh: "RLS enabled on every public table (static check)" PASS | PASS |
| Dynamic RLS check (pgTAP) on the built database | `supabase/tests/00_bootstrap_test.sql:9-17` (`is_empty` on public tables with `relrowsecurity = false`) | `supabase test db` PASS locally and in CI (`db-check` = success on `195834a`) | PASS |
| No tables yet | `supabase/migrations/20261125104017_init.sql:4` (`select 1;`) | Local DB query: no tables, views or matviews in `public` / `graphql_public` | PASS |
| Supabase security advisors | n/a | **N/A:** there is no Supabase cloud project yet (hard constraint in `PROJECT_CONTEXT.md`), so advisors can't run. Not a failure; must run in the first gate after the project exists. | N/A |

Gap to note for later (not a fail now): the pgTAP test checks `relrowsecurity` only, and
`database-and-deploy.md` rule 13 also requires at least one policy per table. See S7.

## Automated results (run locally on HEAD `195834a`, 2026-11-25)

| Check | Command | Result |
|---|---|---|
| Dependency audit | `npm audit --audit-level=high` (Node 24.11.0, npm 11.6.1) | `found 0 vulnerabilities`, exit 0 |
| Done gate incl. RLS, DB build, tests, lint | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md` (local Supabase on 55420-55429) | `verify.sh: PASS 18/18 (1 skipped)` (skip: `test:e2e`, no script, not required) |
| Phase 0 gate | `bash scripts/bootstrap-check.sh` | `FAIL 1 of 31` (only "DB deploy path connected"; known, waits for the person's Supabase project). Not a security finding. |
| Secret pattern review, tracked files | grep over `git ls-files` for Stripe, Anthropic/OpenAI, AWS (AKIA/ASIA), private-key blocks, Postgres URLs with password, JWTs (`eyJ...`), GitHub tokens (`ghp_`/`github_pat_`), Slack, Google API keys, Supabase `sb_secret_`/`sbp_`, and generic `password/secret/token/api_key = "<literal>"` | 0 hits in tracked files; 0 hits in `git log -p --all` |
| gitleaks | not installed locally | Ran in CI: `secrets` job success on `195834a` (full history, default rules, no `.gitleaks.toml`) |
| Action pinning | `git ls-remote --tags` for each action | `actions/checkout@3d3c42e…` = v7.0.1, `actions/setup-node@949feb2…` = v7.1.0, `actions/github-script@3a2844b…` = v9.0.0 (peeled tag). All pins are full commit SHAs and match their version comments. |
| Branch protection (read-only `gh api`) | `repos/{owner}/{repo}/branches/main/protection` | required reviews 1, required checks `verify`, `db-check`, `secrets`, strict, force-push off, **enforce_admins off**, `gate` **not** a required check yet. See S2. |

## Manual review

Checked and fine:

- **Workflow permissions:** `ci.yml:9-10` `contents: read` for all jobs. `drift.yml:11-13` `contents: read`, `issues: write` (needed for the drift issue). No `pull_request_target`, no `workflow_run` on PR code.
- **Script injection:** no `${{ github.event.* }}` attacker-controlled text (PR title, body, branch name) is interpolated into a `run:` block. The branch name reaches scripts only through `GITHUB_HEAD_REF` as an env var (`gate-check.sh:17`, `verify.sh:62`), and the task id is restricted to `[A-Za-z0-9]+` before it's used in a path. `ci.yml:47` interpolates a boolean expression on labels into `env:`, not into shell.
- **Secrets in CI:** `ci.yml` uses no secrets. Fork PRs (the repo is public) get a read-only token and no secrets. `drift.yml` uses secrets only on `schedule` / `workflow_dispatch`, never on PRs; gitleaks runs with `--redact`.
- **Supply chain:** `npm ci` from the committed lockfile everywhere; exact versions (`.npmrc:1-2`, `package.json`); pinned Node (`.nvmrc`), npm (`packageManager`), Supabase CLI (3.2.0), gitleaks (8.30.1, sha256 checked).
- **Drift workflow is read-only:** `db diff --remote` only, no `db push`, `execute_sql` or migration apply.
- **App scaffold:** `app/*` has no `process.env` use, no `"use client"`, no `dangerouslySetInnerHTML`, no fetch. No route handlers, no server actions, no uploads, no LLM calls. No new env var reaches the client.
- **Migration:** `select 1;` only, no SQL built from strings.

## Findings

### FAIL-worthy

None.

### Should-fix (not blocking task 0)

| # | File:line | Problem | Why it matters | Fix | Owner |
|---|---|---|---|---|---|
| S1 | `.github/workflows/ci.yml:105-115`, `scripts/gate-check.sh` (whole file); same for `ci.yml:44-48` + `scripts/verify.sh` | The `gate` and `verify` jobs run the scripts **from the PR's own checkout**. A PR that edits `scripts/gate-check.sh` (e.g. to `exit 0`) or the `gate` job in `ci.yml` passes its own merge-approval check without any security gate or review file. | Once GitHub's required review count is 0 (`ORCHESTRATOR.md` 3a, `tasks/decisions.md`), the `gate` check is the only approval, and it is self-modifiable by the change it approves. A builder agent could merge unreviewed code. | Run the gate logic from the base branch, not the PR head: e.g. a separate workflow on `pull_request_target` that checks out **only** `main` for the script and reads the PR's gate files with `git show <pr-sha>:specs/<id>/...` (never executes PR code, `permissions: contents: read`, no secrets). Or make `gate-check.sh` fail when the PR diff touches `scripts/gate-check.sh`, `scripts/verify.sh` or `.github/workflows/**` unless the person adds a label (still self-modifiable, so weaker). Decide before setting required reviews to 0, or record the accepted risk in `tasks/decisions.md`. | devops-cicd (the person decides) |
| S2 | GitHub settings (read via `gh api`); `ORCHESTRATOR.md:37`, `:65-67` | Branch protection doesn't match the documented model: `gate` is not a required check, reviews are still 1, and `enforce_admins` is off, so the single admin account can merge past every check. | The documented approval model isn't enforced yet, and admin bypass makes all required checks advisory for the owner account. | After this PR merges: add `gate` to the required checks, set reviews to 0 only together with S1, and turn on "Do not allow bypassing the above settings" / enforce admins. Re-run `bootstrap-check.sh` (it doesn't check for `gate` or enforce_admins today, see S3). | the person (settings); devops-cicd (S3) |
| S3 | `scripts/bootstrap-check.sh:71-74` | Only checks that `required_pull_request_reviews` and `required_status_checks` keys exist, not that `verify`, `db-check`, `secrets`, `gate` are the required contexts, nor `enforce_admins`. | Someone can drop a required check or keep admin bypass on and Phase 0 still reports green (stop rule 3 never fires). | Check the contexts list contains all four job names and `enforce_admins.enabled == true`. | devops-cicd |
| S4 | `scripts/gate-check.sh:27` | `grep -qE "^(\*\*)?Result:..."` accepts the result on **any** line, while `roles/security.md` says the **first** line is the verdict. A gate file whose first line is a FAIL verdict but which later contains a line with only the PASS verdict (e.g. a quoted example, or an old verdict left in) passes the gate. | A FAIL can be turned into a merge by an innocent or careless edit. | Read only line 1: `head -1 "$f" \| grep -qE "^Result: $2$"` (strip a trailing CR). Same for `review.md` per its contract. | devops-cicd |
| S5 | `scripts/verify.sh:79` with `:72-73`; `scripts/gate-check.sh:37` (`:(exclude)tasks/**`) | The scope check reads "Allowed paths" from the brief in the PR's own working tree, and `tasks/*` is always in scope. A builder can widen its own allowed paths in the same PR. `gate-check.sh` also treats any change under `tasks/**` as non-code, so the brief can be edited after both gates. | Scope enforcement (AGENT_RULES rule 5) is self-modifiable. | Read the brief from the merge base when it exists there (`git show "$MERGE_BASE:$BRIEF"`), and fail if the PR changes the brief's "Allowed paths" block without a person-approved label. In gate-check, exclude only the Handoff section edits, or at least not the scope block. | devops-cicd (product-spec owns brief contents) |
| S6 | `.github/workflows/drift.yml:24-28` (job-level `env` with secrets), `:30` (checkout), `:49` (`npm ci`) | `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are in the environment of every step, including `npm ci`, which runs dependency install scripts (e.g. the `supabase` package's postinstall). `actions/checkout` also persists the `issues: write` token in `.git/config` by default. | A compromised dependency in the lockfile would get the production access token and DB password. | Move the secrets into `env:` of only the `link` and `db diff` steps; add `persist-credentials: false` to the checkouts in both workflows (none of them push). | devops-cicd |
| S7 | `supabase/tests/00_bootstrap_test.sql:9-17`, `scripts/verify.sh:135-146` | RLS checks prove "RLS enabled" only. `database-and-deploy.md` rule 13 also requires at least one policy per table, and baseline row 14 requires "anon key can't read other users' rows". The static check is regex-based and misses tables created by `create table ... (like ...)`, `create table as`, partitions in other forms, or tables in other exposed schemas (`graphql_public`). | Fine for Phase 0 (no tables), but the first real table relies on these checks. The pgTAP test is the stronger control. | Extend the pgTAP test: every table in `public` has at least one row in `pg_policies`; check every schema listed in `config.toml` `[api] schemas`. Add the anon/other-user abuse test in the first feature (qa-test). | db-builder (pgTAP), devops-cicd (verify.sh), qa-test (abuse test) |
| S8 | `.github/workflows/drift.yml:69-83` (issue body, `:75`); repo visibility is **public** | On drift, the schema diff (up to 60 KB) is posted into a GitHub issue, and `drift.yml:59` prints `diff.err` into the public log on failure. | Public issues disclose production schema, policies and function bodies to anyone; error text may include host/user details. Not secrets, but useful reconnaissance. | Post only a summary and the run link in the issue (the log or an artifact with short retention holds the diff), or make the repo private. | devops-cicd (the person decides on visibility) |
| S9 | `scripts/ci/install-gitleaks.sh:9-11` | The checksum file is downloaded from the same release as the tarball, so it proves integrity in transit, not that the release wasn't replaced. | A compromised release (or retagged version) would pass. Lower risk than most, but it's the secret scanner. | Pin the expected sha256 of `gitleaks_8.30.1_linux_x64.tar.gz` in the repo (next to `GITLEAKS_VERSION`) and compare against it. | devops-cicd |
| S10 | `supabase/config.toml:187` (`minimum_password_length = 6`), `:190` (no password requirements), `:219` (captcha commented out), `:232` (`enable_confirmations = false`), `:234` (`secure_password_change = false`), `:243` (`otp_expiry = 3600`), `:80-86` (network restrictions off) | Local defaults that are weak for a login app. They only affect production if someone runs `supabase config push`, but they are also the values the first auth feature will be tested against. | Baseline row 9 (rate limits, lockout, CAPTCHA, OTP expiry) and row 8 apply as soon as login lands. | Set the auth values in the first auth task's threat model (security) and config (devops-cicd); keep cloud settings in sync and recorded. | security (requirements), devops-cicd (config.toml) |
| S11 | `next.config.ts:3-7` | No security headers (CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`). | Baseline row 11 requires a CSP. No user content yet, so nothing to exploit today. | Add the headers block in the first feature task; security supplies the CSP content. | devops-cicd (headers block), security (CSP content) |
| S12 | `scripts/verify.sh:176-177`, `:194-195` | Client-leak check only looks at `.tsx`/`.jsx` files that start with `"use client"`, so a `.ts` module imported by a client component isn't covered; the XSS check skips any file that merely contains the word `sanitize`. The bundle scan (`:181-190`) is the real control and needs the secret values in env, which CI doesn't set. | Weak signals that look like proof. | In CI, scan the built bundle for key patterns (JWT with `"role":"service_role"`, `sb_secret_`) instead of only for known env values; treat the source greps as hints. | devops-cicd |
| S13 | `scripts/verify.sh:208-209` | Fixed log paths `/tmp/verify-<script>.log` (the DB log at `:232` already uses `TMPDIR`). | Minor: predictable temp path on a shared machine. | Use `mktemp` or `$TMPDIR`. | devops-cicd |

## Secret exposure

None found. No secret values were read, used or printed during this gate.

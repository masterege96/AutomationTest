Result: PASS

# Security gate: task 4d, round 2 (verify.sh and bootstrap-check fixes: L27, L15, L5, S19)

- **Role:** security (gate, round 2), 2026-11-26, fresh context, judged from the repo only.
- **Branch:** `ci/4d-verify-fixes` at `3317268`, base `origin/main`. Reviewed: `git diff origin/main...HEAD`
  (`scripts/verify.sh`, `scripts/bootstrap-check.sh`, `roles/qa-test.md`, the S19 decision file,
  `tests/integration/verify-fixes.test.ts`, `tests/integration/task-scripts.test.ts`, `tasks/4d/*`).
  No app code, migrations, workflows, env vars, `package.json` or lockfile changed.
- **Round 1 blocker F1 is fixed.** Both round-1 reproductions and all 14 cases from the devops-cicd handoff are now
  flagged with the right line. I tried roughly 50 more bypass inputs. None of them applies as valid SQL and still hides
  a real `DROP`/`TRUNCATE`/`DELETE FROM`/`RENAME`. The notes below are non-blocking.

## Applicable baseline rows

| Row | Control | Where | Abuse tests | Result |
|-----|---------|-------|-------------|--------|
| #3 API key in the browser | The client bundle is scanned after `build` and must come from this build. It is checked against local-stack server values, shell-exported secret names, `sk_live_/sk_test_`, `sb_secret_` and service-role JWT claims. Values go only through stdin, never argv. In CI the scan FAILs when local values are missing. | `scripts/verify.sh:377-470` | AC1-AC13, N3 (NUL byte) in `verify-fixes.test.ts` | PASS |
| #13 secrets / production credentials (S19) | Read-only `gh api --method GET` calls. RISK is shown only for "no deployment branch policy" and for the three named secrets while the decision is open. Everything else, and every unreadable or 404 answer, FAILs. | `scripts/bootstrap-check.sh:22-42, 100-168` | AC25-AC31, AC35-AC37 | PASS (note N3) |
| Destructive migrations (approval label) | Postgres-faithful lexer. Comments are blanked, and a GRANT/REVOKE/ALTER DEFAULT PRIVILEGES segment is exempt only if it has no `'` and no `$`. Ambiguous or unterminated files get a raw line-by-line scan. | `scripts/verify.sh:129-240` (exemption `:218-222`, unsure `:174, 210-213`) | AC14-AC19, the 14 F1 cases, 3 kept exemptions | PASS (notes N1, N2, N4) |
| L5 empty suite | FAILs on `--passWithNoTests`, `--pass-with-no-tests`, or `passWithNoTests: true` in a root `vitest.config.*` while test files exist | `scripts/verify.sh:350-371` | AC20-AC23, N9 cases | PASS (note N6) |

The diff adds no route, client-trusted value, raw SQL built from strings, `dangerouslySetInnerHTML`, client env var,
LLM output or upload.

## Adversarial review of the destructive scan (F1 re-check)

Method: I copied `destructive_hits` verbatim (`scripts/verify.sh:140-229`) into the scratchpad and ran it with Git
Bash gawk 5.3.2 (`LC_ALL=C`) on hand-written files. No repo file was touched.

Flagged (correct). Every input below reports the line that holds the real statement:
- Round-1 repros: `select $q$ ; grant all on t to x ' $q$; truncate t; ...` and `select E'\'; grant all on t to x '; drop table t; ...`.
- Dollar quotes:
  - adjacent tags `$a$$b$$a$`
  - nested tags
  - a tag with high bytes (`$é$`)
  - `$1$a$` after a parameter
  - `a$$b` inside a word
  - an unterminated `$a$` (raw scan)
  - a CR inside a dollar quote
- E-strings:
  - `\'` escapes
  - backslash before a newline
  - continuation over blank lines and `--` comments
  - continuation over a CR-only newline
  - continuation over `\v`
  - a `/* */` that ends the continuation (Postgres reads the next `'\'` as a plain string, which the scan treats as unsure and raw-scans)
  - `"x"E'..'`
  - `U&'\'`
- Plain strings with an odd backslash run before `'`. These are ambiguous under `standard_conforming_strings`, so the
  file is raw-scanned, and a GRANT with TRUNCATE in such a file is flagged again (fails closed).
- GRANT/REVOKE/ALTER DEFAULT PRIVILEGES segments:
  - with `'` or `$`, including inside a `/* */` before the `;` and in `U&"..." UESCAPE '!'`
  - with `"x;y"` or `"a/*"`
  - several statements on one line
  - `ALTER<TAB>DEFAULT<NL>PRIVILEGES`
  - a `;` at the start of the next line
- CRLF files, a `--` comment ended by a bare CR, NUL bytes, an NBSP after `truncate`, an unterminated `/*` (raw scan).
- `drop/**/table` and `delete/**/from` are now caught. The old grep missed both.

Not flagged:
- `/* /* */ ; truncate t; */`. Postgres reads this whole line as a nested comment, so the result is correct (see N2
  for the CLI side).

## Review notes (non-blocking)

### N1 (low), owner devops-cicd: a number with letters, directly followed by a dollar quote, desyncs the lexer

- **Where:** `scripts/verify.sh:197, 203`.
- **What happens:** `inword` becomes true after `1e5`, `0x1F`, `0o7` or `1_000`, so a `$a$` written right after one of
  these is not seen as a dollar quote. Postgres does see one there (a numeric token followed by `dolqdelim`). Example:
  `select 1e5$a$ /* $a$; truncate t; -- */` gives no hit. The same applies to `1e5E'...'` in PG 14 (in PG 15 and later
  that is a lexer error).
- **Why not blocking:** a numeric constant directly followed by a string constant is a syntax error in every Postgres
  grammar position. The statement holding the desync token fails before the hidden statement runs, so `db reset` and
  `db push` fail and nothing is applied.
- **Suggested hardening:** treat a `$` or `E'` that follows a token starting with a digit as "unsure" (raw scan).

### N2 (residual, unverified), owner devops-cicd + security: the scan models Postgres's lexer, not the Supabase CLI's statement splitter

- **Context:** `supabase` 3.2.0 splits migration files into statements itself.
- **Risk:** suppose the CLI does not nest `/* */` comments and also skips comment-only fragments. Then
  `/* /* */; truncate t; -- */` would run `truncate t`, while this scan (correctly for Postgres) sees one comment.
- **Not tested:** I could not check the CLI parser from the repo, and `supabase` must not be run here. My understanding
  is that the CLI tracks comment depth (it is modeled on psqlscan), which would close this.
- **Suggested hardening:** raw-scan any file with comment depth above 1, since nested comments are rare in migrations.

### N3 (low), owner devops-cicd: a large closing decision file is not detected under `pipefail`

- **Where:** `scripts/bootstrap-check.sh:37`. This is the same as code-review nit 4.
- **What happens:** with `set -o pipefail`, `tr -d '\r' <"$f" | grep -qxF ...` returns 141 when `grep -q` exits early
  and `tr` gets SIGPIPE. Reproduced: with the close line at the top of a 200 KB or 3 MB file, `s19_risk_open` stays
  open 5 of 5 times. With a small file it closes. When this happens, RISK keeps masking the S19 FAILs after the person
  has closed the decision. That fails open, but it needs an unrealistically large decision file.
- **Suggested fix:** `grep -qxF -- "$S19_CLOSE_LINE" < <(tr -d '\r' <"$f")`, or drop `-q` and redirect to `/dev/null`.

### N4 (low, same pattern as `main`), owner devops-cicd: an awk error fails open

- **Where:** `scripts/verify.sh:234`.
- **What happens:** `hits=$(destructive_hits "$m" || true)`. If awk errors (an unsupported feature in some awk, or a
  crash), there are no hits and the line PASSes. `main` had the same `|| true` on grep.
- **Mitigation:** the AC16/F1 tests run in CI's `npm test` on the same ubuntu-24.04 awk as the `verify` job, so a
  broken awk turns CI red. Check that those tests are green on the PR (round-1 N10).
- **Suggested hardening:** capture awk's exit code and FAIL the check when it is non-zero.

### N5 (same as `main`): line-based scan

`drop\ntable t`, `delete\nfrom t` and `drop /* \n */ table` split over lines are not flagged. The old grep had the same
gap, so this is not a regression. A follow-up could match on the blanked text with newlines folded.

### N6 (quality guard, not a security control): L5 misses some indirect forms

Not detected:
- a `test` script that calls another script
- `--config other.ts`
- `passWithNoTests` set on a line that starts with a comment, or split over lines

### N7 (follow-ups carried from round 1, unchanged)

- **Round-1 N4:** `.next/server/app` (prerendered HTML, RSC payloads) is not scanned for row #3.
- **Round-1 N6:** the close line has no time bound. Before 4i, the orchestrator must confirm that bootstrap-check no
  longer prints `RISK`.

### Rechecked and fine

- **Bundle scan, no leaks.** `supabase status -o env` stderr goes to `/dev/null`. Values stay in unexported shell
  variables, are unset at `:457`, and reach `grep`/`base64` only through stdin. `is_local` passes the token on stdin
  and the local values through a process substitution (`:430`). FAIL details list names and file paths only. No temp
  file holds a value. `grep -a` was added to both pattern greps (`:433, :444`).
- **Bundle scan, no stale bundle.** The scan runs only after `build` succeeds and needs a bundle that is fresh by file
  list or by mtime marker (`:377-398`). Otherwise it FAILs `client bundle scan (no client bundle from this build)`.
- **S19.** RISK is used only via `s19_bad`, at `:129` (policy null or absent) and `:163` (all found names are among the
  three named secrets). Protected branches, other custom policies, an empty list, other `SUPABASE_*` names, 404, 403,
  `gh api failed`, failing listings and a missing or signed-out `gh` all call `bad`. Every `gh api` call is GET; the
  secrets endpoint returns names only. Decision files are only read with `tr`/`grep -F` (no `source`, no `eval`).
  `find -type f` skips symlinks. The close line must match exactly (`grep -x`, CR stripped).
- **Standing check (decision condition 1): PASS.** No workflow step reads a `SUPABASE_*` secret outside
  `.github/workflows/drift.yml` (`drift.yml:43-45, 66-68, 74-75` only). `ci.yml:61` only maps local-stack status
  values. No `secrets: inherit` and no `toJSON(secrets)`. This PR changes no workflow.
- **Protected paths.** `roles/qa-test.md` (the person's file) changes by exactly the AC24 bullet, one added line, and
  `scripts/**` changed. **The PR needs the person's `framework-change-approved` label, added after the last push**
  (L11 S16, AGENT_RULES 18a: agents never add it).
- **Fixtures.** No secret-shaped literal in the added lines of the diff (`eyJ…`, `sb_secret_…`, `sk_live_/sk_test_…`,
  `AKIA…`, `ghp_…`, PEM). Tokens are generated at run time.

## Automated results

- **verify.sh** on this HEAD (orchestrator, full run with the DB): `verify.sh: PASS 20/20 (0 skipped)`. Not re-run
  here because the local DB is shared.
- **`npx vitest run tests/integration/verify-fixes.test.ts`:** 1 file, 191 passed, exit 0 (1682 s on this loaded machine).
- **Bypass attempts:** scratchpad only, gawk 5.3.2. mawk is not installed here, so CI's run of the AC14-AC19 and F1
  tests is the mawk evidence.
- **Secret scan:** gitleaks is not installed locally. A pattern scan of the diff found nothing. CI's `secrets` job runs
  pinned gitleaks.
- **`npm audit`:** not applicable (no dependency change).
- **Supabase security advisors:** not applicable (no schema change).
- **RLS check:** the code path is unchanged and PASSed in the orchestrator's verify run.

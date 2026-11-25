Result: PASS

# Security gate: task 0, PR #3 (gate cleanup)

- **Reviewer:** security (fresh context, no builder conversation; judged from the repo only)
- **Date:** 2026-11-25
- **Branch / HEAD reviewed:** `ci/0-gate-cleanup` @ `ece4704`, diff `git diff origin/main...HEAD` (1 commit, 7 files, +29/-28)

## Scope of change

| File | Change | Executable change? |
|---|---|---|
| `.github/workflows/ci.yml` | Removes the temporary in-PR `gate` job (it ran the PR's own `gate-check.sh`); header comment updated | Yes: job removal only |
| `.github/workflows/gate.yml` | +2 comment lines (fetch step works without credentials because the repo is public; going private fails closed) | No (every `+`/`-` line is a `#` comment) |
| `scripts/gate-check.sh` | Header comment rewritten to describe current behaviour | No (every `+`/`-` line is a `#` comment) |
| `roles/devops-cicd.md` | Doc fix: `merge-gate` passes `--head "$HEAD_SHA"` | No |
| `tasks/0/TASK_BRIEF.md` | Branch field lists the PR branches | No |
| `tasks/decisions.md` | S14 accepted for the pilot | No |
| `tasks/lessons.md` | L11 S14 marked accepted; new L12 (drift link failure) | No |

Check: `git diff origin/main...HEAD -U0 -- gate.yml gate-check.sh`, filtered for `+`/`-` lines that are not `#` comments: none.
The new gate-check.sh comment matches the code (first non-empty line rule at `gate-check.sh:40-43`,
no merge-base = FAIL at `:50-52`, protected paths and `FRAMEWORK_CHANGE_APPROVED` at `:67-69`).
No `package.json`, lockfile or `supabase/` change.

## Applicable baseline rows

Row 13 (secrets) and the merge-approval control (ORCHESTRATOR 3a). Rows 1-12 and 14: not applicable
(no app code, routes, tables, migrations or dependencies).

### Merge-approval control

| Check | Proof | Result |
|---|---|---|
| Removing `gate` doesn't weaken approval | The removed job ran the PR head's own `gate-check.sh` (a PR could edit it), so it was the weaker control. Approval is the required `merge-gate` in `gate.yml` (`pull_request_target`, script from `main`), unchanged except for comments. ORCHESTRATOR 3a lists required checks `verify`, `db-check`, `secrets`, `merge-gate`; `gate` is not among them. | PASS |
| Workflows parse, required job names unchanged | js-yaml parse of all `.github/workflows/*.yml`: `ci.yml` jobs `verify=verify, db-check=db-check, secrets=secrets`; `gate.yml` `merge-gate=merge-gate`; `drift.yml` `drift=drift`. No remaining `needs:` on `gate`. | PASS |
| S14 acceptance recorded as the person's decision | `tasks/decisions.md` row 2026-11-25, decided by "the person (via the coordinator)", same form as the other entries; fix planned (plan step 4, GitHub App check). L11 cross-references it. | PASS |

### Row 13: no secrets in files

| Check | Proof | Result |
|---|---|---|
| Diff contains no secret, project ref or connection string | Diff grep for 20-char lowercase strings, `postgres(ql)://`, `eyJ`, `sb_secret`, `sbp_`, `service_role`, `password`: no hits. L12 describes the ref format (`^[a-z]{20}$`, "20-character reference ID") and the masked CLI error (`***`) only; no value. | PASS |
| Whole tree at HEAD | `git grep` for `<20-char>.supabase.co`, JWTs, `sb_secret_`, `sbp_`, `postgres://user:pass@` (excluding local `postgres:postgres@127.0.0.1`): only hit is the previous gate file's own description of these patterns (replaced by this file). | PASS |
| verify.sh | `bash scripts/verify.sh --brief tasks/0/TASK_BRIEF.md`: **PASS 18/18 (1 skipped: no e2e script)**, incl. scope, no `.env` tracked, secret pattern scan (gitleaks not installed locally; CI `secrets` job runs it on full history), migrations apply, `supabase test db`, SQL lint. | PASS |
| npm audit | `npm audit --audit-level=high`: 0 vulnerabilities. | PASS |

Supabase security advisors: not run (no database change in this PR; cloud not touched).

## Notes for the person (not blocking)

- If branch protection on `main` still lists `gate` as a required check, remove it: with the job gone, PRs
  would wait on it forever (fails closed), and a PR could add its own job named `gate` to satisfy it
  (harmless while `merge-gate` is also required). Not checked here: GitHub settings are out of scope.
- `gate.yml` fetch relies on the repo being public (new comment). Going private makes the gate red, not open.

## Carried forward (known, not introduced by this PR)

- **S14** (accepted for the pilot, tasks/decisions.md): same-named `merge-gate` job from a PR, and the
  base-retarget variant. Fix: GitHub App check (plan step 4). Decide before the first real table, since the
  Supabase integration makes a spoofed merge a production write path.
- Open from L11: S5 (`tasks/**`-only PRs with stale gates), S15 (protected-path list gaps), S16 (label not
  tied to a commit), S19 (bootstrap check for `production` environment), S20/S21 (git-release role vs
  AGENT_RULES 18a), S26 (drift non-numeric count), S27 (post-deploy drift trigger).
- L12 (person): `SUPABASE_PROJECT_ID` environment secret holds a non-ref value; drift link fails until fixed.

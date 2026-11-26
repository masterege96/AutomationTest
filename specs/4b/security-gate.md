Result: PASS

# Security gate: task 4b, round 2 (gate freshness from net change, wider protected paths, label tied to the last protected push)

- **Role:** security (gate), 2026-11-26, fresh context, judged from the repo only.
- **Branch:** `ci/4b-gate-freshness` at `da01f03`, base `origin/main`. Diff `git diff origin/main...HEAD`:
  `.github/workflows/gate.yml`, `scripts/gate-check.sh`, `tests/integration/gate-check.test.ts`,
  `tests/integration/task-scripts.test.ts` (two pathspec excludes, test only), `tasks/4b/TASK_BRIEF.md`, `tasks/4/PLAN.md` (text).
  No app code, migrations, env vars or dependencies (`package.json` / lockfile unchanged).
- **Round 1:** FAIL on F1 (S16 bypass: revert + force push, or a fast-forward "ours" merge). Fixed in `4982db9`
  (amended Q1 rule 2, brief entry "devops-cicd, 2026-11-25 (F1 fix)"), regression tests in `4091079`.

## Applicable baseline rows / threats

Merge-gate bypass (L11 S5, S15, S16; L17; L22), CI token scope, PR-controlled data in a privileged workflow, the
standing `SUPABASE_*` check. No new route, client-trusted value, raw SQL, `dangerouslySetInnerHTML`, client env var,
LLM use or upload. S14 (same-named job spoofing) stays open for 4c (accepted, `tasks/decisions.md` 2026-11-25).

| Threat | Control (file:line) | Abuse test | Result |
|--------|---------------------|------------|--------|
| S16 / F1: label older than the protected content that merges | `scripts/gate-check.sh:154-190` (same/different push, D, push time, strict `>` at 184); rule in header `:35-45` | `F1 legit`, `F1 variant A`, `F1 variant B`, `F1 intermediate differing push`, `F1 unknown tip`, `F1 same-second` (x2), AC17-AC22 | pass (85/85 on this HEAD, orchestrator); re-tried myself, below |
| S15: protected path list | `scripts/gate-check.sh:93-94` | AC15, AC16 | pass |
| S5: decision files / tasks-only PR | `scripts/gate-check.sh:90-92,101-116,124-128` | AC11, AC12, AC13 | pass |
| L22: catch-up merges, edits inside merges | net diff from merge-base `:101-116`, freshness `:118-138` | AC4-AC8 | pass |
| L17: post-deploy record | `scripts/gate-check.sh:90-91` (this task id only) | AC9, AC10 | pass |
| gate.yml privilege boundary / token | `.github/workflows/gate.yml:7,10-14,30-33,48-50,84-91` | AC23, AC24 (static) | pass |

## Findings

### F1 (round 1, HIGH): fixed, verified

`scripts/gate-check.sh:170` now classifies a push as "same" only when its tip is a known commit AND its net protected
diff equals HEAD's; every other push (other content, unknown tip, `ERR`) is "different" and sets `LAST_DIFF` (`:171`).
Push time = earliest same push strictly after the latest different one (`:174-178`); label must be strictly later
(`:184`). Invariant this gives: the last push before the label and every push after it carried exactly the protected
content that merges. Brief rule 2 amended (`tasks/4b/TASK_BRIEF.md` F1-fix entry) and header updated (`:35-45`).

Re-tried on scratch fixtures (temp repos, `--base main`, the branch's script, no network):

| Variant | Pushes / label | Result |
|---------|----------------|--------|
| A: reset + force push of the old tip `GS` | `10:00 GS2`, label 10:05, `10:10 GS` | FAIL label older (qa test, and mine) |
| B: fast-forward "ours" merge with `GS`'s tree | `10:00 GS2`, label 10:05, `10:10 M` | FAIL label older |
| Exact old SHA force-pushed back (E, S, E) | `10:00 E`, `10:02 S`, label 10:05, `10:10 E` | FAIL label older (push time 10:10) |
| Same, label between E and S | label 10:01 | FAIL label older |
| E, S recorded, return push to E not yet recorded | `10:00 E`, `10:02 S`, head E | FAIL push time could not be read |
| Label before the first push (label left on) | label 09:00, `10:00 E` | FAIL label older |
| Catch-up merge of main that edits the PR's protected file, gates re-run | `10:00 H1`, label 10:05, `10:10 H2` | FAIL label older (fails safe, re-label needed) |
| Catch-up merge with an extra protected edit inside the merge commit | `10:00 H1`, label 10:05, `10:10 H2` | FAIL label older + both gates stale |
| Mode-only change (`chmod +x`) on a protected file after the label | `10:00 H1`, label 10:05, `10:10 H2` | FAIL label older |
| Same-second different + same push (unknown tip `000…`), head pushed in that second | label 10:05 | FAIL push time could not be read |
| Tabs, leading spaces, upper-case SHA in push lines | label 10:15 after last push | PASS (parsing only, correct) |
| Label time with two lines / trailing space | | FAIL label time could not be read |

Activity API ref filter checked read-only (`gh api --method GET repos/.../activity -f ref=...`): it matches the ref
exactly (prefix `refs/heads/chore/2e`, upper-case, glob, trailing `/` all return nothing), so pushes on another branch
can't be injected as "same" pushes. Timestamps are `YYYY-MM-DDTHH:MM:SSZ`, matching `TIME_RE` (`:142`).

### F2 (LOW, not blocking, pre-existing, for 4c): a re-run of an old `labeled` run ignores a later unlabel

`.github/workflows/gate.yml:87` takes `FRAMEWORK_CHANGE_APPROVED` from the event payload. A workflow re-run reuses the
original payload, so after the person removes the label, re-running the earlier `labeled` run (same head SHA) gives
`FRAMEWORK_CHANGE_APPROVED=1`; the label time comes from the API and is still the old `labeled` event, which is later
than the push time, so the check goes green again. The merged content is exactly what the person once labeled
(no content bypass), but a revocation by unlabeling can be undone without the person. The line is unchanged from
`main`, so not a 4b regression. Suggested (devops-cicd, 4c): in the read step, read the current labels
(`GET repos/$REPO/issues/$PR/labels`) and derive "label on now" from that, failing closed on a read error.

### F3 (INFO) other checks, no issue found

- **Push-time rule edge cases:** truncation of the activity history at the old end can only drop pushes before the
  last different one or make the push time later (safe). Extra or missing pushes before `D` don't matter. A push
  between the head-pin fetch and the activity read leaves a later different push → FAIL. Unknown tips can only make
  the push time later. Net diffs are computed against each tip's own merge-base with today's `main`, which doesn't
  move for an old tip as long as `main` only advances (protected).
- **Diff comparison:** `--no-ext-diff --no-textconv --no-color`, attributes come from the base checkout (main's
  `.gitattributes`, not the PR's). Binary files compare by abbreviated blob id, which git keeps unique among objects
  present, and both tips' blobs are present whenever the tip is known. Hardening idea only: `--full-index`.
- **Residual (accepted by design):** the rule assumes GitHub records every ref update in the activity log (pushes,
  force pushes, web/API commits) and that the person looks at the PR's current state when labeling; a push landing
  in the seconds before the person clicks the label is a human race no server-side check can close.
- **gate.yml:** still `pull_request_target` from the base branch, all six types (`:7-9`); one `actions/checkout`,
  pinned by SHA, no `ref:`, `persist-credentials: false` (`:30-33`); the PR head is only fetched and SHA-pinned, never
  checked out or executed; `gate-check.sh` runs from the base checkout (`gate.yml:91-92`). Permissions `contents: read`,
  `pull-requests: read` only (`:10-14`). `GH_TOKEN: github.token` only in the read step (`:50`); the Gate step gets
  no token. No `${{ }}` inside any `run:` block; PR-controlled values (`head.ref`, `head.repo.full_name`, number,
  SHA) go through `env:` and are double-quoted; `-f ref=` is URL-encoded by `gh`. Outputs are emptied first (`:57`);
  a failed read, a fork head (`:67`) or HEAD missing after 6 tries leaves inputs that FAIL whenever protected paths
  changed. Base guard (`main` only) kept.
- **Freshness (S5, L17, L22):** net code diff at G == at G^1 == at HEAD, decision files diffed separately and
  counted as code; any `ERR` → stale; gate commit must be in `MB..HEAD`; `post-deploy.md` excluded for this task id
  only; the protected-path listing now FAILs on a git error (`:144-145`). No stale-gate bypass found.
- **Standing `SUPABASE_*` check:** the only `secrets.SUPABASE_*` reads are in `.github/workflows/drift.yml`
  (`:43-45,66-68,74-75`); `ci.yml:61` names `NEXT_PUBLIC_SUPABASE_*` local-stack values, not secrets, and is
  unchanged. gate.yml uses no stored secret.

## Automated results

- Scratch fixtures above: all bypass attempts FAIL, the legitimate label PASSes.
- Activity API (read-only GETs): exact ref matching confirmed.
- Secret pattern scan of the diff (tokens, keys, JWTs, private keys, passwords): no hits. gitleaks is not installed on
  this machine; verify.sh's secret scan ran in `verify.sh: PASS 19/19` (orchestrator, this HEAD).
- `npm audit`: not applicable, no dependency change.
- Supabase advisors / RLS: not applicable, no database change (verify.sh's static RLS check passed).
- `npx vitest run tests/integration/gate-check.test.ts`: 85/85 on this HEAD (qa-test / orchestrator; not re-run).

## Before merge

The PR changes protected paths (`.github/workflows/gate.yml`, `scripts/gate-check.sh`), so it needs the person's
`framework-change-approved` label, applied after the last push. F2 goes to 4c.

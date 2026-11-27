# Task 4c: live checks AC29-AC31 (2026-11-27)

Run by the orchestrator on the throwaway PR #22 (branch `chore/9y-live-4c`, task 9y, no gate files on purpose),
closed without merging at 10:20:41Z; branches `chore/9y-live-4c` and `test/9y-side` deleted. Times are GitHub
server times or the PC clock (UTC), as noted. Runs: https://github.com/masterege96/AutomationTest/actions/workflows/gate.yml

## AC29 (label freshness, F2): pass

- Baseline, no label (run 45979147272): `FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label`.
- The person labeled at 10:08:02Z (issue event: actor masterege96, type User). Run 45979509911 (10:08:05Z):
  `PASS  pipeline/framework files changed, approved by the person (framework-change-approved label 2026-11-27T10:08:02Z, ...)`.
- The person removed the label at 10:11:37Z. `gh run rerun 45979509911` (attempt 2, finished 10:12:05Z):
  `current labels: 0` and `FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label`.

## AC30 (spoof, S14): pass; GitHub did not count the spoof

- Commit f7d5f57 (pushed 10:12:31Z) added `.github/workflows/x.yml`: `pull_request` job `merge-gate`, `permissions: {}`,
  no secrets, `sleep 60`.
- main's gate (run 45980138241, completed 10:12:50Z, failure):
  `FAIL  merge-gate spoofing: .github/workflows/x.yml: job id 'merge-gate' is a reserved check name`, plus the
  job-name and text-rule lines.
- Spoof job (run 45980138893, workflow `x`) completed success at 10:13:37Z, after the real gate.
- After verify (10:17:30Z), db-check (10:16:34Z) and secrets were green, `gh pr view 22 --json mergeStateStatus`
  at 10:17:39Z (PC clock): `BLOCKED`. Required checks on main: `verify`, `db-check`, `secrets`, `merge-gate`, each
  with `app_id` 15368 (GitHub Actions). Both merge-gate checks were from app 15368.
- Result: the later green spoof check did not unblock the PR; the real FAILURE still blocked it. Because both checks
  come from the same app, the app pin gives no protection here; 4c-app keeps its planned place.

## AC31 (retarget): pass

- Base changed to `test/9y-side` at 10:17:57Z: run 45980909657 failed at step "Only PRs into main can pass":
  `merge-gate only approves PRs into main (base is 'test/9y-side')`.
- Base back to main at 10:18:32Z: run 45980988777: `PASS  PR base is main (read from GitHub when the run started)`.
- Old-payload re-run: base changed to `test/9y-side` again at 10:19:48Z, then `gh run rerun 45980988777` (its
  payload says base main), attempt 3 finished 10:20:15Z: `current base: test/9y-side` and
  `FAIL  PR base is not main (GitHub reports 'test/9y-side'): merge-gate only approves PRs into main`.
  (Attempt 2 was cancelled by the edited-event run in the same concurrency group; re-run after it finished.)
- Base back to main at 10:20:26Z, then the PR was closed.

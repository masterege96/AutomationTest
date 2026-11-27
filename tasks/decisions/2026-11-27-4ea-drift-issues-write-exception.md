# Decision: drift.yml alone may keep `issues: write` under the merge-gate spoof rule B2 (option A)

- **Date:** 2026-11-27 (11:18 UTC)
- **Task:** 4ea (unblocks 4e, PR #23)
- **Who:** the person, in their own words (project thread, 11:18:04 UTC), replying to the orchestrator's
  "My recommendation is still A. Reply "A" or "B".": "good". The coordinator relayed that at 11:18:16 UTC the person
  also tapped "A: keep it, narrow exception" on a decision card ("A small gate PR first (needs your label) lets only
  drift.yml open issues, and only if it still never runs on PR code").
- **Source:** the project thread

## Context

The 4c stopgap (rule B2 in `scripts/gate-check.sh`) FAILs any new or changed workflow that grants write on checks,
statuses, issues, pull-requests, actions or security-events. 4e changes `.github/workflows/drift.yml`, which needs
`issues: write` to open the "drift" issue (the visible signal for ORCHESTRATOR stop rule 1). The 4c brief noted that
such a PR would need this decision (tasks/4c/TASK_BRIEF.md, AC19 amendment).

## Decision

Option A: a small gate PR (task 4ea, the person's `framework-change-approved` label) exempts exactly
`.github/workflows/drift.yml` from B2 for `issues: write` only, and only while that file can never run on PR code
(its triggers are only events that run from the default branch). Any other write scope, any PR-code trigger, or any
other file keeps failing as before. Option B (removing automatic drift issues) was not chosen.

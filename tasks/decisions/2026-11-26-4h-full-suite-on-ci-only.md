# Decision: full suite on GitHub CI only; the PC runs only the tests a change touches

- **Date:** 2026-11-26 (19:30:54 UTC)
- **Task:** 4 (all remaining step-4 work)
- **Who:** the person, in their own words (project thread, 19:30:54 UTC, as relayed verbatim by the coordinator):
  "full suite runs on github, pc only runs tests a change touches, one test job at a time, and githubs run must pass
  before any merge"
- **Source:** the project thread

## Decision

1. The full `scripts/verify.sh` suite runs on GitHub Actions (Linux), via a draft PR.
2. On the PC, only the tests for the files a change touches are run, one test job at a time across all worktrees
   and agents.
3. GitHub's run (`verify`, `db-check`, `secrets`) must pass on the final head before any merge. A PR is marked ready
   for the person's label only then, with both gate files committed after the last code change.

## Follow-up

`ORCHESTRATOR.md` (section 3, IN_REVIEW row) and the role contracts still say "`verify.sh` passes on your branch".
They need updating to match, in a later PR (protected files, the person's label). Tracked in `tasks/4/PLAN.md`.

# Decision: SUPABASE_* secrets stay repository-level until step 4 ends (accepted risk)

- **Date:** 2026-11-25 (20:50 UTC)
- **Task:** 4d (bootstrap-check S19 finding)
- **Who:** the person
- **Source:** the project thread, relayed by the coordinator
- **Status:** open until a later decision file contains the line `Closes decision: 2026-11-25-4d-supabase-secrets-accepted-until-step4.md`; at the latest before task 4i (template packaging) starts

## Decision

The production secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` stay as
**repository** secrets, and the `production` environment keeps no deployment-branch policy, until step 4 is done.
This is an accepted risk: any workflow on a branch pushed to this repo could read them.

## Conditions while it is open

1. No PR may add or change a workflow step that reads any `SUPABASE_*` secret outside `.github/workflows/drift.yml`.
   The security gate checks this on every step-4 PR.
2. `scripts/bootstrap-check.sh` reports the S19 findings as `ACCEPTED RISK` pointing to this file instead of FAIL,
   only while this file exists and no other file in `tasks/decisions/` contains its `Closes decision:` line.
3. Before 4i starts, the orchestrator asks the person to move the secrets into the `production` environment with a
   main-only branch policy and delete the repository secrets (steps in `tasks/4d/lessons.md` L4d.1), then records a
   new decision file with the `Closes decision:` line (this file is never edited after merge); bootstrap-check FAILs
   again if the secrets are still repository-level.

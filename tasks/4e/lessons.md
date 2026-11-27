# Lessons from task 4e

New lessons for this task go here as `## L4e.<n>. <title> (<status>)` (ORCHESTRATOR.md section 8).

## L4e.1. A workflow-level concurrency group can cancel a pending after-deploy drift run (fixed in 4e)

With `concurrency: {group: drift, cancel-in-progress: false}` at the workflow level (as on main, AC24), with the new
`check_run` trigger, every `Supabase Preview` completion (PR commits too) starts a run in that group before the job's
`if:` skips it. GitHub keeps at most one pending run per group and cancels the older pending one, so while a drift run
is in progress, a queued after-deploy run for main can be replaced by a later PR-commit run that only skips. Effect: a
missed after-deploy run (shown as cancelled); the nightly run still covers it. Fix options for a later task: move the
concurrency to the job (skipped jobs then never join the group), or a group expression that keeps PR check runs apart.
Fixed in 4e (orchestrator decision 2026-11-27, replacing AC24 for this point): the same block
(`group: drift`, `cancel-in-progress: false`) now sits on the `drift` job, so a run whose job `if:` skips it never
joins the group.

Also: the role file re-applies only the attributes a non-superuser role owner may change
(`login nocreatedb nocreaterole noinherit connection limit 3`); since PostgreSQL 16, `alter role ... nosuperuser`
(and `noreplication` / `nobypassrls` without those attributes) is refused for a non-superuser even when the value
doesn't change, so the others are set only at creation and asserted by the final check. AC28 should confirm on the
local stack that a second run succeeds as `postgres`.

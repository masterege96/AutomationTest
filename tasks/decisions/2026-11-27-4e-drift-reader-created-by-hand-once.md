# Decision: the person creates the read-only role drift_reader in production by hand, once

- **Date:** 2026-11-27 (11:46 UTC)
- **Task:** 4e (brief Q1; recorded on the 4ea branch so 4e's gate files stay fresh)
- **Who:** the person, in their own words (project thread, 11:46:57 UTC): "approved", replying to the orchestrator's
  open request "your one-line OK in your own words for creating drift_reader. It's needed only before you run the SQL
  after 4e merges." (asked first at 10:20 UTC as: "Do you approve creating the drift_reader role by hand, once, from
  the reviewed SQL file?").
- **Source:** the project thread

## Decision

After 4e merges, the person (never an agent, AGENT_RULES 12) runs `supabase/production/drift-role.sql` (the part above
its rollback section) once in the production Dashboard SQL editor, then sets the role's password and stores the
connection URL as the `production`-environment secret `SUPABASE_DRIFT_DB_URL`, following the steps in
`tasks/4e/TASK_BRIEF.md` "After merge" (including security gate conditions G1, `show log_statement;` first, and G2,
main-only deployment branches). This single hand change is the exception to "no hand changes in production"
(rules/database-and-deploy.md rule 4) for this role only; any later change to the role goes through a reviewed file
and a new decision.

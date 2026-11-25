-- Migration 1: init (Phase 0).
-- Intentionally no schema changes. The first real table waits until the deploy
-- path is connected and the drift check runs (rules/database-and-deploy.md rule 14).
select 1;

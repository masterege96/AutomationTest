# Board

| Id | Title | State | Owner |
|----|-------|-------|-------|
| 0 | Phase 0 bootstrap | DONE | git-release, devops-cicd |
| 1 | Default privileges baseline + revoke (drift incident) | DONE | db-architect, db-builder |
| 2c | verify.sh: database before project checks | DONE | devops-cicd |
| 2a | Revoke EXECUTE on future functions created by postgres (all schemas) from PUBLIC/anon/authenticated | VERIFYING (the person: read-only `pg_default_acl` check, `specs/2a/post-deploy.md`) | db-architect, db-builder |
| 2b | Security headers (next.config) + local/CI auth defaults (config.toml) + dashboard checklist | VERIFYING (the person: dashboard items 1-21, item 22 before any real user) | devops-cicd, qa-test |
| 2d | Post-deploy records for 2a, 2b, 2c | IN_REVIEW | git-release |

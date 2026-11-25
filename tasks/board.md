# Board

| Id | Title | State | Owner |
|----|-------|-------|-------|
| 0 | Phase 0 bootstrap | DONE | git-release, devops-cicd |
| 1 | Default privileges baseline + revoke (drift incident) | DONE | db-architect, db-builder |
| 2c | verify.sh: database before project checks | DONE | devops-cicd |
| 2a | Revoke EXECUTE on future functions created by postgres (all schemas) from PUBLIC/anon/authenticated | DONE | db-architect, db-builder |
| 2b | Security headers (next.config) + local/CI auth defaults (config.toml) + dashboard checklist | VERIFYING (the person: dashboard items 1-21, item 22 before any real user) | devops-cicd, qa-test |
| 2d | Post-deploy records for 2a, 2b, 2c | DONE | git-release |
| 2e | 2a close-out: production pg_default_acl check recorded | DONE | git-release |
| 3 | To-do pilot: email login + own todos (CRUD) | IN_REVIEW | db-builder, backend-dev, frontend-dev, qa-test, devops-cicd |

# Decisions

Decisions the person made. Newest last.

| Date | Decision | Who |
|------|----------|-----|
| 2026-11-25 | Merge approval: 0 required GitHub approvals; the required `gate` check (security-gate PASS + review APPROVE, written after the last code change) replaces it (L10). | the person (via the coordinator) |
| 2026-11-25 | Approved the framework-file fixes L1, L2, L3, L6, L8 (scripts/verify.sh, scripts/bootstrap-check.sh, rules/database-and-deploy.md, roles/README.md, roles/devops-cicd.md, roles/git-release.md) and the L10 edits (ORCHESTRATOR.md, roles/security.md, roles/code-reviewer.md, scripts/gate-check.sh), merged in PR #1. | the person (via the coordinator) |
| 2026-11-25 | Gate hardening (PR #2): merge approval moves to `merge-gate` in gate.yml on `pull_request_target` from main; pipeline/framework changes need the person's `framework-change-approved` label, which agents never apply (AGENT_RULES 18a); branch protection must not allow bypassing. | the person (via the coordinator) |
| 2026-11-25 | Drift secrets live in the GitHub Environment `production`, restricted to `main`; drift.yml uses `environment: production`. The person creates the environment and secrets. | the person (via the coordinator) |

# Task 3 post-deploy verification: to-do pilot (email-code sign-in, owner-only todos)

Author: git-release, 2026-11-25. Read-only evidence only; nothing in production was changed by an agent.

## Deploy

- PR #14 squash-merged as `89b1c2e` at 2026-11-25 18:46 UTC. Required checks on the PR (with the person's
  `framework-change-approved` label): `verify`, `db-check`, `secrets`, `merge-gate` all SUCCESS.
- Supabase GitHub integration check ("Supabase Preview") on `89b1c2e`: success.
- App code: no production app hosting exists yet (`PROJECT_CONTEXT.md`: production URL not decided), so the UI and
  `/api/todos` are not served to anyone. Only the database part is deployed.

## Production migration history

Read-only `list_migrations` (Supabase connector, project AutomationTests), 2026-11-25 ~18:50 UTC:

| Version | Name |
|---------|------|
| 20261125104017 | init |
| 20261125135502 | default_privileges_baseline |
| 20261125150215 | function_privileges |
| **20261125165117** | **create_todos** (this task) |

## Drift after deploy

Run 45678585136 (`workflow_dispatch`, `main` at `89b1c2e`): success, log `diff: 0 non-comment lines, sha256
e3b0c44298fc` (empty diff), "No drift.", no artifact. The column-level grants and the FK into `auth`, which
`specs/3/schema.md` section 10 flagged as possible tool noise, produced no drift lines.

## Open: read-only catalog check (optional, the person)

Agents may not run SQL against production. `specs/3/schema.md` section 10 lists four read-only `select`s with
expected results (RLS on and not forced, table ACL, column ACLs on `done`/`title`, four policies for `authenticated`,
the trigger function's ACL). The empty drift diff already says production matches the migrations; the person may run
them in the dashboard SQL editor for direct proof and paste the rows here.

## Acceptance criteria

- AC1-AC45, AC47, AC48: proven before merge on the local stack and in CI (`verify.sh: PASS 19/19 (0 skipped)`, 211
  unit/integration, 135 e2e/abuse, 163 pgTAP; `specs/3/security-gate.md` PASS, `specs/3/review.md` APPROVE).
- **Not yet proven in production** (no host; release lock AC46): every AC that needs a real user signing in on the
  deployed app. They are checked after the release checklist, on the chosen host.

## Release checklist (the person; AC46)

No real user signs in until every item is recorded in `tasks/decisions.md`. The full list with how-to is in
`tasks/3/TASK_BRIEF.md` ("orchestrator, 2026-11-25 (merged; release checklist for the person)"), items R1-R9:
hosting build env, SMTP, URLs, email templates with the code, Turnstile (task 3b), P1-revised (row 9 burst), P2, P4,
and the real-user run on the host.

## Result

**VERIFYING.** Database deployed and drift green. Task 3 moves to `DONE` only after the release checklist is recorded
and the real-user run on the host passes.

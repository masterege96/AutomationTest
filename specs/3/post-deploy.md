# Task 3 post-deploy verification: to-do pilot (email-code sign-in, owner-only todos)

Author: git-release, 2026-11-25. Read-only evidence only; nothing in production was changed by an agent.

## Deploy

- PR #14 (https://github.com/masterege96/AutomationTest/pull/14) squash-merged as `89b1c2e` at 2026-11-25 18:42:59 UTC.
  Final required checks (after the person added the `framework-change-approved` label): `verify`, `db-check`,
  `secrets`, `merge-gate` all SUCCESS. An earlier `merge-gate` run (45675569229, 18:29 UTC) failed only because the
  label was not on the PR yet; it re-ran green at 18:34 UTC once the label was added.
- Deploy: the Supabase GitHub integration check ("Supabase Preview") on `89b1c2e` succeeded at 18:43 UTC; it is the
  deploy path (no separate deploy workflow run exists).
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

Run 45678585136 (https://github.com/masterege96/AutomationTest/actions/runs/45678585136; `workflow_dispatch`,
`main` at `89b1c2e`): success, log `diff: 0 non-comment lines, sha256
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

No real user signs in until every item is recorded in `tasks/decisions.md`. The list is in `tasks/3/TASK_BRIEF.md`
("orchestrator, 2026-11-25 (merged; release checklist for the person)"), items R1-R10: hosting build env, SMTP, URLs,
email templates with the code, Turnstile (task 3b), P1-revised (row 9 burst, with its Pass / Burst-bound / Fail
outcomes), P2 (with its Fail action), P4, the real-user run on the host, and IP forwarding off / no secret API key.
The source of the P1-revised and P2 outcomes is `specs/3/threat-model.md` 4.5 and the devops-cicd "Production
checklist for the person" in the same brief; if they ever differ, the threat model wins.

## Result

**VERIFYING.** Database deployed and drift green. Task 3 moves to `DONE` only after the release checklist is recorded
and the real-user run on the host passes.

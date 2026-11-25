# Task 2a post-deploy verification: revoke EXECUTE on future functions created by postgres

Author: git-release, 2026-11-25. Read-only evidence only; nothing in production was changed.

## Deploy

- PR #10 squash-merged as `9f742a9` at 2026-11-25 15:32 UTC.
- Supabase GitHub integration check ("Supabase Preview") on `9f742a9`: success, completed 15:32:59 UTC.

## Production migration history (AC8)

Read-only `list_migrations` (Supabase connector, project AutomationTests), 2026-11-25 ~16:09 UTC:

| Version | Name |
|---------|------|
| 20261125104017 | init |
| 20261125135502 | default_privileges_baseline |
| **20261125150215** | **function_privileges** (this task) |

## Drift after deploy (AC8)

- Run 45647204820 (`workflow_dispatch`, `main` at `9f742a9`, 15:37 UTC): success, log
  `diff: 0 non-comment lines, sha256 e3b0c44298fc` (empty diff), "No drift.", no artifact.
- Run 45651393581 (`workflow_dispatch`, `main` at `af59b2d`, 16:09 UTC): success, log
  `diff: 0 non-comment lines, sha256 e3b0c44298fc` (empty diff), "No drift.", no artifact.
- Per `specs/2a/schema.md` section 7, the diff engine very likely compares the global default-ACL row as well, but
  that is not proven by a run, so AC8 does **not** rest on the drift check alone.

## Required read-only production check (AC8, schema.md section 7): PASS, run by the person

Agents may not run SQL against production, not even a `SELECT` (`rules/database-and-deploy.md` rule 4 forbids
`execute_sql` there), so this item is the person's. In the Supabase dashboard SQL editor, run only these two
read-only statements and paste the rows (they hold no secret) into this file or the PR:

```sql
select defaclrole::regrole, defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 0 and defaclrole = 'postgres'::regrole;
-- expected: exactly one row: postgres | f | {postgres=X/postgres}

select defaclnamespace::regnamespace, defaclacl
from pg_default_acl
where defaclrole = 'postgres'::regrole and defaclobjtype = 'f' and defaclnamespace <> 0
order by 1;
-- expected: public | {postgres=X/postgres}; record every row
```

Security's rule: any per-schema row other than `public` and `storage`, or a `storage` row that differs from local
(`{postgres=X, anon=X, authenticated=X, service_role=X}`), goes to security before the task is marked done.

### Result of the check (the person, 2026-11-25 ~16:30 UTC, dashboard SQL editor, SELECT only)

Relayed to git-release by the orchestrator from the person's screenshots:

| Query | Rows | Matches |
|-------|------|---------|
| 1 (global, `defaclnamespace = 0`) | `postgres | f | {postgres=X/postgres}` (exactly one row) | yes, expected value |
| 2 (per-schema, `postgres`, functions) | `public | {postgres=X/postgres}`; `storage | {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | yes: `public` as expected; `storage` matches local; no other schema |

Security's rule is met (no row other than `public` and `storage`, and `storage` matches local), so nothing goes to
security.

## Acceptance criteria

- AC1-AC7: proven before merge (pgTAP `supabase/tests/02_function_privileges_test.sql` in CI `db-check`, security
  gate PASS, review APPROVE; see `tasks/2a/TASK_BRIEF.md`).
- AC8: migration in production history **yes**; default drift run green **yes**; read-only `pg_default_acl`
  check **PASS** (run by the person 2026-11-25 ~16:30 UTC, rows below).
- No user-facing feature: the behavior (anon/authenticated can't call new functions without an explicit grant) is
  proven by the pgTAP test, not by a real-user action.

## Result

**DONE.** Migration in production history, drift green on the diff content, and the read-only `pg_default_acl`
check matches (run by the person, 2026-11-25). Nothing open.

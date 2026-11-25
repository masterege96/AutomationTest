Result: PASS

# Task 1 security gate: default privileges baseline + revoke TRUNCATE/TRIGGER/REFERENCES/MAINTAIN

Author: security, 2026-11-25. Fresh context (no builder context); judged from the repo, the local stack and
`git diff origin/main...HEAD` on branch `db/1-default-privileges` (commit 535539d).
No Supabase cloud/production access was used.

## Scope reviewed

- `supabase/migrations/20261125135502_default_privileges_baseline.sql` (22 lines)
- `supabase/tests/01_default_privileges_test.sql` (12 assertions)
- Context: `tasks/1/TASK_BRIEF.md`, `specs/1/schema.md`, incident report (PR #6, `tasks/incidents/2026-11-25-drift.md`),
  `tasks/decisions.md` (2026-11-25 drift entry), `tasks/lessons.md` L15.

No app code, routes, env vars, uploads, LLM use or client code changed. Only baseline rows 14 and 2 apply.

## Baseline rows

| Row | Control (file:line) | Abuse test (test name) | Result |
|-----|---------------------|------------------------|--------|
| 14 Query your database | `supabase/migrations/20261125135502_default_privileges_baseline.sql:12-13` (REVOKE ALL ON TABLES from anon, authenticated), `:21-22` (REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE from anon, authenticated), `:6-7` (sequences), `:9-10` (functions) | `supabase/tests/01_default_privileges_test.sql:16` "anon: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on a new table"; `:20` "authenticated: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on a new table"; `:14` / `:18` "... no SELECT/INSERT/UPDATE/DELETE on a new table"; `:33-36` sequence tests | PASS (12/12 locally; see negative control below) |
| 2 IDOR | No table exists yet; nothing granted by default, so a future table is unreachable for anon/authenticated until a migration grants explicitly (convention in `specs/1/schema.md`, "Convention for every later task"). RLS rule unchanged. | Same tests as row 14 (a new table is not readable by anon/authenticated) | PASS (no regression; real IDOR tests arrive with the first table) |

## Checks

### Part A is exactly production (no extra privileges)

`diff` of the 12 `ALTER DEFAULT PRIVILEGES` lines in the incident report (PR #6) against migration lines 6-17:
**identical**, byte for byte, same order. Part A grants nothing that production does not already have; the only
GRANTs (lines 15-17) are the four non-DML privileges production already gives, and lines 15-16 are revoked again
by Part B (lines 21-22).

### Part B and service_role

Lines 21-22 revoke `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` on future tables from `anon` and `authenticated`.
`service_role` keeps `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` (line 17), as production has it and as the person
chose (`tasks/decisions.md`, 2026-11-25). Acceptable: service_role is a server-only key that already bypasses RLS.

### Resulting default ACL (local stack after `supabase db reset`)

```
postgres|public|r|{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}
postgres|public|S|{postgres=rwU/postgres}
postgres|public|f|{postgres=X/postgres}
```

Least privilege for the API roles: anon and authenticated get nothing on future tables, sequences or functions
created by `postgres` in `public`. Live check in a rolled-back transaction: `set role anon; truncate public.<new table>`
and `set role authenticated; select * from public.<new table>` both fail with `permission denied`.

### PUBLIC EXECUTE on functions (follow-up, acceptable for now)

Confirmed: a function created by postgres in public has `proacl = NULL` (built-in default) and
`has_function_privilege('anon', ..., 'EXECUTE') = true`, because Postgres grants EXECUTE to PUBLIC and a per-schema
default ACL cannot remove a global built-in default. **Acceptable for this task**: it is not part of the drift,
production has the same behavior, no functions exist in `public`, and it is not a regression. **Required before the
first function in `public`** (especially any `SECURITY DEFINER` function): either a follow-up task adding
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` (needs the
person's decision, it will show as drift until deployed), or each function migration revokes EXECUTE from PUBLIC
and grants only to the intended role. The threat model for that task must check this.

### Production effect

- Only `ALTER DEFAULT PRIVILEGES`: affects objects created later. No CREATE, DROP, ALTER TABLE, DELETE, UPDATE
  or TRUNCATE statement; no existing object's grants change; no data touched. Local `public` has 0 relations.
- Idempotent: applying the migration twice more in a transaction left `pg_default_acl` unchanged (0 changed rows).
- On production, Part A is a no-op (already production's state); Part B removes four privileges for future tables
  from anon/authenticated only. Rollback = a new migration re-granting them. Not destructive.

### verify.sh "destructive" FAIL: false positive

`bash scripts/verify.sh --brief tasks/1/TASK_BRIEF.md` -> `FAIL 1/18 failed: destructive statements need approval
(1 skipped)`. The only failing check flags migration lines 15, 16, 17, 21, 22 (`TRUNCATE` as a **privilege name**
inside `GRANT`/`REVOKE ... ON TABLES`) and line 20 (a comment). The regex in `scripts/verify.sh:128` matches the
bare word `truncate`. None of these lines is a `TRUNCATE` statement; nothing is dropped, renamed, deleted or
truncated. **Security verdict: false positive, not a destructive change** (lessons L15). No backup step is needed.
Adding the `destructive-approved` label as a reviewed override for this PR is safe from a security standpoint;
the decision and the label are the person's (AGENT_RULES 18a). All other 17 checks PASS.

### The test proves the abuse case and fails without the migration

Negative controls, each run in a rolled-back transaction on the local stack:

- Local-image defaults restored (no migration effect): **8 of 12 fail**, including tests 1-4 (anon/authenticated
  table privileges) and 7-9 (sequences).
- Production state (Part A only, Part B undone): **tests 2 and 4 fail** ("anon/authenticated: no
  TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on a new table"). So the test pins Part B specifically.
- With the migration: `supabase test db` -> Files=2, Tests=15, PASS.

`has_table_privilege(role, t, 'A, B, C')` is true if **any** listed privilege is held, so `not has_table_privilege(...)`
correctly asserts none is held. Minor, non-blocking: tests 10-12 only check that default ACL rows exist (not their
contents); the behavioral tests 1-9 cover the contents. Function EXECUTE is deliberately not asserted (documented in
schema.md, test list item 6).

### Other observation (informational, out of scope)

The local stack also has `supabase_admin` default ACLs in `public` granting anon/authenticated `arwdDxtm` on tables
(and `rwU`/`X` on sequences/functions) created **by supabase_admin**. Migrations run as `postgres`, so this task's
controls apply to everything we create. Objects created in `public` by extensions or the platform as
`supabase_admin` would still get API-role access; future threat models should keep extensions out of `public`.

## Automated results

| Check | Result |
|-------|--------|
| Secret scan | verify.sh basic pattern scan PASS; gitleaks not installed locally (CI runs it on every push). Diff contains no keys or env files. |
| `npm audit --audit-level=high` | found 0 vulnerabilities |
| Supabase security advisors | Not run: this gate was limited to the local stack (no cloud access). No tables or functions are created, so no new advisor findings are possible from this diff. |
| RLS check (verify.sh) | PASS (no tables created) |
| `supabase test db` | PASS (Files=2, Tests=15) |
| verify.sh | 17/18 PASS; the 1 FAIL is the L15 false positive above |

## Manual diff review

| Item | Finding |
|------|---------|
| Server-side authorization on new routes | N/A, no routes |
| Client-trusted values | N/A |
| Raw SQL from strings | None (static migration SQL only) |
| `dangerouslySetInnerHTML` | None (verify.sh PASS) |
| New env vars reaching the client | None |
| LLM output used without checks | N/A |
| Uploads | N/A |

## Follow-ups (not blocking)

1. Revoke EXECUTE on future functions in `public` from PUBLIC, or a per-function rule, before the first function (owner: db-architect; security signs off).
2. Fix the verify.sh destructive regex (L15 option b; owner: devops-cicd; needs `framework-change-approved`).
3. Keep extensions out of `public` (supabase_admin default ACL above).

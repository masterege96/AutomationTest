# Task 1 schema spec: default privileges in `public`

Author: db-architect, 2026-11-25. Input: `tasks/incidents/2026-11-25-drift.md`, the person's decision of
2026-11-25 ("baseline + revoke TRUNCATE etc.").

## Scope

Default privileges only: what roles get on tables, sequences and functions that role `postgres` creates
in schema `public` **in the future**. No tables, columns, RLS policies, indexes, storage or data change.
Sections 1, 2, 5, 6 and 7 of the db-architect template are N/A for this task (no objects are created).

## Why

Production's defaults are stricter than the local/CI image (incident report). A database built from the
repo must match production, or tests pass where production fails. On top of that, the person decided that
the API roles `anon` and `authenticated` must not get `TRUNCATE`, `TRIGGER`, `REFERENCES` or `MAINTAIN` on
future tables: `TRUNCATE` ignores RLS, and the others aren't needed by the Data API.

## Part A: baseline (match production exactly)

These are the 12 statements from the drift diff, unchanged, in the same order. Each one is idempotent.

| # | Statement (for role `postgres`, schema `public`) | Why |
|---|---|---|
| A1 | `REVOKE ALL ON SEQUENCES FROM anon` | Production default: no sequence access for anon |
| A2 | `REVOKE ALL ON SEQUENCES FROM authenticated` | Same, for signed-in users |
| A3 | `REVOKE ALL ON SEQUENCES FROM service_role` | Same, for the service role (as in production) |
| A4 | `REVOKE ALL ON FUNCTIONS FROM anon` | Production default: no EXECUTE on new functions for anon |
| A5 | `REVOKE ALL ON FUNCTIONS FROM authenticated` | Same, for signed-in users |
| A6 | `REVOKE ALL ON FUNCTIONS FROM service_role` | Same, for the service role |
| A7 | `REVOKE ALL ON TABLES FROM anon` | Production default: no table access for anon |
| A8 | `REVOKE ALL ON TABLES FROM authenticated` | Same, for signed-in users |
| A9 | `REVOKE ALL ON TABLES FROM service_role` | Same, for the service role |
| A10 | `GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO anon` | What production still grants (removed again in B1) |
| A11 | `GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO authenticated` | Same (removed again in B2) |
| A12 | `GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO service_role` | Production state, kept as the person asked |

Part A is kept verbatim (rather than folded into Part B) so it's traceable to the incident: anyone can
compare it line by line with the drift diff.

## Part B: least privilege for the API roles

| # | Statement (for role `postgres`, schema `public`) | Why |
|---|---|---|
| B1 | `REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES FROM anon` | `TRUNCATE` bypasses RLS; anon never needs these |
| B2 | `REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES FROM authenticated` | Same for signed-in users; the Data API needs only SELECT/INSERT/UPDATE/DELETE, granted per table |

`service_role` keeps `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` on future tables (production state; it's a
server-only key that already bypasses RLS). Revoking it is a separate decision if ever wanted.

## Resulting default privileges (role `postgres`, schema `public`)

| Object | anon | authenticated | service_role |
|---|---|---|---|
| Tables | none | none | MAINTAIN, REFERENCES, TRIGGER, TRUNCATE |
| Sequences | none | none | none |
| Functions | none | none | none |

Note: Postgres also grants `EXECUTE` on functions to `PUBLIC` by default. That is not part of the drift
and is not changed here; it means a new function is still executable by every role unless a migration
revokes it from `PUBLIC`. Security may want that in a later task (recorded as a follow-up below).

## Convention for every later task (db-architect, binding)

Because nothing is granted by default any more, every migration that creates a table, sequence or function
in `public` must:

1. enable RLS and add policies (unchanged rule),
2. **grant exactly the privileges the API needs**, for example
   `grant select, insert, update, delete on public.todos to authenticated;` (and usage on its sequence if
   it has one), and nothing to `anon` unless the brief says anonymous access is intended,
3. come with a pgTAP test that checks those grants.

## Production effect

When the Supabase integration applies the migration to production: Part A changes nothing (production
already has it). Part B removes four privileges from `anon` and `authenticated` for objects created later.
No existing object is affected (there are none in `public`), no data is touched, nothing is dropped.
Rollback: a new migration re-granting the four privileges. Not destructive.

## Test list for db-builder

Create inside the test transaction, as `postgres`: a table `public.t1_probe`, a sequence
`public.t1_probe_seq`, a function `public.t1_probe_fn()`. Then assert:

1. `anon` has none of SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on the table.
2. `authenticated`: same as 1.
3. `service_role` has TRUNCATE, REFERENCES, TRIGGER, MAINTAIN and has none of SELECT, INSERT, UPDATE, DELETE on the table.
4. `anon`, `authenticated`, `service_role` have no USAGE, SELECT or UPDATE on the sequence.
5. The default ACL rows exist in `pg_default_acl` for role `postgres` in `public` (tables, sequences, functions).
6. Function EXECUTE: not asserted for these roles, because of the `PUBLIC` default above (documented, not a test gap).

Then roll back.

## Follow-ups (not this task)

- Security: decide whether to revoke `EXECUTE` on future functions from `PUBLIC` in `public`.
- db-architect contract: add the explicit-grants convention above (lessons L14).

# Task 2a: Revoke EXECUTE on future functions in `public` from PUBLIC, anon and authenticated

| Field | Value |
|-------|-------|
| State | BACKLOG |
| Owner role | db-architect (spec), db-builder (migration, pgTAP test) |
| Branch | `db/2a-function-privileges` |
| Worktree | `../wt-2a-db-builder` |
| Depends on | 1 (default privileges baseline, `specs/1/schema.md` follow-up "revoke EXECUTE from PUBLIC") |

The person's request (relayed by the orchestrator; task 2 was split into 2a = part (a) and 2b = parts (b), (c)):

> "TASK 2: security groundwork, before any login feature. (a) a migration revoking EXECUTE on future functions in public from PUBLIC, anon and authenticated (alter default privileges), with a pgTAP test; (b) security headers in next.config (CSP, X-Frame-Options/frame-ancestors, Referrer-Policy, X-Content-Type-Options, Permissions-Policy), plus a test that checks them; (c) auth defaults in supabase/config.toml for local and CI: minimum password length 10+, email confirmations on, rate limits, OTP expiry. Also a written checklist (in the brief's handoff) of the matching settings the person must set in the Supabase dashboard for production, because the dashboard isn't managed by migrations (custom SMTP, rate limits, CAPTCHA)."

## Goal

A function that a migration creates in schema `public` later on can't be called by `anon` or `authenticated`
(through the Data API / RPC or SQL) unless that migration grants `EXECUTE` explicitly. The database built from
`supabase/migrations` and production behave the same way.

## Acceptance criteria

- [ ] AC1: Given the migrations applied to an empty database (`npx supabase db reset`), when the default privileges for functions created by role `postgres` are inspected (`pg_default_acl`), then they give no `EXECUTE` on new functions in `public` to `PUBLIC`, `anon` or `authenticated`.
- [ ] AC2 (unhappy path): Given a function created in `public` by `postgres` inside a pgTAP test transaction, with no explicit grant, when `has_function_privilege` is checked for `anon` and for `authenticated`, then both are `false`; and when the test switches to role `anon` (and then `authenticated`) and calls the function, the call fails with a permission-denied error.
- [ ] AC3: Given the same probe function, when the migration owner grants `EXECUTE` on it to `authenticated` explicitly, then `authenticated` can call it and `anon` still can't (explicit grants still work; the convention from `specs/1/schema.md` holds).
- [ ] AC4: The task 1 assertions still pass unchanged (`supabase/tests/01_default_privileges_test.sql`), and the function-EXECUTE gap noted in task 1 (AC4 / schema.md test item 6) is now asserted instead of documented.
- [ ] AC5: The change is one new migration created with `npx supabase migration new <what>`; no migration that exists on `main` is edited; applying it twice changes nothing (idempotent); it creates no tables, functions or data.
- [ ] AC6: `schema.md` states which schemas and which creator role(s) the change affects, and whether any existing function (in `public` or elsewhere) changes (expected: none in `public`; migrations define no functions today). If the effect reaches beyond `public` (see Questions), schema.md lists what else is affected and security signs it off in the threat model.
- [ ] AC7: `bash scripts/verify.sh --brief tasks/2a/TASK_BRIEF.md` passes (DB reset, `npx supabase test db`, `npx supabase db lint`); security gate PASS; review APPROVE; CI green.
- [ ] AC8 (after the person merges): the Supabase integration applies the migration; production migration history shows it (read-only check) and a default drift run is green.

## Security rows that apply

Security confirms and fills in the abuse tests during Design.

- [ ] Row 14 (query your database): least privilege for API roles; abuse test: (security fills in; expected AC2)
- [ ] Row 1 (`/admin`): flagged for security to confirm: a later `security definer` or admin function must not be callable by `anon`/`authenticated` by accident; abuse test: (security fills in, or marks it not applicable to this task)

## Scope

**Allowed paths**

```
supabase/migrations/**
supabase/tests/**
specs/2a/**     # schema.md (db-architect), threat-model.md + security-gate.md (security), review.md (code-reviewer)
```

**Out of scope:**
- Any table, sequence, RLS policy, function body or seed data (no objects created outside the test transaction).
- Grants on existing objects, and default privileges for tables and sequences (task 1 covers them).
- Security headers, `next.config.*`, `supabase/config.toml` and auth settings (task 2b).
- Login UI, API routes, app code.
- Production: no dashboard, SQL editor or `execute_sql`/`apply_migration` by agents (AGENT_RULES §4); production changes only via the merged migration.

## Inputs

- Spec files: `specs/2a/schema.md` (db-architect), `specs/2a/threat-model.md` (security)
- Other: `specs/1/schema.md` ("Note" under resulting default privileges, test item 6, Follow-ups); `supabase/migrations/20261125135502_default_privileges_baseline.sql`; `supabase/tests/01_default_privileges_test.sql`; `tasks/1/TASK_BRIEF.md` AC4; `tasks/lessons.md` L14, L15; `rules/security-baseline.md` row 14.

## Destructive change?

- [x] No. `REVOKE ... EXECUTE` in default privileges only affects functions created later; no data, no drop, rename or truncate, and no existing object changes. Rollback is a new migration re-granting it. Note: verify.sh's destructive scan may flag privilege keywords (L15).
- [ ] Yes: step 1 (stop using it) is task ___; step 2 (drop) is this task. Backup step: ___. Person approved on: ___

## Questions for the person

1. **"In public" vs. all schemas.** task 1's AC4 records that Postgres grants `EXECUTE` on functions to `PUBLIC` through the global defaults, which per-schema (`IN SCHEMA public`) default privileges can't remove. If that holds, revoking it from `PUBLIC` likely means a default-privilege change for role `postgres` that applies to functions it creates in **every** schema, not only `public`. Is that acceptable? Or should it stay limited to `public` (which may mean an explicit per-function revoke convention instead)? db-architect confirms the technical facts in schema.md; the person decides the scope. Until then, AC1 to AC3 are written for `public` only.
2. **Which creator roles.** The request names no role. Task 1 changed defaults only for role `postgres` (the migration owner). Is `postgres` alone enough, or must functions created by other roles (for example ones Supabase uses for extensions) be covered too?

---

## Handoff (each role appends; never delete earlier entries)

### product-spec, 2026-11-25

- **Changed:** `tasks/2a/TASK_BRIEF.md`, `tasks/board.md` (row 2a added).
- **Verified:** read `specs/1/schema.md`, the task 1 migration and test, `rules/security-baseline.md` rows 9, 11, 14. `grep` finds no function definitions in `supabase/migrations/`.
- **Left to do:** person answers the Questions; db-architect writes `specs/2a/schema.md`; security writes `specs/2a/threat-model.md`; orchestrator sets SPEC_READY.
- **Next role must know:** the drift check compares schema `public` only; db-architect should state whether a default-privilege change that isn't tied to a schema shows up in the drift diff and in production as expected.

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

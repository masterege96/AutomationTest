# Task 1: Default privileges baseline + revoke TRUNCATE/TRIGGER/REFERENCES/MAINTAIN

| Field | Value |
|-------|-------|
| State | DONE |
| Owner role | db-architect (spec), db-builder (migration, tests) |
| Branch | `db/1-default-privileges` |
| Worktree | none (repo root; single builder, no parallel work) |
| Depends on | 0 (Phase 0), incident `tasks/incidents/2026-11-25-drift.md` (issue #4) |

## Goal

A database built from `supabase/migrations` has the same default privileges in `public` as production,
and future tables in `public` no longer give `anon` or `authenticated` `TRUNCATE`, `TRIGGER`, `REFERENCES`
or `MAINTAIN`. After the Supabase integration applies the migration, the drift check is green.

## Acceptance criteria

- [ ] AC1: One migration (`supabase migration new default_privileges_baseline`) contains the 12 default-privilege statements that match production exactly (incident report), unchanged.
- [ ] AC2: The same migration revokes `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` on future tables in `public` (role `postgres`) from `anon` and `authenticated`. `service_role` keeps what production has.
- [ ] AC3: The migration is idempotent (applying it again changes nothing) and creates no tables.
- [ ] AC4: A pgTAP test creates a table, a sequence and a function inside the test transaction and asserts: `anon` and `authenticated` have no privileges on the table or sequence; `service_role` has exactly `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` on the table and nothing on the sequence. Function EXECUTE is not asserted: Postgres grants it to `PUBLIC` by default, which per-schema default privileges can't remove (schema.md test item 6; follow-up for security). (Reworded 2026-11-25 after review F1.)
- [ ] AC5: `verify.sh` passes; security gate PASS; review APPROVE; CI green.
- [ ] AC6 (after merge, the person merges): production migration history shows both migrations (read-only check) and a default drift run is green; issue #4 closed.

## Security rows that apply

- [ ] Row 14 (query your database): least privilege for API roles on future tables; abuse test = AC4 (anon/authenticated can't TRUNCATE a new table).
- [ ] Row 2 (IDOR): unaffected now; future tables must grant explicitly and keep RLS (see schema.md).

## Scope

**Allowed paths**

```
supabase/migrations/**
supabase/tests/**
specs/1/**
```

**Out of scope:** any table, RLS policy or app code; changes to existing objects' grants; production (never written by agents).

## Inputs

- `tasks/incidents/2026-11-25-drift.md` (the 12 statements)
- `tasks/decisions.md` 2026-11-25 entry (the person chose baseline + revoke; stop rule 1 lifted for this fix only)

## Destructive change?

- [x] No (privilege changes for objects not yet created; no data, no drop/rename). Note: verify.sh's destructive scan matches the word `TRUNCATE` in privilege lists (see Handoff / lessons).
- [ ] Yes

---

## Handoff (each role appends; never delete earlier entries)

### db-architect + db-builder, 2026-11-25

- **Changed:** `specs/1/schema.md`; `supabase/migrations/20261125135502_default_privileges_baseline.sql` (Part A: the 12 production statements; Part B: revoke the four from anon/authenticated); `supabase/tests/01_default_privileges_test.sql` (12 assertions).
- **Verified:** `verify.sh: FAIL 1/18 failed: destructive statements need approval (1 skipped)`: only the false positive in L15; DB reset, `supabase test db` (Files=2, Tests=15, PASS) and SQL lint pass. Re-applying the migration on the local DB leaves `pg_default_acl` unchanged (idempotent). Resulting default ACL for postgres in public: tables `service_role=Dxtm` only, sequences and functions owner only.
- **Left to do:** security gate, review, PR, CI. The destructive check needs the person's decision (L15). After merge: the integration applies it; read-only migration list; default drift run green; close #4.
- **Next role must know:** from now on every new table/sequence/function in public needs explicit GRANTs (schema.md convention). No `types/database.ts` regeneration needed (no tables).

### git-release, 2026-11-25 (post-deploy, task moved to DONE on the orchestrator's instruction)

- **Deploy:** PR #7 squash-merged as 5fcb5ba at 14:22 UTC; the Supabase integration check on 5fcb5ba: success.
- **Production migration history (read-only):** `20261125104017 init`, `20261125135502 default_privileges_baseline`.
- **Drift after deploy:** run 45634163709 on 5fcb5ba, `diff: 0 non-comment lines`, "No drift.", no artifact. Issue #4 closed.
- **Acceptance:** AC1-AC5 met (PR #7 gates and CI); AC6 met (history + green drift). There is no user-facing feature to test as a real user; the behavior (anon/authenticated get nothing on new tables) is proven by `supabase/tests/01_default_privileges_test.sql` and the security gate's live check.
- **Note:** the post-deploy record lives here instead of `specs/1/post-deploy.md`, because a commit under `specs/1/` would count as a code change and make the task's gates stale in `gate-check.sh` (lessons L17).

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

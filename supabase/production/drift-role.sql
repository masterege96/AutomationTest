-- drift_reader: the read-only login role of the drift check (.github/workflows/drift.yml, task 4e, L13).
--
-- Who runs it: the person, once, in the production Supabase Dashboard SQL editor (paste everything above
-- the rollback section and run it). Agents never run this file against production (AGENT_RULES 12);
-- devops-cicd runs it only against the local stack (task 4e AC28).
--
-- Why this is not a migration:
-- 1. The deploy path would apply a migration to production automatically, and every local reset, CI
--    db-check and preview branch would create a login role.
-- 2. A migration can't hold the password (AGENT_RULES 14), so a manual step remains anyway.
-- 3. Roles are cluster-level and not part of the drift-checked `public` diff, so a migration gains no
--    drift coverage, while any grant on a `public` object it made would itself be drift-checked.
-- 4. Once merged, a migration can never be edited, only superseded (rule 3).
--
-- What the role can do: log in and read the system catalog (what `supabase db diff` needs). It gets no
-- grants on objects in the diffed schemas, no role memberships and no table data access, so it shows up
-- in no `public` ACL or default privilege. Its sessions are read-only by default and time-limited.
--
-- Rerun-safe: creating the role is guarded by a pg_roles check; the settings are re-applied on every run;
-- the final check fails the run if the role has any attribute or membership it must not have.
--
-- The password is a separate step, never in this file:
-- make a 32+ character password of letters and digits only in the password manager, then run this line
-- as its own SQL editor query with the password typed in, and close that query without saving it:
--   alter role drift_reader with password '<typed in the SQL editor, never saved>';
-- Then put the same password into the production-environment secret SUPABASE_DRIFT_DB_URL
-- (Dashboard > Connect > Session pooler URL, with the user drift_reader.<project ref> and this password).
-- Alternative (task 4e Q2): psql's \password drift_reader, which hashes the password on the client.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'drift_reader') then
    create role drift_reader with
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls
      connection limit 3;
  end if;
end
$$;

-- Re-applied on every run (the attributes a non-superuser owner may change; the others are checked below).
alter role drift_reader with login nocreatedb nocreaterole noinherit connection limit 3;
alter role drift_reader set default_transaction_read_only = on;
alter role drift_reader set statement_timeout = '120s';

-- The only grant: connecting to the database (PUBLIC normally has it already; explicit so the role keeps it).
grant connect on database postgres to drift_reader;

-- Final check: fail loudly if the role is not what this file describes.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'drift_reader'
      and rolcanlogin
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolinherit
      and not rolreplication
      and not rolbypassrls
      and rolconnlimit between 1 and 3
  ) then
    raise exception 'drift_reader does not have the expected attributes, tell the orchestrator';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid = m.member
    where r.rolname = 'drift_reader'
  ) then
    raise exception 'drift_reader is a member of another role, tell the orchestrator';
  end if;
end
$$;

-- Rollback (every line is a comment, so running the whole file never drops anything).
-- To remove the role, run these lines without the leading comment marks, in this order:
-- select pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where usename = 'drift_reader';
-- revoke connect on database postgres from drift_reader;
-- drop role if exists drift_reader;
-- Then also delete the secret SUPABASE_DRIFT_DB_URL from the GitHub `production` environment.

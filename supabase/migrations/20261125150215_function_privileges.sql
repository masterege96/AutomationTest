-- Task 2a: no EXECUTE by default on functions and procedures that role postgres creates later, in any schema
-- (specs/2a/schema.md section 1; the person's answers Q1 = global, Q2 = role postgres only).
-- No IN SCHEMA: this writes the global default row (defaclnamespace = 0); resulting ACL {postgres=X/postgres}.
-- ON FUNCTIONS also covers procedures. Only affects objects created later; creates no objects, touches no data.
-- Idempotent. Every later function migration grants EXECUTE explicitly (schema.md section 5).
-- The anon and authenticated lines are no-ops today; kept on security's instruction to state the intent.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM "authenticated";

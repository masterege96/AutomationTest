# Decision: step 4 choices (4c, 4e, 4f, 4g, 4i)

- **Date:** 2026-11-25 (19:11 UTC)
- **Task:** 4 (`tasks/4/PLAN.md`)
- **Who:** the person, in their own words: "Yes, all five"
- **Source:** the decision card in the project thread, relayed by the coordinator

## Decision

1. **4c, merge-gate spoofing (S14):** ship the stopgap first (gate-check FAILs if any workflow at the PR head defines a
   job or check named `merge-gate`/`gate`), then the GitHub App approach: an app posts the `merge-gate` check run and
   branch protection pins the required check to that app. The person creates the app and stores its private key as a
   `production`-environment secret, following step-by-step instructions the orchestrator provides when it's time.
2. **4e, drift (L13):** the drift check uses a read-only database role, not an access token with the
   `database_write` scope.
3. **4f, production auth settings as code (L24):** `supabase/production/auth.json` (values, no secrets) and
   `scripts/prod-auth.mjs`, which the person runs (current -> new, confirm with "yes", re-read). The rules allow the
   **person** (never an agent) to run read-only verification `SELECT`s against production.
4. **4g, local database:** one shared local stack with a lock that builders take in turn; no per-worktree stacks.
5. **4i, packaging:** a separate GitHub template repository containing only the framework. The person creates the
   empty repository on GitHub when the orchestrator says it's ready and names it.

## Order

4a, 4b, 4d, 4h, then 4c-stopgap, 4e, 4f, 4g, 4c-app, 4i. PRs may run in parallel when they don't touch the same files.

# Role: backend-dev

**Mission:** Build the server side of a task (API routes, server actions, edge functions, business logic) so that the server, never the client, decides what is allowed and what things cost.

## When it runs
Build phase, after db-builder's migrations are in the branch (or in parallel against the agreed `schema.md`, in its own worktree).

## Owns (allowed paths)
```
app/api/**
lib/server/**
supabase/functions/**
middleware.ts
types/database.ts          # generated: supabase gen types typescript --local
**/*.test.ts next to the files above
```

## Never touches
- Migrations, UI components, CI, e2e/abuse tests.
- Never uses the service-role key in anything that can run in the browser. Never logs secrets, tokens or full request bodies with personal data.
- Production DB writes outside the app's normal code paths.

## Required inputs
- `TASK_BRIEF.md`, `specs/<id>/schema.md`, `specs/<id>/threat-model.md`.
- Migrations applied locally (`supabase db reset`).

## Outputs
- Route handlers / server actions / edge functions implementing the acceptance criteria.
- Input schemas (the validation library in `PROJECT_CONTEXT.md`, e.g. zod) for every endpoint.
- Unit tests next to the code for business logic.
- Handoff: the API contract (route, method, request schema, response shape, error codes) written into the brief for frontend-dev and qa-test.

## Rules
1. **Every endpoint, in this order:** authenticate → authorize (role/ownership, on the server) → validate input (schema, reject unknown fields) → act → return a consistent error format.
2. **Never trust the client** for price, total, discount, role, user id, owner id, status or "paid". Read them from the session and the DB.
3. Use the user's own Supabase client (RLS applies) by default. Use the service role only when the task needs to bypass RLS, in `lib/server/admin/**`, and do an explicit ownership check right there.
4. **Payments:** an order becomes paid only in the payment-provider webhook, after verifying the signature with the raw body. Webhook handlers are idempotent (store the event id; ignore repeats).
5. **Single-use actions** (redeem, invite accept, vote): one atomic DB operation guarded by a unique constraint or `update … where used = false returning`. Accept an `Idempotency-Key` header on payment-like endpoints.
6. **Uploads:** check size, then file type by magic bytes (not extension or `Content-Type`); store under the user's path in a private bucket; never serve user uploads as HTML.
7. **AI features:** the model gets only data this user may see; tool calls that change data go through the same authorization as a normal request; model output is treated as untrusted input; no secrets or other users' data in prompts.
8. **Auth endpoints:** rate limit login, OTP and password reset (per IP and per account).
9. No raw SQL built from strings. Use the query builder or parameterized RPCs.
10. Errors returned to the client never include stack traces, SQL or internal ids of other users.

## Security baseline rows owned
#1 (server authorization), #2 (ownership checks with service role), #4, #5 (API validation), #6, #7 (API side), #9 (implement limits), #10, #12.

## Done when (gate)
- `verify.sh` passes (typecheck, lint, unit tests, scope).
- Every applicable security row from the threat model has its control in code, listed with file paths in the handoff.
- API contract written in the brief.

## Hands off to
frontend-dev (API contract), qa-test (integration and abuse tests).

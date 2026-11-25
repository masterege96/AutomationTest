# Role: product-spec

**Mission:** Turn the person's request into a task brief that every other role can work from without asking questions.

## When it runs
- After Phase 0 is green, for every new request in `BACKLOG`.
- When a role bounces a task back for an unclear brief.

## Owns (allowed paths)
```
tasks/<id>/TASK_BRIEF.md     # Goal, Acceptance criteria, Scope, Inputs, Destructive sections
```

## Never touches
- Code, migrations, tests, specs owned by other roles.
- Never decides technical design (tables, endpoints, libraries). Describe *what*, not *how*.

## Required inputs
- The person's request (quoted in the brief).
- `PROJECT_CONTEXT.md`.

## Outputs
`tasks/<id>/TASK_BRIEF.md` from the template, with:
- **Goal:** what the user can do afterwards, in 1-2 sentences.
- **Acceptance criteria:** each one testable, written as Given/When/Then. Include the unhappy paths: wrong user, logged out, invalid input, duplicate action.
- **Out of scope:** what looks related but isn't part of this task.
- **Slices:** which roles are needed (DB? API? UI?) and the allowed paths for each, from the ownership map in `roles/README.md`.
- **Destructive?** Yes/no. If yes, the brief is split into two tasks (stop using it / drop it).
- **Open questions:** anything only the person can answer.

## Rules
1. If the request can be read two ways, write both readings and ask the person (`BLOCKED`). Don't pick silently.
2. One brief = one vertical slice small enough to review in one PR (guideline: under ~400 changed lines).
3. Every acceptance criterion must name an observable result (screen text, status code, DB row), not a feeling ("works well").
4. Flag every security-sensitive area for security: login, roles, money, uploads, AI, anything single-use.

## Security baseline rows owned
None directly. It must flag likely rows (e.g. "has payments → #4, #6") in the brief for security.

## Done when (gate)
- Every template section filled; no `TODO`.
- Every acceptance criterion has an observable result.
- No open questions left, or the task is `BLOCKED` on them.

## Hands off to
db-architect and security (Design). Orchestrator moves to `SPEC_READY` once their outputs exist.

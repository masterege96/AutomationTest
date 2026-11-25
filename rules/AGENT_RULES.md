# Agent rulebook

Every agent reads this file before doing anything, whatever its role.
Role contracts in `roles/` add to these rules; they never relax them.
If a role contract and this file disagree, this file wins. If this file and
the person disagree, the person wins, and the agent writes the decision into
`tasks/decisions.md`.

## 1. Before you start

1. Run `scripts/bootstrap-check.sh`. If it fails, stop. Only git-release and devops-cicd may work while Phase 0 is incomplete, and only on Phase 0.
2. Read, in this order: `AGENT_RULES.md` (this file), your role contract, `PROJECT_CONTEXT.md`, and the task brief you were given. Read the rulebooks your role contract links to.
3. Check that the task brief has every input your role contract requires. If anything is missing, set the task to `BLOCKED` with the missing item. Don't guess.
4. Work in the git worktree and branch named in the task brief. Never work on `main`.

## 2. Scope

5. Touch only the paths your role contract allows. `verify.sh` checks the diff against your allowed paths and fails the task if you go outside them.
6. If the task needs a change outside your scope, don't make it. Write a handoff note in the task brief for the role that owns it and set the task to `BLOCKED`.
7. Don't "improve" code you weren't asked to change: no drive-by refactors, renames or formatting of other files.
8. Don't add a dependency, tool or service that isn't in `PROJECT_CONTEXT.md`. Propose it in the handoff note instead.

## 3. Conventions: look, don't invent

9. Before writing code, find an existing example of the same thing in the repo and follow it. If there's none, follow `PROJECT_CONTEXT.md`. If that's silent, ask (`BLOCKED`).
10. Never invent commands, scripts, env vars, table names or API routes. If you didn't see it in the repo or the docs, it doesn't exist.
11. Use the pinned tool versions. Never run `@latest`, never upgrade a tool or package as a side effect.

## 4. Production and secrets (no exceptions)

12. **Never change production by hand.** No SQL editor, table editor, dashboard toggle, `execute_sql` or `apply_migration` against production, and no `db push` from your machine. Production changes only through migrations merged to `main` and applied by automation. See `rules/database-and-deploy.md`.
13. Database tools you're given for production are read-only. If a tool would let you write to production, don't use it for writing, and report that it's available.
14. **Never put a secret** (keys, passwords, tokens, connection strings) in a file, commit, log, test fixture, task brief, handoff note or chat. Refer to secrets by their env var name only.
15. If you see a secret anywhere it shouldn't be, stop and set the task to `BLOCKED` with "secret exposed: <where>". Don't try to clean git history yourself.

## 5. Git

16. One task, one branch, one PR. Branch names: `<type>/<task-id>-<short-name>` (types: `feat`, `fix`, `chore`, `db`, `ci`, `sec`, `test`).
17. Commit messages follow Conventional Commits (`feat:`, `fix:`, `db:` ...). Small, focused commits.
18. Never force-push to a shared branch, rewrite `main`, skip hooks (`--no-verify`) or disable a CI check.
19. Never edit a migration that has been merged. Fix it with a new migration.

## 6. Done means proven

20. A task is ready for review only when `scripts/verify.sh` passes on your branch. Paste its summary line into the task brief.
21. Never skip, delete, weaken or `.skip` a test to make it pass. If a test is wrong, say so in the handoff note; qa-test decides.
22. Never mark your own task `DONE`. Only the orchestrator does, after review, the security gate and post-deploy verification.
23. "Done" for anything that ships means production shows it: migration applied, drift check green, feature works for a real user.

## 7. Handoff

24. Finish every task by updating the task brief's **Handoff** section: what you changed (files), what you verified (commands and results), what's left, and anything the next role must know.
25. Assume the next agent has no memory of your conversation. If it isn't in the repo or the task brief, it's lost.
26. Write failures down. If you hit a convention you had to guess, a rule that was unclear, or a check that missed a bug, add it to `tasks/lessons.md`. That file is how the framework gets fixed.

## 8. When in doubt

27. Stop and ask (`BLOCKED`) instead of guessing when: the brief is ambiguous, the change is destructive (drop, rename, delete data), it touches auth, payments or permissions in a way the brief didn't describe, or it would need production access.

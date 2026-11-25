# Task <ID>: <title>

| Field | Value |
|-------|-------|
| State | BACKLOG |
| Owner role | |
| Branch | `<type>/<id>-<short-name>` |
| Worktree | `../wt-<id>-<role>` |
| Depends on | (task ids) |

## Goal

One or two sentences on what the user can do when this is finished.

## Acceptance criteria

Each one must be testable. qa-test writes at least one test per line.

- [ ] AC1:
- [ ] AC2:

## Security rows that apply

From `rules/security-baseline.md` (security fills this in during Design).

- [ ] Row #: abuse test:

## Scope

**Allowed paths** (verify.sh fails the task if anything else changes). Copy them
from the role's contract in `roles/`. One glob per line, `# comments` allowed,
a line starting with `!` excludes (e.g. `!app/api/**`). `tasks/**` is always allowed.

```
```

**Out of scope:** (things that look related but must not be touched)

## Inputs

- Spec files: `specs/<id>/schema.md`, `specs/<id>/threat-model.md`
- Other:

## Destructive change?

- [ ] No
- [ ] Yes: step 1 (stop using it) is task ___; step 2 (drop) is this task. Backup step: ___. Person approved on: ___

---

## Handoff (each role appends; never delete earlier entries)

### <role>, <date>

- **Changed:** (files)
- **Verified:** (commands run and the result, e.g. `verify.sh: PASS 9/9`)
- **Left to do:**
- **Next role must know:**

## Blocked (fill in only when BLOCKED)

- **Missing:**
- **Who must provide it:**

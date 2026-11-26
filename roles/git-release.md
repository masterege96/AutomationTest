# Role: git-release

**Mission:** Own the repository, branches, pull requests and releases, and prove every shipped change works in production.

## When it runs
- **Phase 0** (with devops-cicd): before any other role.
- **Per task:** creates the branch and worktree when a task enters `IN_PROGRESS`.
- **Ship:** after the security gate PASS and review APPROVE: merge, tag, and post-deploy verification.

## Owns (allowed paths)
```
.github/pull_request_template.md
.github/CODEOWNERS
CHANGELOG.md
package.json            # only the "version" field
specs/*/post-deploy.md
```
Repository settings (branch protection, merge settings): git-release documents the required settings (Outputs, Phase 0) and proposes changes; the person sets them (AGENT_RULES 18a). Creating the label set is fine; applying `destructive-approved` or `framework-change-approved` is the person's alone.

## Never touches
- App code, migrations, tests, CI workflows (devops-cicd owns `.github/workflows/**`).
- Production database or hosting settings. Never runs `db push`, never uses SQL write tools.
- Never merges with a red required check, never uses admin override, never force-pushes `main`.
- Never changes branch protection or other repository settings; it proposes, the person sets them (AGENT_RULES 18a).

## Required inputs
- Phase 0: repo URL (or the person's OK to create one with `gh repo create`), hosting type from `PROJECT_CONTEXT.md`.
- Ship: `security-gate.md` = PASS, `review.md` = APPROVE, all required checks green, `destructive-approved` label if the brief says destructive.

## Outputs
**Phase 0:**
- `main` protected (the person sets it; agents never change settings, AGENT_RULES 18a): PR required, 0 required approvals (approval is the `merge-gate` check, see ORCHESTRATOR.md "Merge approval"), required checks `verify`, `db-check`, `secrets`, `merge-gate`, "Do not allow bypassing" on, no force-push, no deletion, linear history.
- Labels: `destructive-approved`, `framework-change-approved`, `security`, `db`, `blocked`, `drift` (drift.yml opens issues with it). Creating labels is fine; applying `destructive-approved` or `framework-change-approved` is the person's alone.
- `.github/pull_request_template.md` with: task id, brief link, verify.sh summary line, security rows covered, destructive yes/no, rollback note.
- `CHANGELOG.md` (Keep a Changelog format) and `version` `0.1.0`.

**Per task:**
- Branch `<type>/<id>-<short-name>` and worktree `../wt-<id>-<role>` per builder; both written into the brief.

**Ship:**
- Squash-merge with a Conventional Commit title. CHANGELOG entry. Semantic version bump (`feat` → minor, `fix` → patch, breaking → major while ≥1.0) and tag `vX.Y.Z` when a release is cut.
- `specs/<id>/post-deploy.md`:
  - deploy run link and commit SHA
  - production migration history includes this task's migrations (`supabase migration list`, read-only)
  - drift check after deploy: green (judged on the diff content)
  - each acceptance criterion checked as a real user in production (what was done, result)

## Rules
1. One task, one branch, one PR. PR title = Conventional Commit.
2. Worktrees for parallel builders: `git worktree add ../wt-<id>-<role> -b <branch>`. Remove the worktree after merge.
3. If the branch conflicts with `main`, merge `main` into it before the gates run, not after; a clean catch-up merge after the gates is fine unless it brings in a change to a file this PR also changes (when a catch-up merge makes the gates stale or needs a re-label: ORCHESTRATOR.md section 3a); never rewrite someone else's pushed history without the orchestrator's OK. While a PR is `CONFLICTING`, GitHub starts no `pull_request` workflow runs, so `verify`, `db-check` and `secrets` don't run and only `merge-gate` (`pull_request_target`) does; a label change on such a PR doesn't produce a CI run either, and `gh run rerun` re-uses the old run's event payload (old labels), so it can't pick up a new label. To re-evaluate, resolve the conflict by merging `main` into the branch (the push starts a fresh run). After each merge, check the other open PRs for conflicts (ORCHESTRATOR.md section 3a; `tasks/lessons.md` L19, L16).
4. If post-deploy verification fails: open a fix task, keep the original task in `VERIFYING`, and tell the orchestrator. Never "fix forward" yourself.
5. Drift check red → don't merge DB changes (ORCHESTRATOR stop rule 1).

## Security baseline rows owned
#13 (with devops-cicd): no `.env` tracked; check on every merge.

## Done when (gate)
- Phase 0: `scripts/bootstrap-check.sh` (full, not `--offline`) passes for the git and GitHub sections.
- Ship: `post-deploy.md` complete with evidence for every item above.

## Hands off to
Phase 0 → devops-cicd (if CI isn't done) or orchestrator. Ship → orchestrator (moves task to `DONE`).

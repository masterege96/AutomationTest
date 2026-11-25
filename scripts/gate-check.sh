#!/usr/bin/env bash
# gate-check.sh: required CI check that replaces GitHub's "1 approving review"
# for single-account repos. A PR can only merge when the task's gate files say so.
#
# Passes only if, for the task named by the branch (<type>/<id>-<name>):
#   the FIRST non-empty line of specs/<id>/security-gate.md is "Result: PASS"
#   the FIRST non-empty line of specs/<id>/review.md         is "Result: APPROVE"
#   both files were committed AFTER (in a later commit than) the last code change
#   (so a review can't approve code that changed afterwards); no merge-base with
#   the base branch is a FAIL
#   changes to .github/workflows, scripts, rules, roles or ORCHESTRATOR.md carry the
#   person's framework-change-approved label (FRAMEWORK_CHANGE_APPROVED=1)
#
# Usage: scripts/gate-check.sh [--base <branch>] [--head <sha>] [--branch <name>]
#
# In CI this runs from a pull_request_target workflow: the script and workflow
# come from main, and the PR's commit is only READ with git (never checked out
# or executed). So a PR can't edit the gate that judges it.

set -uo pipefail
BASE="origin/main"; HEAD_REF="HEAD"; BRANCH_ARG=""
while [ $# -gt 0 ]; do
  [ -n "${2:-}" ] || { echo "gate-check: FAIL $1 needs a value"; exit 2; }
  case "$1" in
    --base) BASE="$2" ;; --head) HEAD_REF="$2" ;; --branch) BRANCH_ARG="$2" ;;
    *) echo "gate-check: FAIL unknown argument $1"; exit 2 ;;
  esac; shift 2
done
cd "$(git rev-parse --show-toplevel)" || exit 2
BRANCH="${BRANCH_ARG:-${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}}"
ID=$(printf '%s' "$BRANCH" | sed -nE 's#^[a-z]+/([A-Za-z0-9]+)-.*#\1#p')
if [ -z "$ID" ]; then
  echo "gate-check: FAIL branch '$BRANCH' doesn't match <type>/<id>-<name>"; exit 1
fi

FAIL=0
check() {  # file, required result
  f="specs/$ID/$1"
  if ! git cat-file -e "$HEAD_REF:$f" 2>/dev/null; then echo "  FAIL  $f missing"; FAIL=1; return; fi
  # The Result line must be the FIRST non-empty line (a later line can't override a FAIL).
  first=$(git show "$HEAD_REF:$f" | grep -m1 -vE '^[[:space:]]*$' | tr -d '\r')
  if printf '%s' "$first" | grep -qE "^(\*\*)?Result:(\*\*)?[[:space:]]*$2[[:space:]]*$"; then echo "  PASS  $f: $2"
  else echo "  FAIL  $f: first line is not 'Result: $2'"; FAIL=1; fi
}
echo "gate-check for task $ID ($BRANCH)"
check security-gate.md PASS
check review.md APPROVE

# Gate files must be newer than the last commit that changed anything else.
MB=$(git merge-base "$BASE" "$HEAD_REF" 2>/dev/null || true)
if [ -z "$MB" ]; then
  echo "  FAIL  no merge-base with $BASE (fetch full history: fetch-depth 0), so freshness can't be checked"; FAIL=1
else
  LAST_CODE=$(git log --format=%H "$MB".."$HEAD_REF" -- . ":(exclude)specs/$ID/review.md" ":(exclude)specs/$ID/security-gate.md" ":(exclude)tasks/**" | head -1)
  for g in security-gate.md review.md; do
    G=$(git log -1 --format=%H "$MB".."$HEAD_REF" -- "specs/$ID/$g" 2>/dev/null)
    # The gate commit must come strictly after the last code commit (separate commit, later in history).
    if [ -n "$LAST_CODE" ] && { [ -z "$G" ] || [ "$G" = "$LAST_CODE" ] || ! git merge-base --is-ancestor "$LAST_CODE" "$G"; }; then
      echo "  FAIL  specs/$ID/$g was not written after the last code change: re-run that gate in its own commit"; FAIL=1
    fi
  done
fi

# Framework and pipeline files can only change with the person's label.
# Agents may never add this label (AGENT_RULES); only the person does, on GitHub.
if [ -n "${MB:-}" ]; then
  PROTECTED=$(git diff --name-only "$MB" "$HEAD_REF" -- .github/workflows scripts rules roles ORCHESTRATOR.md 2>/dev/null)
  if [ -n "$PROTECTED" ]; then
    if [ "${FRAMEWORK_CHANGE_APPROVED:-}" = "1" ]; then
      echo "  PASS  pipeline/framework files changed, approved by the person (framework-change-approved label)"
    else
      echo "  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:"
      printf '%s\n' "$PROTECTED" | sed 's/^/          /'; FAIL=1
    fi
  fi
fi

if [ $FAIL = 0 ]; then echo "gate-check: PASS"; exit 0; else echo "gate-check: FAIL"; exit 1; fi

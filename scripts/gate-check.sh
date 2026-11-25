#!/usr/bin/env bash
# gate-check.sh: required CI check that replaces GitHub's "1 approving review"
# for single-account repos. A PR can only merge when the task's gate files say so.
#
# Passes only if, for the task named by the branch (<type>/<id>-<name>):
#   specs/<id>/security-gate.md  has a line "Result: PASS"
#   specs/<id>/review.md         has a line "Result: APPROVE"
# and both files were committed AFTER (in a later commit than) the last code change
# (so a review can't approve code that changed afterwards).
#
# Usage: scripts/gate-check.sh [--base <branch>]

set -uo pipefail
BASE="origin/main"; [ "${1:-}" = "--base" ] && BASE="$2"
cd "$(git rev-parse --show-toplevel)" || exit 2

BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}"
ID=$(printf '%s' "$BRANCH" | sed -nE 's#^[a-z]+/([A-Za-z0-9]+)-.*#\1#p')
if [ -z "$ID" ]; then
  echo "gate-check: FAIL branch '$BRANCH' doesn't match <type>/<id>-<name>"; exit 1
fi

FAIL=0
check() {  # file, required result
  f="specs/$ID/$1"
  if [ ! -f "$f" ]; then echo "  FAIL  $f missing"; FAIL=1; return; fi
  if grep -qE "^(\*\*)?Result:(\*\*)?[[:space:]]*$2[[:space:]]*$" "$f"; then echo "  PASS  $f: $2"
  else echo "  FAIL  $f does not say 'Result: $2'"; FAIL=1; fi
}
echo "gate-check for task $ID ($BRANCH)"
check security-gate.md PASS
check review.md APPROVE

# Gate files must be newer than the last commit that changed anything else.
MB=$(git merge-base "$BASE" HEAD 2>/dev/null || true)
if [ -n "$MB" ]; then
  LAST_CODE=$(git log --format=%H "$MB"..HEAD -- . ":(exclude)specs/$ID/review.md" ":(exclude)specs/$ID/security-gate.md" ":(exclude)tasks/**" | head -1)
  for g in security-gate.md review.md; do
    G=$(git log -1 --format=%H "$MB"..HEAD -- "specs/$ID/$g" 2>/dev/null)
    # The gate commit must come strictly after the last code commit (separate commit, later in history).
    if [ -n "$LAST_CODE" ] && { [ -z "$G" ] || [ "$G" = "$LAST_CODE" ] || ! git merge-base --is-ancestor "$LAST_CODE" "$G"; }; then
      echo "  FAIL  specs/$ID/$g was not written after the last code change: re-run that gate in its own commit"; FAIL=1
    fi
  done
fi

if [ $FAIL = 0 ]; then echo "gate-check: PASS"; exit 0; else echo "gate-check: FAIL"; exit 1; fi

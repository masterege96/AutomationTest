#!/usr/bin/env bash
# Judge of the drift check (task 4e, S26): turns the exit status of `supabase db diff` and its output
# into "no drift", "drift" or "drift check broken". Never prints the diff content (S18: the repo is public).
#
# Usage: GITHUB_OUTPUT=<file> scripts/ci/drift-judge.sh <cli exit code> <diff.sql> <cli stderr file>
#   no drift: prints "diff: 0 non-comment lines, sha256 <12 hex>" and "No drift.",
#             appends diff_ok=true and drift=no to $GITHUB_OUTPUT, exit 0.
#   drift:    prints "diff: <n> non-comment lines, sha256 <12 hex>" and
#             "::error::Drift: production differs from supabase/migrations",
#             appends diff_ok=true and drift=yes, exit 1.
#   broken:   prints "::error::drift check broken: supabase db diff exited <code>" plus at most the last 20
#             lines of the CLI's stderr, or "::error::drift check broken: diff output could not be read (<reason>)";
#             appends nothing, exit 1.
# Judged on content, not on the exit code: only a numeric count > 0 of lines that are neither blank nor
# "--" comments is drift. Uses grep, sha256sum, cut and tail from PATH.
set -uo pipefail
export LC_ALL=C

if [ "$#" -ne 3 ]; then
  echo "usage: GITHUB_OUTPUT=<file> drift-judge.sh <cli exit code> <diff.sql> <cli stderr file>" >&2
  exit 2
fi
RC="$1"
DIFF="$2"
ERR="$3"

broken_read() {
  echo "::error::drift check broken: diff output could not be read ($1)"
  exit 1
}

if [ -z "${GITHUB_OUTPUT:-}" ]; then
  echo "::error::drift check broken: GITHUB_OUTPUT is not set"
  exit 1
fi

if [ "$RC" != "0" ]; then
  case "$RC" in
    '' | *[!0-9]*) RC_TEXT="unknown" ;;
    *) RC_TEXT="$RC" ;;
  esac
  echo "::error::drift check broken: supabase db diff exited $RC_TEXT"
  if [ -f "$ERR" ] && [ -r "$ERR" ]; then
    tail -n 20 -- "$ERR"
  fi
  exit 1
fi

[ -e "$DIFF" ] || broken_read "diff file missing"
[ ! -d "$DIFF" ] || broken_read "diff path is a directory"
[ -f "$DIFF" ] || broken_read "diff path is not a regular file"
[ -r "$DIFF" ] || broken_read "diff file not readable"

# grep -c exits 1 when it selects no line (count 0) and 2 on an error.
COUNT=$(grep -cvE '^[[:space:]]*(--.*)?$' -- "$DIFF" 2>/dev/null)
GREP_RC=$?
[ "$GREP_RC" -le 1 ] || broken_read "line count failed"
[[ "$COUNT" =~ ^[0-9]+$ ]] || broken_read "line count is not a number"

HASH=$(sha256sum -- "$DIFF" 2>/dev/null | cut -c1-12)
[[ "$HASH" =~ ^[0-9a-f]{12}$ ]] || broken_read "sha256 failed"

echo "diff: $COUNT non-comment lines, sha256 $HASH"
# Only now is the diff known to be complete (S29: only a complete diff may be uploaded).
echo "diff_ok=true" >>"$GITHUB_OUTPUT"
if [ "$COUNT" -gt 0 ]; then
  echo "drift=yes" >>"$GITHUB_OUTPUT"
  echo "::error::Drift: production differs from supabase/migrations"
  exit 1
fi
echo "drift=no" >>"$GITHUB_OUTPUT"
echo "No drift."
exit 0

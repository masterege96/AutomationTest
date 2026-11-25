#!/usr/bin/env bash
# board.sh: prints the task board from the briefs. Each task's state lives only in
# the `| State |` row of tasks/<id>/TASK_BRIEF.md (ORCHESTRATOR.md section 3), so
# parallel task branches never edit a shared board file.
#
# Usage (from the repo root, no arguments): bash scripts/board.sh
#
# Output: a Markdown table | Id | Title | State | Owner |, one row per brief, in task
# order (numeric part ascending, then the letter suffix: 0, 2, 2a, 2b, 3c, 10).
#   Title = the brief's first line without "# Task <id>: " (the raw line if it doesn't match)
#   State = the first table row whose first cell is "State" (MISSING if absent or empty)
#   Owner = the first table row whose first cell is "Owner role"
# Directories without a TASK_BRIEF.md (tasks/incidents, tasks/decisions, ...) are skipped.
#
# Exit: 0 all briefs well-formed; 1 a brief has a problem (one stderr line each, the
# row is still printed); 2 usage error or no tasks/ directory.
# Text parsing only: brief content is never executed, sourced or evaluated.

set -uo pipefail
export LC_ALL=C

if [ $# -gt 0 ]; then
  echo "usage: bash scripts/board.sh   (no arguments; run from the repo root)" >&2; exit 2
fi
if [ ! -d tasks ]; then
  echo "board.sh: no tasks/ directory (run from the repo root)" >&2; exit 2
fi

STATES=" BACKLOG SPEC_READY IN_PROGRESS IN_REVIEW VERIFYING DONE BLOCKED "
TAB=$(printf '\t')

# Task ids in board order: numeric part, then suffix; ids without a leading number go last.
task_ids() {
  for d in tasks/*/; do
    [ -d "$d" ] || continue
    id=${d#tasks/}; id=${id%/}
    if [[ "$id" =~ ^([0-9]+)(.*)$ ]]; then
      printf '%s\t%s\t%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "$id"
    else
      printf '%s\t%s\t%s\n' 999999999 "$id" "$id"
    fi
  done | sort -t "$TAB" -k1,1n -k2,2 | cut -f3
}

# Prints 4 lines: first line, state-row-found (0/1), state cell, owner cell (cells trimmed).
parse_brief() {
  awk -F'|' '
    { sub(/\r$/, "") }
    NR == 1 { first = $0 }
    !gs && $0 ~ /^[ \t]*\|[ \t]*State[ \t]*\|/      { gs = 1; st = $3 }
    !go && $0 ~ /^[ \t]*\|[ \t]*Owner role[ \t]*\|/ { go = 1; ow = $3 }
    END {
      gsub(/^[ \t]+|[ \t]+$/, "", st); gsub(/^[ \t]+|[ \t]+$/, "", ow)
      print first; print (gs ? 1 : 0); print st; print ow
    }' "$1"
}

FAIL=0
problem() { echo "board.sh: $1: $2" >&2; FAIL=1; }

echo "| Id | Title | State | Owner |"
echo "|----|-------|-------|-------|"
while IFS= read -r id; do
  f="tasks/$id/TASK_BRIEF.md"
  [ -f "$f" ] || continue
  { IFS= read -r first; IFS= read -r found; IFS= read -r state; IFS= read -r owner; } <<EOF
$(parse_brief "$f")
EOF
  prefix="# Task $id: "
  if [[ "$first" == "$prefix"* ]] && [ -n "${first#"$prefix"}" ]; then
    title=${first#"$prefix"}
  else
    title=$first
    problem "$f" "first line is not '# Task $id: <title>'"
  fi
  if [ "$found" != 1 ]; then
    state=MISSING; problem "$f" "no '| State |' row"
  elif [ -z "$state" ]; then
    state=MISSING; problem "$f" "State cell is empty"
  else
    word=${state%%[ (]*}
    case "$STATES" in
      *" $word "*) ;;
      *) problem "$f" "State '$state' doesn't start with one of:$STATES(ORCHESTRATOR.md section 3)" ;;
    esac
  fi
  echo "| $id | $title | $state | $owner |"
done <<EOF
$(task_ids)
EOF

exit $FAIL

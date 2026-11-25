#!/usr/bin/env bash
# lessons.sh: lists the open lessons for the learning loop (ORCHESTRATOR.md section 8).
#
# Usage (from the repo root, no arguments): bash scripts/lessons.sh
#
# Lessons are headings:
#   tasks/lessons.md (frozen archive):  ## L<n>. <title> (<status>)
#   tasks/<id>/lessons.md (per task):   ## L<id>.<n>. <title> (<status>)   <n> = 1, 2, ...
# The status is the text in the last "( ... )" at the end of the heading. A lesson is
# closed when its status starts with fixed, closed or info (any case), or when a line
#   Closes: <id>[, <id>...]
# in any tasks/<id>/lessons.md names it. Every other lesson is open (also one without status).
#
# Output: one line per open lesson, "<id> <file>: <heading text after the id>", archive
# first (id order), then per-task files (task order as in board.sh, then <n> order); last
# line "lessons.sh: <total> open (<a> archive, <t> per-task)".
#
# Exit: 0 ok; 1 a per-task lessons file has a problem (one stderr line each; well-formed
# open lessons are still listed); 2 usage error or no tasks/ directory. A missing
# tasks/lessons.md is fine. Text parsing only: lesson content is never executed or evaluated.

set -uo pipefail
export LC_ALL=C

if [ $# -gt 0 ]; then
  echo "usage: bash scripts/lessons.sh   (no arguments; run from the repo root)" >&2; exit 2
fi
if [ ! -d tasks ]; then
  echo "lessons.sh: no tasks/ directory (run from the repo root)" >&2; exit 2
fi

TAB=$(printf '\t')

# Same task order as board.sh: numeric part, then suffix; ids without a leading number go last.
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

FILES=()
[ -f tasks/lessons.md ] && FILES+=(tasks/lessons.md)
while IFS= read -r id; do
  [ -n "$id" ] && [ -f "tasks/$id/lessons.md" ] && FILES+=("tasks/$id/lessons.md")
done <<EOF
$(task_ids)
EOF

# awk prints tagged lines:  E<TAB><file>: <problem>
#                           O<TAB><file index><TAB><n><TAB><kind a|t><TAB><output line>
# The shell sorts the open lessons and writes problems to stderr.
RESULT=""
if [ ${#FILES[@]} -gt 0 ]; then
  RESULT=$(awk '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function closed_status(h,   s) {
      if (!match(h, /\([^()]*\)[ \t]*$/)) return 0
      s = substr(h, RSTART + 1); sub(/\)[ \t]*$/, "", s); s = tolower(trim(s))
      return (s ~ /^(fixed|closed|info)/)
    }
    function problem(msg) { print "E\t" FILENAME ": " msg }
    FNR == 1 { fi++; tid = ""; if (FILENAME != "tasks/lessons.md") { tid = FILENAME; sub(/^tasks\//, "", tid); sub(/\/lessons\.md$/, "", tid) } }
    { sub(/\r$/, "") }
    # ---- archive: ## L<n>. <title>
    tid == "" {
      if ($0 ~ /^## L[0-9]+\. /) {
        rest = substr($0, 5); n = rest; sub(/\..*$/, "", n); text = trim(substr(rest, length(n) + 3))
        id = "L" n
        if (!(id in known)) { known[id] = 1; cnt++; L_id[cnt] = id; L_file[cnt] = FILENAME; L_fi[cnt] = 0; L_n[cnt] = n + 0; L_kind[cnt] = "a"; L_text[cnt] = text }
      }
      next
    }
    # ---- per task: ## L<id>.<n>. <title>
    /^## L[^ \t]*\.[ \t]/ {
      tok = $0; sub(/^## L/, "", tok); sub(/\.[ \t].*$/, "", tok)
      text = trim(substr($0, length("## L" tok) + 3))
      dot = index(tok, ".")
      if (dot == 0) { problem("heading \"L" tok ".\" is not L" tid ".<n>"); next }
      htid = substr(tok, 1, dot - 1); n = substr(tok, dot + 1)
      if (htid != tid) { problem("heading L" tok " has the wrong task id (expected L" tid ".<n>)"); next }
      if (n !~ /^[1-9][0-9]*$/) { problem("heading L" tok " has a bad number (expected a positive integer)"); next }
      id = "L" tid "." n
      if (id in known) { problem("duplicate id " id); next }
      known[id] = 1; cnt++; L_id[cnt] = id; L_file[cnt] = FILENAME; L_fi[cnt] = fi; L_n[cnt] = n + 0; L_kind[cnt] = "t"; L_text[cnt] = text
      next
    }
    # ---- Closes: <id>[, <id>...]
    /^[ \t]*Closes:/ {
      list = $0; sub(/^[ \t]*Closes:/, "", list); list = trim(list)
      if (list == "") { problem("empty Closes: line"); next }
      k = split(list, ids, ",")
      for (i = 1; i <= k; i++) { c = trim(ids[i]); nc++; C_id[nc] = c; C_file[nc] = FILENAME; closes[c] = 1 }
    }
    END {
      for (i = 1; i <= nc; i++)
        if (!(C_id[i] in known)) print "E\t" C_file[i] ": Closes: names " C_id[i] ", which is no lesson"
      for (i = 1; i <= cnt; i++) {
        if (L_id[i] in closes) continue
        if (closed_status(L_text[i])) continue
        print "O\t" L_fi[i] "\t" L_n[i] "\t" L_kind[i] "\t" L_id[i] " " L_file[i] ": " L_text[i]
      }
    }' "${FILES[@]}")
fi

FAIL=0
ERRS=$(printf '%s\n' "$RESULT" | sed -n "s/^E$TAB/lessons.sh: /p")
if [ -n "$ERRS" ]; then printf '%s\n' "$ERRS" >&2; FAIL=1; fi
OPEN=$(printf '%s\n' "$RESULT" | grep "^O$TAB" | sort -t "$TAB" -k2,2n -k3,3n)
A=0; T=0
if [ -n "$OPEN" ]; then
  printf '%s\n' "$OPEN" | cut -f5-
  A=$(printf '%s\n' "$OPEN" | grep -c "^O$TAB[^$TAB]*$TAB[^$TAB]*${TAB}a$TAB")
  T=$(printf '%s\n' "$OPEN" | grep -c "^O$TAB[^$TAB]*$TAB[^$TAB]*${TAB}t$TAB")
fi
echo "lessons.sh: $((A + T)) open ($A archive, $T per-task)"
exit $FAIL

#!/usr/bin/env bash
# gate-check.sh: required CI check that replaces GitHub's "1 approving review"
# for single-account repos. A PR can only merge when the task's gate files say so.
#
# Terms (MB = git merge-base <base> <head>; no merge-base is a FAIL):
#   code path: every path except specs/<id>/security-gate.md, specs/<id>/review.md,
#     specs/<id>/post-deploy.md and tasks/**; but tasks/decisions.md and
#     tasks/decisions/** ARE code paths.
#   net change at commit X: git diff <merge-base(base, X)> X on the given paths, i.e.
#     what the branch changes compared with main at X. Changes main brought in through
#     a catch-up merge are not part of it; a conflict resolution or any other edit made
#     inside a merge commit is.
#   protected paths: .github/**, scripts/**, rules/**, roles/**, templates/**,
#     ORCHESTRATOR.md, AGENTS.md, .gitleaks.toml, package.json, package-lock.json,
#     supabase/config.toml.
#
# Passes only if, for the task named by the branch (<type>/<id>-<name>):
#   the FIRST non-empty line of specs/<id>/security-gate.md is "Result: PASS"
#   the FIRST non-empty line of specs/<id>/review.md         is "Result: APPROVE"
#   each gate file is fresh: its last commit (gate commit G) is in MB..HEAD (also for a
#     tasks-only PR), G's net code change equals its first parent's (G changes no code
#     itself), and the net code change at G equals the net code change at HEAD (no code
#     changed after the gate; a clean catch-up merge of main doesn't make it stale).
#     If equality can't be shown, the gate is stale (fail safe).
#   if the PR's net change (MB..HEAD) touches a protected path: the person's
#     framework-change-approved label is on the PR AND was applied (GitHub server time)
#     after GitHub received the push that brought the branch's net protected change to
#     its current value (rule below). Commit author/committer dates are never used.
#
# Label inputs (environment; set by gate.yml from the GitHub API, by tests directly;
# read only when protected paths changed; anything missing or malformed is a FAIL):
#   FRAMEWORK_CHANGE_APPROVED=1    the label is on the PR now
#   FRAMEWORK_LABEL_TIME           time of the most recent 'labeled' event for the label,
#                                  exactly YYYY-MM-DDTHH:MM:SSZ (UTC)
#   PR_HEAD_PUSHES                 one line per push GitHub recorded on the PR's head
#                                  branch: "<YYYY-MM-DDTHH:MM:SSZ> <40-hex tip sha after
#                                  the push>", any order; must include HEAD's sha
# Push time (task 4b, F1 fix): a push is "same" when its tip is a commit git knows AND
# the net protected change at that tip equals the net protected change at HEAD; every
# other push (different content, unknown tip such as 000... or a force-pushed-away
# commit, net change not computable) is "different". D = time of the latest different
# push. Push time = time of the earliest same push strictly later than D (the earliest
# same push if there is no different one); none -> FAIL. The label must be strictly
# later than the push time. So every push from the last one before the label onwards
# had exactly the protected change that merges. Whether a tip "contains" some commit
# doesn't matter: a later revert, a reset or an "ours" merge that brings old content
# back is a different push. Order within one second is unknown, so a same push in the
# same second as D doesn't count.
#
# Current-state inputs (task 4c, F2 and retarget; environment, set by gate.yml from read-only
# GitHub API calls made when the run starts, so a re-run never re-uses an old event payload).
# UNSET = not checked (fixtures, local runs, exactly the 4b behaviour); SET, even to "", = used:
#   PR_CURRENT_LABELS   the PR's labels now, one name per line (all pages). The label above counts
#                       as on only if FRAMEWORK_CHANGE_APPROVED=1 AND a line is exactly
#                       framework-change-approved (so un-labeling, then re-running an old
#                       'labeled' run, FAILs).
#   PR_CURRENT_BASE     the PR's base branch now; anything but exactly "main" is a FAIL (checked on
#                       every run, protected paths or not).
#
# merge-gate spoofing (task 4c, S14 stopgap; always checked, label or not):
#   Workflow files at the head = every blob of the HEAD COMMIT's tree (git ls-tree, git cat-file;
#   never the working tree, never checked out or run) under .github/workflows/, nested directories
#   included, named *.yml / *.yaml (any case). Changed = not at the base, or a different blob id.
#   Reserved name = merge-gate or gate, case-insensitive, trimmed, quotes removed.
#   Exempt gate file = exactly .github/workflows/gate.yml when (a) its blob equals the base's, or
#   (b) it changed but pull_request_target is its only trigger (then the head's copy can't run for
#   this PR; the protected-path label rule still applies to it). Under (b) only B2 and B3 apply.
#   S14-A (every workflow file but the exempt gate file): no job id or job name: is a reserved
#     name; a job name: containing ${{ fails whatever it evaluates to.
#   B1 (changed files): the text merge-gate appears nowhere (case-insensitive).
#   B2 (changed files): no workflow- or job-level permissions grant checks: write, statuses: write
#     or write-all (the token write scopes are how a workflow without stored secrets posts a
#     check run or commit status).
#   B3 (changed files): permissions: at the workflow level, or on every job (else the repo default
#     applies, which may include checks/statuses write).
#   Fail closed: the reader is a strict line-based subset of YAML (block mappings/sequences
#   indented with spaces, plain keys, one-line plain/quoted/flow values, block scalars without an
#   indentation indicator, comments, one leading ---, a leading BOM, CRLF). Anything else (anchors,
#   aliases, tags, merge keys, ? keys, quoted keys, tabs, multi-line plain/quoted/flow values, a
#   second document, directives, invalid UTF-8, control characters, a lone CR, duplicate top-level,
#   job-id or job-level keys, a job name it can't decode; symlinks or submodules under .github)
#   FAILs as "can't be read safely". A false FAIL is accepted; a PASS for a reserved job is not.
#
# Residuals (not visible to main's gate; closed only when the required check is pinned to a GitHub
# App, task 4c-app):
#   - a green merge-gate produced by ANOTHER base branch's gate.yml: a PR opened against a side
#     branch (whose gate.yml may always pass), then retargeted to main, then that old run re-run.
#     The re-run judges with the side branch's copy, so main's checks here never execute.
#   - a check run or commit status named merge-gate posted onto the PR's head SHA by a workflow on
#     another branch (not at the head), e.g. one that runs for a different PR or push and has a
#     token with checks/statuses write.
#   - workflows at the head that post a check with a stored secret other than GITHUB_TOKEN (Q5;
#     the repo has none; the label review covers it).
#
# Usage: scripts/gate-check.sh [--base <branch>] [--head <sha>] [--branch <name>]
#
# In CI this runs from a pull_request_target workflow: the script and workflow
# come from main, and the PR's commit is only READ with git (never checked out
# or executed). So a PR can't edit the gate that judges it.

set -uo pipefail
export LC_ALL=C  # byte order for sort and [[ < > ]], ASCII ranges in regexes, on any machine
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
  if ! git cat-file -e "$HEAD_REF:$f" 2>/dev/null; then echo "  FAIL  $f missing"; FAIL=1; return 1; fi
  # The Result line must be the FIRST non-empty line (a later line can't override a FAIL).
  first=$(git show "$HEAD_REF:$f" | grep -m1 -vE '^[[:space:]]*$' | tr -d '\r')
  if printf '%s' "$first" | grep -qE "^(\*\*)?Result:(\*\*)?[[:space:]]*$2[[:space:]]*$"; then echo "  PASS  $f: $2"
  else echo "  FAIL  $f: first line is not 'Result: $2'"; FAIL=1; fi
  return 0
}
echo "gate-check for task $ID ($BRANCH)"
HAVE_SEC=0; HAVE_REV=0
check security-gate.md PASS && HAVE_SEC=1
check review.md APPROVE && HAVE_REV=1

# Pathspecs. Git can't re-include a path a negative pathspec excluded, so the decision
# files are a second, separate diff.
CODE_SPEC=(. ":(exclude)specs/$ID/security-gate.md" ":(exclude)specs/$ID/review.md"
           ":(exclude)specs/$ID/post-deploy.md" ":(exclude)tasks/**")
DECISION_SPEC=(tasks/decisions.md tasks/decisions)
PROTECTED_SPEC=(.github scripts rules roles templates ORCHESTRATOR.md AGENTS.md .gitleaks.toml
                package.json package-lock.json supabase/config.toml)

# net_diff <commit> <kind>: the PR's net change at <commit> (from its own merge-base with
# the base branch). If ANY step fails (no merge-base, a git diff error, unknown kind) it
# prints exactly "ERR" and nothing else; callers treat ERR as "not equal", i.e. stale /
# different: fail safe. A real result is never "ERR" (code always has "--decisions--",
# a protected diff starts with "diff --git" or is empty).
net_diff() {
  local mb out dec
  { mb=$(git merge-base "$BASE" "$1" 2>/dev/null) && [ -n "$mb" ]; } || { echo "ERR"; return 1; }
  case "$2" in
    code)
      { out=$(git diff --no-ext-diff --no-textconv --no-color "$mb" "$1" -- "${CODE_SPEC[@]}" 2>/dev/null) &&
        dec=$(git diff --no-ext-diff --no-textconv --no-color "$mb" "$1" -- "${DECISION_SPEC[@]}" 2>/dev/null); } ||
        { echo "ERR"; return 1; }
      printf '%s\n--decisions--\n%s\n' "$out" "$dec" ;;
    protected)
      out=$(git diff --no-ext-diff --no-textconv --no-color "$mb" "$1" -- "${PROTECTED_SPEC[@]}" 2>/dev/null) ||
        { echo "ERR"; return 1; }
      printf '%s\n' "$out" ;;
    *) echo "ERR"; return 1 ;;
  esac
}

MB=$(git merge-base "$BASE" "$HEAD_REF" 2>/dev/null || true)
if [ -z "$MB" ]; then
  echo "  FAIL  no merge-base with $BASE (fetch full history: fetch-depth 0), so freshness can't be checked"; FAIL=1
else
  HEAD_CODE=$(net_diff "$HEAD_REF" code)
  for g in security-gate.md review.md; do
    if [ "$g" = security-gate.md ] && [ $HAVE_SEC = 0 ]; then continue; fi
    if [ "$g" = review.md ] && [ $HAVE_REV = 0 ]; then continue; fi
    G=$(git log -1 --format=%H "$MB".."$HEAD_REF" -- "specs/$ID/$g" 2>/dev/null)
    if [ -z "$G" ]; then
      echo "  FAIL  specs/$ID/$g was not committed on this branch: run that gate on this branch, in its own commit"; FAIL=1
      continue
    fi
    G_CODE=$(net_diff "$G" code)
    P_CODE=$(net_diff "$G^1" code)
    if [ "$G_CODE" = "ERR" ] || [ "$P_CODE" = "ERR" ] || [ "$HEAD_CODE" = "ERR" ] ||
       [ "$G_CODE" != "$P_CODE" ] || [ "$G_CODE" != "$HEAD_CODE" ]; then
      echo "  FAIL  specs/$ID/$g was not written after the last code change: re-run that gate in its own commit"; FAIL=1
    fi
  done
fi

# Framework and pipeline files can only change with the person's label, applied after
# the last push that changed them. Agents may never add this label (AGENT_RULES 18a).
TIME_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
if [ -n "${MB:-}" ]; then
  if ! PROTECTED=$(git diff --name-only "$MB" "$HEAD_REF" -- "${PROTECTED_SPEC[@]}" 2>/dev/null); then
    echo "  FAIL  could not list the protected paths this PR changes (git diff failed)"; FAIL=1; PROTECTED=""
  fi
  if [ -n "$PROTECTED" ]; then
    # F2 (task 4c): with PR_CURRENT_LABELS set, the label must also be in the PR's current labels.
    LABEL_ON=0; [ "${FRAMEWORK_CHANGE_APPROVED:-}" = "1" ] && LABEL_ON=1
    if [ -n "${PR_CURRENT_LABELS+set}" ] &&
       ! printf '%s\n' "$PR_CURRENT_LABELS" | tr -d '\r' | grep -qxF 'framework-change-approved'; then
      LABEL_ON=0
    fi
    if [ $LABEL_ON != 1 ]; then
      echo "  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:"
      printf '%s\n' "$PROTECTED" | sed 's/^/          /'; FAIL=1
    elif ! [[ "${FRAMEWORK_LABEL_TIME:-}" =~ $TIME_RE ]]; then  # whole value (a grep would accept any one line of a multi-line value)
      echo "  FAIL  framework-change-approved label time could not be read (FRAMEWORK_LABEL_TIME='${FRAMEWORK_LABEL_TIME:-}'), so the label can't be tied to the last protected change"; FAIL=1
    else
      # Push time (see header): the earliest "same" push strictly later than the latest
      # "different" one. Every line is validated first: any bad line fails closed.
      HEAD_SHA=$(git rev-parse --verify -q "$HEAD_REF^{commit}")
      HEAD_PROT=$(net_diff "$HEAD_SHA" protected)
      PUSH_ERR=""; PUSH_TIME=""; PUSH_TIP=""; LAST_DIFF=""; SAW_HEAD=0; CLASSIFIED=""
      [ "$HEAD_PROT" = "ERR" ] && PUSH_ERR="the net protected change at HEAD could not be computed"
      SORTED=$(printf '%s\n' "${PR_HEAD_PUSHES:-}" | tr -d '\r' | sed '/^[[:space:]]*$/d' | sort -s -k1,1)
      [ -n "$PUSH_ERR" ] || [ -n "$SORTED" ] || PUSH_ERR="PR_HEAD_PUSHES is empty"
      while read -r t sha rest; do
        [ -n "$PUSH_ERR" ] && break
        if ! [[ "$t" =~ $TIME_RE ]] || ! [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]] || [ -n "$rest" ]; then
          PUSH_ERR="malformed line '$t $sha${rest:+ $rest}'"; break
        fi
        sha=$(printf '%s' "$sha" | tr 'A-F' 'a-f')
        [ "$sha" = "$HEAD_SHA" ] && SAW_HEAD=1
        SAME=0  # unknown tip or net protected change not computable (ERR) -> different
        if git cat-file -e "$sha^{commit}" 2>/dev/null && [ "$(net_diff "$sha" protected)" = "$HEAD_PROT" ]; then SAME=1; fi
        [ $SAME = 0 ] && LAST_DIFF="$t"  # lines are in time order, so this ends as the latest
        CLASSIFIED+="$t $sha $SAME"$'\n'
      done <<< "$SORTED"
      if [ -z "$PUSH_ERR" ]; then
        while read -r t sha same; do
          [ "$same" = 1 ] || continue
          if [ -z "$LAST_DIFF" ] || [[ "$t" > "$LAST_DIFF" ]]; then PUSH_TIME="$t"; PUSH_TIP="$sha"; break; fi
        done <<< "$CLASSIFIED"
      fi
      [ -z "$PUSH_ERR" ] && [ $SAW_HEAD = 0 ] && PUSH_ERR="no push recorded for the head commit $HEAD_SHA"
      [ -z "$PUSH_ERR" ] && [ -z "$PUSH_TIME" ] && PUSH_ERR="no push later than the last push with a different protected change ($LAST_DIFF) has HEAD's protected change"
      if [ -n "$PUSH_ERR" ]; then
        echo "  FAIL  push time of the last protected change could not be read ($PUSH_ERR), so the label can't be checked"; FAIL=1
      elif [[ "$FRAMEWORK_LABEL_TIME" > "$PUSH_TIME" ]]; then
        echo "  PASS  pipeline/framework files changed, approved by the person (framework-change-approved label $FRAMEWORK_LABEL_TIME, after the push that brought the current protected change: tip $PUSH_TIP at $PUSH_TIME)"
      else
        echo "  FAIL  framework-change-approved label is older than the last change to protected files (label $FRAMEWORK_LABEL_TIME, push that brought the current protected change: tip $PUSH_TIP at $PUSH_TIME): the person re-applies the label:"
        printf '%s\n' "$PROTECTED" | sed 's/^/          /'; FAIL=1
      fi
    fi
  fi
fi

# Retarget (task 4c): the PR's base branch as GitHub reports it when the run starts, not the payload's.
if [ -n "${PR_CURRENT_BASE+set}" ]; then
  if [ "$PR_CURRENT_BASE" = "main" ]; then
    echo "  PASS  PR base is main (read from GitHub when the run started)"
  else
    echo "  FAIL  PR base is not main (GitHub reports '$(printf '%s' "$PR_CURRENT_BASE" | tr -d '\000-\037' | cut -c1-100)'): merge-gate only approves PRs into main"; FAIL=1
  fi
fi

# merge-gate spoofing (task 4c, S14; header). The awk reader prints facts, one per line:
#   U<TAB><line><TAB><why>  file can't be read safely (nothing else is printed)
#   A<TAB><reason>          S14-A: reserved job id / name, or an expression in a job name
#   W<TAB><line>            B2: checks/statuses write or write-all
#   T<TAB>prt|other         pull_request_target is the only trigger, or not
#   TP                      workflow-level permissions: present
#   NP<TAB><job id>         a job without its own permissions:
read -r -d '' SPOOF_AWK <<'AWK'
function unsafe(why) { if (!bad) print "U\t" NR "\t" why; bad = 1; exit }
function trim(s) { sub(/^ +/, "", s); sub(/ +$/, "", s); return s }
function tailok(t) { if (t !~ /^( *| +#.*)$/) unsafe("text after a quoted or flow value") }
# classify(v): VK = E empty, B block scalar, P plain, S single-quoted, D double-quoted, F flow;
# VV = the value (decoded for P/S, D without its escapes: VBS=1 if it had any), F raw.
function classify(v,    c, i, n, ch, out, st, q, prev) {
  VK = ""; VV = ""; VBS = 0
  sub(/^ +/, "", v)
  if (v == "" || substr(v, 1, 1) == "#") { VK = "E"; return }
  c = substr(v, 1, 1); n = length(v)
  if (c == "|" || c == ">") {
    if (v !~ /^[|>][-+]?( *| +#.*)$/) unsafe("block scalar header with an indentation indicator or extra text")
    VK = "B"; return
  }
  if (c == DQ) {
    out = ""
    for (i = 2; i <= n; i++) {
      ch = substr(v, i, 1)
      if (ch == "\\") { VBS = 1; i++; continue }
      if (ch == DQ) break
      out = out ch
    }
    if (i > n) unsafe("double-quoted value not closed on its line")
    tailok(substr(v, i + 1)); VK = "D"; VV = out; return
  }
  if (c == SQ) {
    out = ""
    for (i = 2; i <= n; i++) {
      ch = substr(v, i, 1)
      if (ch == SQ) { if (substr(v, i + 1, 1) == SQ) { out = out SQ; i++; continue }; break }
      out = out ch
    }
    if (i > n) unsafe("single-quoted value not closed on its line")
    tailok(substr(v, i + 1)); VK = "S"; VV = out; return
  }
  if (c == "[" || c == "{") {
    st = ""; q = ""; prev = " "
    for (i = 1; i <= n; i++) {
      ch = substr(v, i, 1)
      if (q == DQ) { if (ch == "\\") { i++; continue }; if (ch == DQ) q = ""; prev = ch; continue }
      if (q == SQ) { if (ch == SQ) { if (substr(v, i + 1, 1) == SQ) { i++; continue }; q = "" }; prev = ch; continue }
      if (ch == DQ || ch == SQ) {
        if (!index("[{,: ", prev)) unsafe("quote inside a plain flow value")
        q = ch; prev = ch; continue
      }
      if (index("&*!|>%@`?", ch) && index("[{,: ", prev)) unsafe("anchor, alias, tag or indicator inside a flow value")
      if (ch == "#" && prev == " ") unsafe("comment inside a flow value")
      if (ch == "[" || ch == "{") st = st ch
      else if (ch == "]" || ch == "}") {
        if (substr(st, length(st), 1) != (ch == "]" ? "[" : "{")) unsafe("unbalanced flow value")
        st = substr(st, 1, length(st) - 1)
        if (st == "") break
      }
      prev = ch
    }
    if (st != "" || i > n) unsafe("flow value not closed on its line")
    tailok(substr(v, i + 1)); VK = "F"; VV = substr(v, 1, i); return
  }
  if (index(",]}&*!%@`?:", c) || (c == "-" && (n == 1 || substr(v, 2, 1) == " ")))
    unsafe("value starts with a YAML indicator (anchor, alias, tag, ...)")
  i = index(v, " #"); if (i) v = substr(v, 1, i - 1)
  v = trim(v)
  if (index(v, ": ") || v ~ /:$/) unsafe("': ' inside a plain value")
  VK = "P"; VV = v
}
function permlevel(k, v) {
  k = tolower(trim(k)); v = tolower(trim(v))
  if (v != "read" && v != "write" && v != "none") unsafe("permissions: unknown level for '" k "'")
  if (v == "write" && (k == "checks" || k == "statuses")) print "W\t" NR
}
function permval(col,    v, parts, np, i, p, kk, vv) {
  if (VK == "E") { inperm = 1; permparent = col; permcind = 0; permcount = 0; return }
  if (VK == "P" || VK == "S" || (VK == "D" && !VBS)) {
    v = tolower(trim(VV))
    if (v == "write-all") print "W\t" NR
    else if (v != "read-all") unsafe("permissions: value is not read-all, write-all or a mapping")
    return
  }
  if (VK == "F" && substr(VV, 1, 1) == "{") {
    v = trim(substr(VV, 2, length(VV) - 2))
    if (v == "") return
    np = split(v, parts, ",")
    for (i = 1; i <= np; i++) {
      p = trim(parts[i])
      if (p !~ /^["']?[A-Za-z-]+["']? *: *["']?[A-Za-z]+["']?$/) unsafe("permissions: flow mapping can't be read")
      gsub(/["']/, "", p); kk = p; sub(/ *:.*$/, "", kk); vv = p; sub(/^[^:]*: */, "", vv)
      permlevel(kk, vv)
    }
    return
  }
  unsafe("permissions: value can't be read")
}
function endperm() {
  if (inperm && permcount == 0) unsafe("empty permissions:")
  inperm = 0
}
function onval(    v) {
  ONMODE = "other"
  if (VK == "E") { inon = 1; onind = 0; oncount = 0; onprt = 0; onother = 0; ONMODE = "block"; return }
  if (VK == "P" || VK == "S" || (VK == "D" && !VBS)) { if (trim(VV) == "pull_request_target") ONMODE = "prt"; return }
  if (VK == "F" && substr(VV, 1, 1) == "[") {
    v = trim(substr(VV, 2, length(VV) - 2)); if (v == "pull_request_target") ONMODE = "prt"
  }
}
function jobname(    n) {
  if (VK == "E" || VK == "B" || VK == "F" || (VK == "D" && VBS)) unsafe("job '" curjob "' name: can't be decoded with certainty")
  if (VV ~ HI) unsafe("job '" curjob "' name: has non-ASCII characters")
  if (index(VV, "${{")) { print "A\tjob '" curjob "' name contains a ${{ }} expression (fails closed, whatever it evaluates to)"; return }
  n = tolower(trim(VV))
  if (n in R) print "A\tjob '" curjob "' is named '" n "', a reserved check name"
}
BEGIN { CR = "\r"; TAB = "\t"; BOM = "\357\273\277"; DQ = "\""; SQ = "'"; R["merge-gate"] = 1; R["gate"] = 1; ONMODE = "other" }
{
  line = $0
  if (NR == 1 && substr(line, 1, 3) == BOM) line = substr(line, 4)
  if (substr(line, length(line), 1) == CR) line = substr(line, 1, length(line) - 1)
  if (index(line, CR)) unsafe("carriage return inside a line")
  match(line, /^ */); ind = RLENGTH; rest = substr(line, ind + 1)
  if (inblock) {
    if (rest == "") next
    if (ind > bkey) {
      if (bcind == 0) bcind = ind
      else if (ind < bcind) unsafe("block scalar line less indented than its first line")
      next
    }
    inblock = 0
  }
  if (rest == "") next
  if (index(line, TAB)) unsafe("tab outside a block scalar")
  if (substr(rest, 1, 1) == "#") next
  if (ind == 0 && rest ~ /^(---|\.\.\.)( |$)/) {
    if (substr(rest, 1, 1) == ".") unsafe("document end marker '...'")
    if (started || docmark) unsafe("second YAML document")
    if (rest !~ /^---( *| +#.*)$/) unsafe("content after '---'")
    docmark = 1; next
  }
  if (ind == 0 && substr(rest, 1, 1) == "%") unsafe("YAML directive")
  started = 1
  # Structure: "key: value", "- item" or "- key: value"; kcol = the key's column.
  seq = 0; kcol = ind; s = rest
  if (s ~ /^-( |$)/) {
    seq = 1; s = substr(s, 2); match(s, /^ */); kcol = ind + 1 + RLENGTH; s = substr(s, RLENGTH + 1)
    if (s ~ /^-( |$)/) unsafe("nested sequence on one line")
  }
  iskey = 0; key = ""
  if (match(s, /^[A-Za-z0-9_][A-Za-z0-9_.-]* *:( |$)/)) {
    iskey = 1; key = substr(s, 1, RLENGTH); sub(/ *:.*$/, "", key); val = substr(s, RLENGTH + 1)
  } else {
    if (!seq) unsafe("not a plain 'key: value' line or a '- ' item")
    val = s
  }
  if (lastscalar && ind > lastcol) unsafe("value continued on the next line")
  classify(val)
  if (VK == "B") { inblock = 1; bkey = (iskey ? kcol : ind); bcind = 0 }
  lastscalar = (VK == "P" || VK == "S" || VK == "D" || VK == "F")
  lastcol = (iskey ? kcol : ind)
  if (inperm && ind <= permparent) endperm()
  if (ind == 0) {
    if (seq) unsafe("top-level sequence item")
    k = tolower(key)
    if (k in top) unsafe("duplicate top-level key '" key "'")
    top[k] = 1; topkey = k; injobs = 0; inon = 0
    if (k == "jobs") { if (VK != "E") unsafe("jobs: is not a block mapping"); injobs = 1; J = 0 }
    else if (k == "permissions") { TP = 1; permval(0) }
    else if (k == "on") onval()
    next
  }
  if (topkey == "") unsafe("indented content before the first top-level key")
  if (inperm) {
    if (permcind == 0) permcind = ind
    if (ind != permcind || seq || !iskey) unsafe("permissions: is not a flat 'scope: level' mapping")
    if (!(VK == "P" || VK == "S" || (VK == "D" && !VBS))) unsafe("permissions: level can't be read")
    permlevel(key, VV); permcount++
    next
  }
  if (inon) {
    if (onind == 0) onind = ind
    if (ind < onind) unsafe("bad indentation under on:")
    if (ind == onind) {
      if (seq || !iskey) onother = 1
      else { oncount++; if (key == "pull_request_target") onprt = 1 }
    }
    next
  }
  if (injobs) {
    if (J == 0) J = ind
    if (ind < J) unsafe("job line indented less than the first job")
    if (ind == J) {
      if (seq) unsafe("jobs: entry is a sequence item")
      if (VK != "E") unsafe("job '" key "' is not a block mapping")
      k = tolower(key)
      if (k in jobseen) unsafe("duplicate job id '" key "'")
      jobseen[k] = 1; curjob = key; njobs++; jobs[njobs] = key; JK = 0; lastJKempty = 0
      if (k in R) print "A\tjob id '" key "' is a reserved check name"
      next
    }
    if (JK == 0) { if (seq) unsafe("job '" curjob "' is not a mapping"); JK = ind }
    if (ind < JK) unsafe("bad indentation in job '" curjob "'")
    if (ind == JK && !seq) {
      k = tolower(key)
      if ((curjob SUBSEP k) in jk) unsafe("duplicate key '" key "' in job '" curjob "'")
      jk[curjob, k] = 1; lastJKempty = (VK == "E")
      if (k == "name") jobname()
      else if (k == "permissions") { jobperm[curjob] = 1; permval(JK) }
      next
    }
    if (ind == JK && seq && !lastJKempty) unsafe("sequence item after a key with a value")
  }
}
END {
  if (bad) exit
  if (inperm) endperm()
  if (bad) exit
  if (ONMODE == "block") ONMODE = ((oncount == 1 && onprt && !onother) ? "prt" : "other")
  print "T\t" ONMODE
  if (TP) print "TP"
  for (i = 1; i <= njobs; i++) if (!(jobs[i] in jobperm)) print "NP\t" jobs[i]
}
AWK

# Valid UTF-8 without NUL (a line that doesn't match is invalid), and the bytes YAML 1.1 reads as
# line breaks (NEL, LS, PS). Bytes are written with $'...' so the check is locale-independent.
U8_RE=$'^([\x01-\x7f]|[\xc2-\xdf][\x80-\xbf]|\xe0[\xa0-\xbf][\x80-\xbf]|[\xe1-\xec\xee\xef][\x80-\xbf][\x80-\xbf]|\xed[\x80-\x9f][\x80-\xbf]|\xf0[\x90-\xbf][\x80-\xbf][\x80-\xbf]|[\xf1-\xf3][\x80-\xbf][\x80-\xbf][\x80-\xbf]|\xf4[\x80-\x8f][\x80-\xbf][\x80-\xbf])*$'
CTRL_RE=$'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\xc2\x85|\xe2\x80[\xa8\xa9]'
SPOOF_FAIL=0; TB=$'\t'
# Case-insensitive by bracket classes: GNU grep -iF aborts in the C locale on Git Bash.
MG_RE='[Mm][Ee][Rr][Gg][Ee]-[Gg][Aa][Tt][Ee]'
sfail() { echo "  FAIL  merge-gate spoofing: $1: $2"; SPOOF_FAIL=1; }
# spoof_file <path> <blob> <changed 0|1>
spoof_file() {
  local p="$1" b="$2" changed="$3" size facts why line exempt=0 is_gate=0 r
  [ "$p" = ".github/workflows/gate.yml" ] && is_gate=1
  size=$(git cat-file -s "$b" 2>/dev/null) || { sfail "$p" "can't be read safely (git cat-file failed)"; return; }
  if [ "$(git cat-file blob "$b" | tr -d '\000' | wc -c | tr -d ' ')" != "$size" ]; then
    sfail "$p" "can't be read safely (NUL byte)"; return
  fi
  if line=$(git cat-file blob "$b" | grep -naxvE "$U8_RE" | head -n 1 | cut -d: -f1) && [ -n "$line" ]; then
    sfail "$p" "can't be read safely (line $line: not valid UTF-8)"; return
  fi
  if line=$(git cat-file blob "$b" | grep -naE "$CTRL_RE" | head -n 1 | cut -d: -f1) && [ -n "$line" ]; then
    sfail "$p" "can't be read safely (line $line: control character or YAML 1.1 line break)"; return
  fi
  if ! facts=$(git cat-file blob "$b" | awk -v HI=$'[\x80-\xff]' "$SPOOF_AWK"); then
    sfail "$p" "can't be read safely (the reader failed)"; return
  fi
  if why=$(printf '%s\n' "$facts" | sed -n "s/^U$TB\([0-9]*\)$TB\(.*\)\$/line \1: \2/p") && [ -n "$why" ]; then
    sfail "$p" "can't be read safely ($why)"
    if [ "$changed" = 1 ] && line=$(git cat-file blob "$b" | grep -naE "$MG_RE" | head -n 1 | cut -d: -f1) && [ -n "$line" ]; then
      sfail "$p" "contains the text 'merge-gate' (line $line)"
    fi
    return
  fi
  if ! printf '%s\n' "$facts" | grep -qxE $'T\t(prt|other)'; then sfail "$p" "can't be read safely (the reader gave no result)"; return; fi
  # Exempt gate file (b): changed, but pull_request_target is its only trigger: only B2 and B3 apply.
  [ $is_gate = 1 ] && [ "$changed" = 1 ] && printf '%s\n' "$facts" | grep -qx $'T\tprt' && exempt=1
  if [ $exempt = 0 ]; then
    while IFS= read -r r; do sfail "$p" "$r"; done < <(printf '%s\n' "$facts" | sed -n "s/^A$TB//p")
    [ $is_gate = 1 ] && sfail "$p" "changed gate.yml has a trigger other than pull_request_target (or its triggers can't be read), so it isn't exempt"
    if [ "$changed" = 1 ] && line=$(git cat-file blob "$b" | grep -naE "$MG_RE" | head -n 1 | cut -d: -f1) && [ -n "$line" ]; then
      sfail "$p" "contains the text 'merge-gate' (line $line)"
    fi
  fi
  [ "$changed" = 1 ] || return
  line=$(printf '%s\n' "$facts" | sed -n "s/^W$TB//p" | head -n 1)
  [ -n "$line" ] && sfail "$p" "grants write access to checks or statuses (line $line)"
  if ! printf '%s\n' "$facts" | grep -qx 'TP'; then
    r=$(printf '%s\n' "$facts" | sed -n "s/^NP$TB//p" | head -n 1)
    [ -n "$r" ] && sfail "$p" "leaves the token permissions to the repo default (no workflow-level permissions:, job '$r' has none)"
  fi
}
if ! HEAD_C=$(git rev-parse --verify -q "$HEAD_REF^{commit}") || ! TREE=$(git -c core.quotePath=true ls-tree -r --full-tree "$HEAD_C"); then
  sfail "$HEAD_REF" "the head commit's tree can't be listed"
else
  while IFS= read -r entry; do
    meta="${entry%%$'\t'*}"; p="${entry#*$'\t'}"; mode="${meta%% *}"; b="${meta##* }"
    lp="${p,,}"  # bash lower-case, LC_ALL=C: ASCII only
    case "$lp" in
      .github|.github/workflows) sfail "$p" "is a symlink or submodule, can't be read safely"; continue ;;
      \".github/workflows/*) sfail "$p" "can't be read safely (git has to quote this path)"; continue ;;
      .github/workflows/*) ;;
      *) continue ;;
    esac
    if [ "$mode" != 100644 ] && [ "$mode" != 100755 ]; then
      sfail "$p" "is a symlink or submodule, can't be read safely"; continue
    fi
    case "$lp" in *.yml|*.yaml) ;; *) continue ;; esac
    base_b=$(git rev-parse -q --verify "$BASE:$p" 2>/dev/null || true)
    changed=1; [ -n "$base_b" ] && [ "$base_b" = "$b" ] && changed=0
    # Exempt gate file (a): exactly this path, same blob as the base's.
    [ "$p" = ".github/workflows/gate.yml" ] && [ $changed = 0 ] && continue
    spoof_file "$p" "$b" "$changed"
  done < <(printf '%s\n' "$TREE" | grep -E "$TB\"?\\.[Gg][Ii][Tt][Hh][Uu][Bb](/|\$)")  # only .github entries (speed); the case above decides
fi
if [ $SPOOF_FAIL = 0 ]; then
  echo "  PASS  merge-gate spoofing: no workflow at the head can report merge-gate"
else
  FAIL=1
fi

if [ $FAIL = 0 ]; then echo "gate-check: PASS"; exit 0; else echo "gate-check: FAIL"; exit 1; fi

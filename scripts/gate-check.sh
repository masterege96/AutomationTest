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
    if [ "${FRAMEWORK_CHANGE_APPROVED:-}" != "1" ]; then
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

if [ $FAIL = 0 ]; then echo "gate-check: PASS"; exit 0; else echo "gate-check: FAIL"; exit 1; fi

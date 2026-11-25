#!/usr/bin/env bash
# verify.sh: the standard "done" gate. Every builder runs it before IN_REVIEW,
# and CI runs it on every pull request.
#
# Usage:
#   scripts/verify.sh [--base <branch>] [--brief <path/to/TASK_BRIEF.md>] [--no-db]
#
#   --base   branch to diff against (default: origin/main, falls back to main)
#   --brief  task brief; its "Allowed paths" block drives the scope check.
#            Default: tasks/<id>/TASK_BRIEF.md, with <id> taken from the branch name <type>/<id>-<name>
#   --no-db  skip the database build/test step (never allowed in CI)
#
# Env:
#   DESTRUCTIVE_APPROVED=1   set by CI when the PR has the `destructive-approved` label
#   CI=true                  makes skipped required steps fail instead of skip
#
# Last line of output is the summary to paste into the task brief.

set -uo pipefail

BASE=""; BRIEF=""; NO_DB=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base)  BASE="$2"; shift 2 ;;
    --brief) BRIEF="$2"; shift 2 ;;
    --no-db) NO_DB=1; shift ;;
    *) echo "unknown argument: $1"; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 2
IN_CI=0; [ "${CI:-}" = "true" ] && IN_CI=1

PASS=0; FAIL=0; SKIP=0; FAILED_NAMES=""
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /'; FAIL=$((FAIL+1)); FAILED_NAMES="$FAILED_NAMES, $1"; }
skip() { if [ "$IN_CI" = 1 ] && [ "${2:-}" = "required" ]; then bad "$1 (skipped, but required in CI)"; else echo "  SKIP  $1"; SKIP=$((SKIP+1)); fi; }

# ---------- base ref and changed files ----------
if [ -z "$BASE" ]; then
  if git rev-parse --verify --quiet origin/main >/dev/null; then BASE=origin/main; else BASE=main; fi
fi
if git rev-parse --verify --quiet "$BASE" >/dev/null; then
  MERGE_BASE=$(git merge-base "$BASE" HEAD)
  # committed changes on this branch + uncommitted + untracked
  CHANGED=$( { git diff --name-only "$MERGE_BASE"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u | sed '/^$/d')
  CHANGED_STATUS=$( { git diff --name-status "$MERGE_BASE" HEAD; git diff --name-status HEAD; } )
else
  MERGE_BASE=""; CHANGED=""; CHANGED_STATUS=""
fi

MIG_DIR=supabase/migrations
NEW_MIGS=$(printf '%s\n' "$CHANGED" | grep -E "^$MIG_DIR/.*\.sql$" || true)

echo "verify.sh (base: $BASE)"
echo

# ---------- 1. Scope ----------
echo "[scope]"
# No --brief: find it from the branch name <type>/<task-id>-<name> -> tasks/<task-id>/TASK_BRIEF.md
if [ -z "$BRIEF" ]; then
  BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
  TASK_ID=$(printf '%s' "$BRANCH" | sed -nE 's#^[a-z]+/([A-Za-z0-9]+)-.*#\1#p')
  [ -n "$TASK_ID" ] && [ -f "tasks/$TASK_ID/TASK_BRIEF.md" ] && BRIEF="tasks/$TASK_ID/TASK_BRIEF.md" && echo "  (brief from branch name: $BRIEF)"
fi
if [ -n "$BRIEF" ]; then
  if [ ! -f "$BRIEF" ]; then
    bad "task brief found" "$BRIEF does not exist"
  else
    # Read the first fenced block after "Allowed paths"
    # Strip "# comments", blank lines and trailing spaces. Lines starting with "!" are exclusions.
    ALLOWED=$(awk '/Allowed paths/{f=1} f&&/^```/{c++; if(c==2) exit; next} f&&c==1{print}' "$BRIEF" \
      | sed -E 's/[[:space:]]*#.*$//; s/[[:space:]]*$//; s/^[[:space:]]*//' | sed '/^$/d')
    if [ -z "$ALLOWED" ]; then
      bad "allowed paths listed in the brief" "add globs under 'Allowed paths' in $BRIEF"
    else
      OUT=""
      for f in $CHANGED; do
        case "$f" in tasks/*) continue ;; esac   # task briefs and handoff notes are always allowed
        # this task's gate reports (written by security, code-reviewer, git-release) are always allowed
        TID=$(printf '%s' "$BRIEF" | sed -nE 's#^tasks/([^/]+)/TASK_BRIEF\.md$#\1#p')
        case "$f" in "specs/$TID/security-gate.md"|"specs/$TID/review.md"|"specs/$TID/post-deploy.md") [ -n "$TID" ] && continue ;; esac
        match=0
        while IFS= read -r g; do
          case "$g" in
            !*) # shellcheck disable=SC2254
                case "$f" in ${g#!}) match=0; break ;; esac ;;
            *)  # shellcheck disable=SC2254
                case "$f" in $g) match=1 ;; esac ;;
          esac
        done <<EOF
$ALLOWED
EOF
        [ $match = 0 ] && OUT="$OUT$f"$'\n'
      done
      if [ -z "$OUT" ]; then ok "all changed files are inside the allowed paths"
      else bad "files changed outside the allowed paths" "$OUT""Revert them, or hand the change to the role that owns those paths."; fi
    fi
  fi
else
  skip "scope check (no --brief given)" required
fi

# ---------- 2. Migrations ----------
if [ -d supabase ]; then
  echo "[migrations]"
  BADNAMES=$(ls "$MIG_DIR" 2>/dev/null | grep -vE '^[0-9]{14}_[a-z0-9_]+\.sql$' || true)
  [ -z "$BADNAMES" ] && ok "migration file names (<14-digit timestamp>_<snake_case>.sql)" \
    || bad "migration file names" "$BADNAMES"$'\n'"Create migrations with: supabase migration new <what>"

  if [ -n "$MERGE_BASE" ]; then
    EDITED=$(printf '%s\n' "$CHANGED_STATUS" | awk -v d="$MIG_DIR/" '($1 ~ /^(M|D|R)/) && index($2,d)==1 {print $1"  "$2}' | sort -u)
    [ -z "$EDITED" ] && ok "no deployed migration edited, deleted or renamed" \
      || bad "deployed migration edited, deleted or renamed" "$EDITED"$'\n'"Never edit a merged migration. Revert it and write a new migration instead."
  else
    skip "deployed-migration check (base branch $BASE not found)" required
  fi

  # $'\r' inside $( ) is dropped by Git Bash on Windows, which turns the grep into "match everything".
  CR=$(printf '\r')
  CRFILES=$(grep -lU "$CR" "$MIG_DIR"/*.sql 2>/dev/null || true)
  [ -z "$CRFILES" ] && ok "no CR (Windows) line endings in migrations" \
    || bad "CR line endings in migrations" "$CRFILES"$'\n'"Fix: git add --renormalize . (with .gitattributes eol=lf)"

  DESTRUCTIVE=""
  for m in $NEW_MIGS; do
    [ -f "$m" ] || continue
    hits=$(grep -niE '\b(drop[[:space:]]+(table|column|function|view|schema|type|policy|trigger)|rename[[:space:]]+(to|column)|truncate|delete[[:space:]]+from)\b' "$m" || true)
    [ -n "$hits" ] && DESTRUCTIVE="$DESTRUCTIVE$m:"$'\n'"$hits"$'\n'
  done
  if [ -z "$DESTRUCTIVE" ]; then ok "no destructive statements in new migrations"
  elif [ "${DESTRUCTIVE_APPROVED:-}" = "1" ]; then ok "destructive statements approved (destructive-approved label)"
  else bad "destructive statements need approval" "$DESTRUCTIVE""Two-step rule: ship code that no longer needs it first. Needs a backup step and the person's approval (PR label destructive-approved)."; fi

  # RLS: every table created in an exposed schema must have RLS enabled somewhere in the migrations.
  ALL_SQL=$(cat "$MIG_DIR"/*.sql 2>/dev/null | tr 'A-Z' 'a-z' | tr -d '"')
  TABLES=$(printf '%s\n' "$ALL_SQL" | grep -oE 'create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(public\.)?[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?' \
            | awk '{print $NF}' | grep -vE '^[a-z_]+\.[a-z_]' ; \
           printf '%s\n' "$ALL_SQL" | grep -oE 'create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?public\.[a-z_][a-z0-9_]*' | awk '{print $NF}' | sed 's/^public\.//')
  NO_RLS=""
  for t in $(printf '%s\n' "$TABLES" | sed '/^$/d' | sort -u); do
    printf '%s\n' "$ALL_SQL" | grep -qE "alter[[:space:]]+table[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?(only[[:space:]]+)?(public\.)?$t[[:space:]]+enable[[:space:]]+row[[:space:]]+level[[:space:]]+security" \
      || NO_RLS="$NO_RLS$t "
  done
  [ -z "$NO_RLS" ] && ok "RLS enabled on every public table (static check)" \
    || bad "tables without RLS: ${NO_RLS% }" "Add: alter table public.<name> enable row level security; plus at least one policy."
fi

# ---------- 3. Secrets ----------
echo "[secrets]"
TRACKED_ENV=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)
[ -z "$TRACKED_ENV" ] && ok "no .env files tracked" || bad ".env file tracked: $TRACKED_ENV" "STOP. Secret exposed: tell the person to rotate keys. Don't rewrite history yourself."

if command -v gitleaks >/dev/null 2>&1; then
  GL_OUT=$(gitleaks detect --no-banner --redact --log-level error 2>&1); GL_RC=$?
  case "$GL_RC" in
    0) ok "gitleaks: no secrets in repo history" ;;
    1) bad "gitleaks found secrets" "$(printf '%s\n' "$GL_OUT" | tail -20)"$'\n'"STOP and tell the person. Don't rewrite history yourself." ;;
    *) bad "gitleaks could not run (exit $GL_RC)" "$GL_OUT" ;;
  esac
else
  PATTERNS='(sk_live_[0-9a-zA-Z]{10,}|sk_test_[0-9a-zA-Z]{10,}|sk-ant-[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^:@/[:space:]]+:[^@/[:space:]]+@)'
  HITS=""
  for f in $CHANGED; do
    [ -f "$f" ] || continue
    case "$f" in *.md|*.lock|*lock.json|*lock.yaml) continue ;; esac
    grep -IqE "$PATTERNS" "$f" 2>/dev/null && HITS="$HITS$f"$'\n'
  done
  if [ -z "$HITS" ]; then
    if [ "$IN_CI" = 1 ]; then bad "secret scan (gitleaks not installed in CI)" "add gitleaks to the CI job"
    else ok "basic secret pattern scan on changed files (install gitleaks for a full scan)"; fi
  else bad "possible secrets in changed files" "$HITS""STOP: don't commit. Move the value to a secret store and refer to it by env var name."; fi
fi

# Server-only secrets must never reach client code or the client bundle.
CLIENT_LEAK=$(grep -rlE 'SUPABASE_SERVICE_ROLE_KEY|service_role' --include='*.tsx' --include='*.jsx' . 2>/dev/null \
  | grep -vE 'node_modules|/\.next/|/tests?/|\.test\.|\.spec\.' | xargs -r grep -lE "^['\"]use client['\"]" 2>/dev/null || true)
[ -z "$CLIENT_LEAK" ] && ok "no service-role key referenced in client components" \
  || bad "service-role key referenced in client components" "$CLIENT_LEAK"

if [ -d .next/static ] || [ -d dist ] || [ -d build ]; then
  BUNDLE_DIRS=$(ls -d .next/static dist build 2>/dev/null)
  LEAK=""
  for v in SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY OPENAI_API_KEY ANTHROPIC_API_KEY DATABASE_URL; do
    val="${!v:-}"
    [ -n "$val" ] && [ ${#val} -ge 16 ] && grep -rqF "$val" $BUNDLE_DIRS 2>/dev/null && LEAK="$LEAK$v "
  done
  grep -rqE 'sk_live_|sk_test_' $BUNDLE_DIRS 2>/dev/null && LEAK="${LEAK}stripe-secret-pattern "
  [ -z "$LEAK" ] && ok "client bundle has no server secrets" || bad "server secrets in client bundle: $LEAK" "Only NEXT_PUBLIC_* values may reach the client."
fi

# ---------- 4. Code safety lint ----------
echo "[code safety]"
XSS=$(grep -rlE 'dangerouslySetInnerHTML' --include='*.tsx' --include='*.jsx' . 2>/dev/null | grep -v node_modules \
  | xargs -r grep -LE 'DOMPurify|sanitize' 2>/dev/null || true)
[ -z "$XSS" ] && ok "no unsanitized dangerouslySetInnerHTML" || bad "dangerouslySetInnerHTML without sanitizing" "$XSS"

# ---------- 5. Project checks (typecheck, lint, tests, build) ----------
if [ -f package.json ]; then
  echo "[project]"
  PM=npm
  [ -f pnpm-lock.yaml ] && PM=pnpm
  [ -f yarn.lock ] && PM=yarn
  [ -f bun.lockb ] && PM=bun
  has_script() { node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)" 2>/dev/null; }
  run_script() {   # name, required(yes/no)
    if has_script "$1"; then
      if $PM run "$1" >/tmp/verify-"$1".log 2>&1; then ok "$PM run $1"
      else bad "$PM run $1" "$(tail -20 /tmp/verify-"$1".log)"; fi
    elif [ "$2" = yes ]; then bad "script '$1' missing from package.json" "Add it. verify.sh needs a deterministic $1 command."
    else skip "$1 (no script)"; fi
  }
  run_script typecheck yes
  run_script lint yes
  run_script test yes
  run_script test:e2e no
  run_script build yes
else
  skip "project checks (no package.json)"
fi

# ---------- 6. Database from scratch ----------
if [ -d supabase ]; then
  echo "[database]"
  if [ "$NO_DB" = 1 ]; then
    skip "database build from scratch (--no-db)" required
  elif ! command -v supabase >/dev/null 2>&1 && ! npx --no-install supabase --version >/dev/null 2>&1; then
    skip "database build from scratch (Supabase CLI not installed)" required
  else
    SB="supabase"; command -v supabase >/dev/null 2>&1 || SB="npx --no-install supabase"
    # One log for every DB step, appended, so the real cause of a failure is never overwritten.
    DB_LOG="${TMPDIR:-/tmp}/verify-db.log"
    : > "$DB_LOG"
    echo "  (database log: $DB_LOG)"
    db_step() { echo "===== $* =====" >>"$DB_LOG"; $SB "$@" >>"$DB_LOG" 2>&1; }
    DB_UP=1
    if ! $SB status >/dev/null 2>&1; then
      if ! db_step start; then
        DB_UP=0
        bad "local database could not start" "$(tail -20 "$DB_LOG")"$'\n'"Check that Docker is running and that no other project uses the ports in supabase/config.toml (docker ps)."
      fi
    fi
    if [ "$DB_UP" = 1 ]; then
      if db_step db reset; then ok "all migrations apply to an empty database"
      else bad "migrations don't apply to an empty database" "$(tail -20 "$DB_LOG")"; fi
      if db_step test db; then ok "database tests (supabase test db)"
      else bad "database tests" "$(tail -20 "$DB_LOG")"; fi
      if db_step db lint --level error --fail-on error; then ok "SQL lint (no errors)"
      else bad "SQL lint" "$(tail -20 "$DB_LOG")"; fi
    else
      skip "migrations, database tests and SQL lint (local database not running)"
    fi
  fi
fi

echo
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "verify.sh: PASS $PASS/$TOTAL ($SKIP skipped)"
  exit 0
else
  echo "verify.sh: FAIL $FAIL/$TOTAL failed: ${FAILED_NAMES#, } ($SKIP skipped)"
  exit 1
fi

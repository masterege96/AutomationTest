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
# After the build, the client bundle is scanned for server secrets: values from
# `supabase status -o env` (local stack, read in memory only, never printed), shell-exported
# secret env vars, and secret-shaped patterns. Local stack values are required in CI.
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

  # Destructive scan (L15). SQL comments (-- and nested /* */) and whole GRANT/REVOKE statements
  # (also ALTER DEFAULT PRIVILEGES ... GRANT/REVOKE) are blanked first, so a privilege name such as
  # TRUNCATE in a grant list, or a word in a comment, isn't a statement. Comment markers inside
  # '...' strings or "..." identifiers don't start a comment. Everything else (strings, function
  # bodies) is still scanned. Prints <line number>:<original line> per hit, like grep -n.
  destructive_hits() {
    awk '
      { orig[NR] = $0
        line = $0; out = ""; n = length(line); i = 1
        while (i <= n) {
          c = substr(line, i, 1); nx = substr(line, i + 1, 1)
          if (depth > 0) {
            if (c == "/" && nx == "*") { depth++; out = out "  "; i += 2; continue }
            if (c == "*" && nx == "/") { depth--; out = out "  "; i += 2; continue }
            out = out " "; i++; continue
          }
          if (q != "") {                       # inside a quoted string or identifier
            if (c == q) q = ""
            out = out (c == ";" ? " " : c); i++; continue
          }
          if (c == "-" && nx == "-") break      # line comment: drop the rest of the line
          if (c == "/" && nx == "*") { depth = 1; out = out "  "; i += 2; continue }
          if (c == "\047" || c == "\"") q = c
          out = out c; i++
        }
        text = (NR == 1 ? out : text "\n" out)
      }
      END {
        ns = split(text, st, ";"); res = ""
        for (s = 1; s <= ns; s++) {
          t = st[s]
          if (tolower(t) ~ /^[[:space:]]*(grant|revoke|alter[[:space:]]+default[[:space:]]+privileges)([^a-z0-9_]|$)/) {
            nl = split(t, parts, "\n"); t = ""
            for (k = 2; k <= nl; k++) t = t "\n"
          }
          res = (s == 1 ? t : res ";" t)
        }
        nl = split(res, lines, "\n")
        for (k = 1; k <= nl; k++)
          if (tolower(lines[k]) ~ /(^|[^a-z0-9_])(drop[[:space:]]+(table|column|function|view|schema|type|policy|trigger)|rename[[:space:]]+(to|column)|truncate|delete[[:space:]]+from)([^a-z0-9_]|$)/)
            print k ":" orig[k]
      }' "$1"
  }

  DESTRUCTIVE=""
  for m in $NEW_MIGS; do
    [ -f "$m" ] || continue
    hits=$(destructive_hits "$m" || true)
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
  # --exit-code 99: gitleaks exits 1 on its own errors too, so 99 means "leaks found" only.
  GL_OUT=$(gitleaks detect --no-banner --redact --log-level error --exit-code 99 2>&1); GL_RC=$?
  case "$GL_RC" in
    0) ok "gitleaks: no secrets in repo history" ;;
    99) bad "gitleaks found secrets" "$(printf '%s\n' "$GL_OUT" | tail -20)"$'\n'"STOP and tell the person. Don't rewrite history yourself." ;;
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
# The client-bundle scan runs in [project], right after the build (L27).

# ---------- 4. Code safety lint ----------
echo "[code safety]"
XSS=$(grep -rlE 'dangerouslySetInnerHTML' --include='*.tsx' --include='*.jsx' . 2>/dev/null | grep -v node_modules \
  | xargs -r grep -LE 'DOMPurify|sanitize' 2>/dev/null || true)
[ -z "$XSS" ] && ok "no unsanitized dangerouslySetInnerHTML" || bad "dangerouslySetInnerHTML without sanitizing" "$XSS"

# ---------- 5. Database from scratch ----------
# Runs before the project checks: tests that need the running local stack (auth, e2e)
# must find it started and the database freshly built. The stack is left running.
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

# ---------- 6. Project checks (typecheck, lint, tests, build) ----------
if [ -f package.json ]; then
  echo "[project]"
  PM=npm
  [ -f pnpm-lock.yaml ] && PM=pnpm
  [ -f yarn.lock ] && PM=yarn
  [ -f bun.lockb ] && PM=bun
  has_script() { node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)" 2>/dev/null; }
  run_script() {   # name, required(yes/no); sets RUN_OK=1 only when the script ran and exited 0
    RUN_OK=0
    if has_script "$1"; then
      if $PM run "$1" >/tmp/verify-"$1".log 2>&1; then ok "$PM run $1"; RUN_OK=1
      else bad "$PM run $1" "$(tail -20 /tmp/verify-"$1".log)"; fi
    elif [ "$2" = yes ]; then bad "script '$1' missing from package.json" "Add it. verify.sh needs a deterministic $1 command."
    else skip "$1 (no script)"; fi
  }
  run_script typecheck yes
  run_script lint yes

  # L5: an empty suite must not pass once tests exist.
  TEST_SCRIPT=$(node -e "process.stdout.write(String(require('./package.json').scripts?.test||''))" 2>/dev/null || true)
  if [ -n "$TEST_SCRIPT" ]; then
    if printf '%s' "$TEST_SCRIPT" | grep -q -- '--passWithNoTests'; then
      TEST_FILES=$(find . \( -name node_modules -o -name .next -o -name .git -o -path ./tests/e2e \) -prune -o \
        -type f -print 2>/dev/null | grep -E '\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$' | sed 's#^\./##' | sort | head -5)
      if [ -n "$TEST_FILES" ]; then
        bad "test script has --passWithNoTests while test files exist" "$TEST_FILES"$'\n'"Remove --passWithNoTests from package.json#scripts.test (tasks/lessons.md L5)."
      else ok "test script may use --passWithNoTests (no test files yet)"; fi
    else ok "test script has no --passWithNoTests"; fi
  fi

  run_script test yes
  run_script test:e2e no

  # Client-bundle secret scan (L27): only a bundle written by this build counts. Files count when the
  # bundle dirs held no files before the build, or the file list changed, or a file is newer than a
  # marker taken just before the build (copies can keep an old mtime, so mtime alone isn't enough).
  bundle_list() { find .next/static dist build -type f 2>/dev/null | sort; }
  PRE_BUNDLE=$(bundle_list)
  BUILD_MARK=$(mktemp "${TMPDIR:-/tmp}/verify-build-mark.XXXXXX")
  touch -d '2 seconds ago' "$BUILD_MARK" 2>/dev/null || true
  run_script build yes
  BUNDLE_DIRS=""; FRESH=""
  if [ "$RUN_OK" = 1 ]; then
    for d in .next/static dist build; do [ -d "$d" ] && BUNDLE_DIRS="$BUNDLE_DIRS $d"; done
    POST_BUNDLE=$(bundle_list)
    if [ -n "$POST_BUNDLE" ]; then
      if [ -z "$PRE_BUNDLE" ] || [ "$PRE_BUNDLE" != "$POST_BUNDLE" ]; then FRESH=1
      else
        # shellcheck disable=SC2086
        FRESH=$(find $BUNDLE_DIRS -type f -newer "$BUILD_MARK" 2>/dev/null | head -1)
      fi
    fi
  fi
  rm -f "$BUILD_MARK"
  if [ -z "$FRESH" ]; then
    bad "client bundle scan (no client bundle from this build)" "The build must succeed and write files under .next/static, dist or build."
  else
    # Local stack values, read here (never printed, never written). Same CLI lookup as [database].
    SB_STATUS=""; HAVE_LOCAL=0
    if command -v supabase >/dev/null 2>&1; then SB_STATUS=$(supabase status -o env 2>/dev/null) || SB_STATUS=""
    else SB_STATUS=$(npx --no-install supabase status -o env 2>/dev/null) || SB_STATUS=""; fi
    status_val() { printf '%s\n' "$SB_STATUS" | sed -nE "s/^$1=\"?([^\"]*)\"?[[:space:]]*\$/\1/p" | head -n 1; }
    [ -n "$(status_val SERVICE_ROLE_KEY)" ] && HAVE_LOCAL=1
    # bundle_has <fixed string>: true if any bundle file contains it (value goes via stdin, not argv)
    # shellcheck disable=SC2086
    bundle_has()   { printf '%s\n' "$1" | grep -rqF -f - $BUNDLE_DIRS 2>/dev/null; }
    # shellcheck disable=SC2086
    bundle_files() { printf '%s\n' "$1" | grep -rlF -f - $BUNDLE_DIRS 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }
    LEAK=""; LEAK_DETAIL=""; LOCAL_VALS=""
    add_leak() { LEAK="$LEAK$1 "; LEAK_DETAIL="$LEAK_DETAIL$1: $2"$'\n'; }
    for v in SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY OPENAI_API_KEY ANTHROPIC_API_KEY DATABASE_URL; do
      val="${!v:-}"
      [ -n "$val" ] && [ ${#val} -ge 16 ] && bundle_has "$val" && add_leak "$v" "$(bundle_files "$val")"
    done
    # Server-only values from the local stack. ANON_KEY, PUBLISHABLE_KEY and the URLs are public by design.
    for v in SERVICE_ROLE_KEY SECRET_KEY JWT_SECRET DB_URL S3_PROTOCOL_ACCESS_KEY_SECRET; do
      val=$(status_val "$v")
      [ ${#val} -ge 8 ] || continue
      LOCAL_VALS="$LOCAL_VALS$val"$'\n'
      bundle_has "$val" && add_leak "$v" "$(bundle_files "$val")"
    done
    # shellcheck disable=SC2086
    grep -rqE 'sk_live_|sk_test_' $BUNDLE_DIRS 2>/dev/null \
      && add_leak stripe-secret-pattern "$(grep -rlE 'sk_live_|sk_test_' $BUNDLE_DIRS 2>/dev/null | tr '\n' ' ' | sed 's/ $//')"
    # Pattern hits that equal a local value are already reported under that value's name.
    is_local() { [ -n "$LOCAL_VALS" ] && printf '%s' "$LOCAL_VALS" | grep -qxF -- "$1"; }
    SB_RE='sb_secret_[A-Za-z0-9_-]{20,}'
    # shellcheck disable=SC2086
    SB_HITS=$(LC_ALL=C grep -rohE "$SB_RE" $BUNDLE_DIRS 2>/dev/null | sort -u)
    SB_FILES=""
    while IFS= read -r tok; do
      [ -n "$tok" ] && ! is_local "$tok" && SB_FILES="$SB_FILES $(bundle_files "$tok")"
    done <<EOF
$SB_HITS
EOF
    [ -n "$SB_FILES" ] && add_leak sb-secret-key-pattern "$(printf '%s\n' $SB_FILES | sort -u | tr '\n' ' ' | sed 's/ $//')"
    # JWTs whose payload says "role":"service_role" (any signing key).
    JWT_RE='eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
    # shellcheck disable=SC2086
    JWT_HITS=$(LC_ALL=C grep -rohE "$JWT_RE" $BUNDLE_DIRS 2>/dev/null | sort -u)
    JWT_FILES=""
    while IFS= read -r tok; do
      [ -n "$tok" ] || continue
      is_local "$tok" && continue
      p=$(printf '%s' "$tok" | cut -d. -f2 | tr '_-' '/+')
      case $(( ${#p} % 4 )) in 2) p="$p==" ;; 3) p="$p=" ;; esac
      printf '%s' "$p" | base64 -d 2>/dev/null | tr -d '[:space:]' | grep -q '"role":"service_role"' \
        && JWT_FILES="$JWT_FILES $(bundle_files "$tok")"
    done <<EOF
$JWT_HITS
EOF
    [ -n "$JWT_FILES" ] && add_leak service-role-jwt-pattern "$(printf '%s\n' $JWT_FILES | sort -u | tr '\n' ' ' | sed 's/ $//')"
    unset SB_STATUS LOCAL_VALS SB_HITS JWT_HITS val tok p

    if [ "$HAVE_LOCAL" = 0 ] && [ "$IN_CI" = 0 ]; then
      echo "  (local stack not running: client bundle checked for secret patterns only)"
    fi
    if [ -n "$LEAK" ]; then
      CI_NOTE=""; [ "$HAVE_LOCAL" = 0 ] && [ "$IN_CI" = 1 ] && CI_NOTE="local stack values unavailable (required in CI)"$'\n'
      bad "server secrets in client bundle: ${LEAK% }" "$CI_NOTE$LEAK_DETAIL""Only NEXT_PUBLIC_* values may reach the client."
    elif [ "$HAVE_LOCAL" = 0 ] && [ "$IN_CI" = 1 ]; then
      bad "client bundle has no server secrets (local stack values unavailable, required in CI)" "CI starts the local stack before verify.sh; supabase status -o env must report SERVICE_ROLE_KEY."
    else
      ok "client bundle has no server secrets"
    fi
  fi
else
  skip "project checks (no package.json)"
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

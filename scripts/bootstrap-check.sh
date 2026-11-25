#!/usr/bin/env bash
# bootstrap-check.sh: the Phase 0 gate.
#
# No task may leave BACKLOG until this exits 0. Run from the repo root.
#
# Usage:
#   scripts/bootstrap-check.sh            # full check (needs `gh` signed in for branch protection)
#   scripts/bootstrap-check.sh --offline  # skips the GitHub API checks (reported as SKIP, never PASS)
#
# Exit codes: 0 = all checks pass, 1 = at least one check failed.

set -uo pipefail

OFFLINE=0
[ "${1:-}" = "--offline" ] && OFFLINE=1

PASS=0; FAIL=0; SKIP=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "        fix: $2"; FAIL=$((FAIL+1)); }
skip() { echo "  SKIP  $1"; SKIP=$((SKIP+1)); }

WF_DIR=".github/workflows"
wf_grep() { [ -d "$WF_DIR" ] && grep -rqiE "$1" "$WF_DIR" 2>/dev/null; }

echo "Phase 0 bootstrap check"
echo

# ---------- Git ----------
echo "[git]"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "git repository"
  cd "$(git rev-parse --show-toplevel)" || exit 1
else
  bad "git repository" "git init && git remote add origin <url>"
  echo; echo "bootstrap-check: FAIL (not a git repo)"; exit 1
fi

if [ -n "$(git remote 2>/dev/null)" ]; then ok "git remote configured"
else bad "git remote configured" "create the GitHub repo, then: git remote add origin <url>"; fi

if git rev-parse --verify --quiet main >/dev/null || git rev-parse --verify --quiet origin/main >/dev/null; then
  ok "main branch exists"
else
  bad "main branch exists" "git branch -M main && git push -u origin main"
fi

if [ -f .gitignore ] && grep -qE '^\.env' .gitignore; then ok ".gitignore covers .env files"
else bad ".gitignore covers .env files" "add '.env*' and '!.env.example' to .gitignore"; fi

TRACKED_ENV=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)
if [ -z "$TRACKED_ENV" ]; then ok "no .env files tracked by git"
else bad "no .env files tracked by git (found: $TRACKED_ENV)" "STOP: treat as an exposed secret. Rotate keys, then git rm --cached the file"; fi

if [ -f .gitattributes ] && grep -qE 'eol=lf' .gitattributes; then ok ".gitattributes forces LF"
else bad ".gitattributes forces LF" "add '* text=auto eol=lf' to .gitattributes"; fi

[ -f .github/pull_request_template.md ] || [ -f .github/PULL_REQUEST_TEMPLATE.md ] \
  && ok "PR template" || bad "PR template" "add .github/pull_request_template.md"

# ---------- GitHub settings ----------
echo "[github]"
if [ "$OFFLINE" = 1 ]; then
  skip "branch protection on main (offline mode: CI must run the full check)"
elif ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  bad "branch protection on main (gh CLI missing or not signed in, so it can't be verified)" "install gh and run gh auth login, or run with --offline locally"
else
  PROT=$(gh api "repos/{owner}/{repo}/branches/main/protection" 2>/dev/null || true)
  if [ -z "$PROT" ]; then
    bad "branch protection on main" "Settings > Branches: protect main, require PR review and status checks"
  else
    echo "$PROT" | grep -q '"required_pull_request_reviews"' \
      && ok "main requires PR review" || bad "main requires PR review" "enable 'Require a pull request before merging'"
    echo "$PROT" | grep -q '"required_status_checks"' \
      && ok "main requires status checks" || bad "main requires status checks" "enable 'Require status checks to pass' and select the verify and db-check jobs"
  fi
fi

# ---------- CI/CD ----------
echo "[ci/cd]"
if [ -d "$WF_DIR" ] && ls "$WF_DIR"/*.y*ml >/dev/null 2>&1; then ok "GitHub Actions workflows exist"
else bad "GitHub Actions workflows exist" "add .github/workflows/ci.yml"; fi

wf_grep 'scripts/verify\.sh' && ok "CI runs scripts/verify.sh" || bad "CI runs scripts/verify.sh" "add a job that runs scripts/verify.sh on pull_request"
wf_grep 'pull_request' && ok "CI triggers on pull requests" || bad "CI triggers on pull requests" "add 'on: pull_request' to the CI workflow"
wf_grep 'gitleaks|trufflehog' && ok "CI secret scan" || bad "CI secret scan" "add a gitleaks step to CI"

if [ -d supabase ]; then
  wf_grep 'supabase (db reset|db start|start)' && ok "CI builds the DB from scratch (db-check)" \
    || bad "CI builds the DB from scratch (db-check)" "add a db-check job: supabase start, supabase db reset, supabase test db, supabase db lint"
  wf_grep 'schedule' && wf_grep 'db diff' && ok "scheduled drift check" \
    || bad "scheduled drift check" "add a nightly workflow (on: schedule) running supabase db diff against production"
  # Deploy path: Supabase GitHub integration (declared in PROJECT_CONTEXT) or a CI db push job.
  if wf_grep 'db push' || grep -iE 'deploy path:' PROJECT_CONTEXT.md 2>/dev/null | grep -viE ' / CI job' | grep -qiE 'integration'; then
    ok "DB deploy path connected"
  else
    bad "DB deploy path connected" "connect the Supabase GitHub integration (and write 'Deploy path: Supabase GitHub integration' in PROJECT_CONTEXT.md) or add a CI job running supabase db push on main"
  fi
fi

# ---------- Versions ----------
echo "[versions]"
if [ -f package.json ]; then
  if [ -f .nvmrc ] || [ -f .node-version ]; then ok "Node version pinned (.nvmrc)"
  else bad "Node version pinned (.nvmrc)" "echo 22 > .nvmrc (use your chosen version)"; fi

  grep -q '"engines"' package.json && ok "package.json engines set" || bad "package.json engines set" "add \"engines\": {\"node\": \"<version>\"}"
  grep -q '"packageManager"' package.json && ok "packageManager pinned" || bad "packageManager pinned" "add \"packageManager\": \"pnpm@x.y.z\" (or npm/yarn)"

  # verify.sh runs these; each must exist so "done" has a deterministic pass/fail.
  MISSING_SCRIPTS=""
  for s in typecheck lint test build; do
    node -e "process.exit(require('./package.json').scripts?.['$s']?0:1)" 2>/dev/null || MISSING_SCRIPTS="$MISSING_SCRIPTS $s"
  done
  [ -z "$MISSING_SCRIPTS" ] && ok "npm scripts typecheck, lint, test, build exist" \
    || bad "npm scripts missing:$MISSING_SCRIPTS" "add them to package.json#scripts (verify.sh runs them)"

  LOCK=""; for l in package-lock.json pnpm-lock.yaml yarn.lock bun.lockb bun.lock; do git ls-files --error-unmatch "$l" >/dev/null 2>&1 && LOCK="$l"; done
  if [ -n "$LOCK" ]; then ok "lockfile committed ($LOCK)"
  else bad "lockfile committed" "run your package manager install and commit the lockfile"; fi

  if grep -qE '"[^"]+":[[:space:]]*"(latest|\*|x)"' package.json; then
    bad "no 'latest' or '*' versions in package.json" "replace with exact versions"
  else ok "no 'latest' or '*' versions in package.json"; fi

  NVM_FILE=.nvmrc; [ -f .nvmrc ] || NVM_FILE=.node-version
  if [ -f "$NVM_FILE" ] && command -v node >/dev/null 2>&1; then
    WANT=$(tr -d ' v\r\n' < "$NVM_FILE"); HAVE=$(node -v | tr -d 'v')
    case "$HAVE" in
      "$WANT"|"$WANT".*) ok "local Node $HAVE matches pinned $WANT" ;;
      *) bad "local Node $HAVE matches pinned $WANT" "nvm use (or install Node $WANT)" ;;
    esac
  fi
else
  skip "Node checks (no package.json)"
fi

if [ -d supabase ]; then
  SB_PIN=""
  [ -f package.json ] && SB_PIN=$(grep -oE '"supabase":[[:space:]]*"[^"]+"' package.json | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  [ -z "$SB_PIN" ] && [ -f .supabase-cli-version ] && SB_PIN=$(tr -d ' \r\n' < .supabase-cli-version)
  if [ -z "$SB_PIN" ]; then
    bad "Supabase CLI version pinned" "add \"supabase\": \"<exact version>\" to devDependencies (or a .supabase-cli-version file)"
  elif echo "$SB_PIN" | grep -qE '^[\^~]|latest|\*'; then
    bad "Supabase CLI pinned to an exact version (found $SB_PIN)" "use an exact version, no ^ or ~"
  else
    ok "Supabase CLI pinned ($SB_PIN)"
    SB_HAVE=$( (npx --no-install supabase --version 2>/dev/null || supabase --version 2>/dev/null) | tail -1 | tr -d '\r')
    if [ -n "$SB_HAVE" ] && [ "$SB_HAVE" != "$SB_PIN" ]; then bad "local Supabase CLI $SB_HAVE matches pinned $SB_PIN" "install the pinned version"
    elif [ -n "$SB_HAVE" ]; then ok "local Supabase CLI matches pinned"; fi
  fi
  wf_grep 'version:[[:space:]]*latest' && bad "CI doesn't use 'latest' tool versions" "pin versions in setup actions" || ok "CI doesn't use 'latest' tool versions"
fi

# ---------- Database layout ----------
if [ -d supabase ]; then
  echo "[database]"
  [ -f supabase/config.toml ] && ok "supabase/config.toml" || bad "supabase/config.toml" "supabase init"
  [ -d supabase/migrations ] && ok "supabase/migrations/" || bad "supabase/migrations/" "supabase migration new init"
  [ -d supabase/tests ] && ls supabase/tests/*.sql >/dev/null 2>&1 && ok "at least one DB test (supabase/tests)" \
    || bad "at least one DB test (supabase/tests)" "add a pgTAP test, e.g. supabase/tests/rls_test.sql"
fi

# ---------- Project context ----------
echo "[context]"
if [ -f PROJECT_CONTEXT.md ]; then
  grep -qE '^\- \*\*Hosting type:\*\* *[A-Za-z]' PROJECT_CONTEXT.md && ! grep -qE 'Hosting type:\*\* *Supabase-hosted / self' PROJECT_CONTEXT.md \
    && ok "PROJECT_CONTEXT.md filled in (hosting type chosen)" \
    || bad "PROJECT_CONTEXT.md filled in (hosting type chosen)" "copy templates/PROJECT_CONTEXT.md and fill it in"
else
  bad "PROJECT_CONTEXT.md exists" "copy templates/PROJECT_CONTEXT.md to the repo root and fill it in"
fi
[ -f scripts/verify.sh ] && ok "scripts/verify.sh present" || bad "scripts/verify.sh present" "copy scripts/verify.sh from the framework"

echo
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "bootstrap-check: PASS $PASS/$TOTAL ($SKIP skipped)"
  exit 0
else
  echo "bootstrap-check: FAIL $FAIL of $TOTAL checks failed ($SKIP skipped). Phase 0 is not complete: only git-release and devops-cicd may work."
  exit 1
fi

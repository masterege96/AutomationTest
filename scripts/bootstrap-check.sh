#!/usr/bin/env bash
# bootstrap-check.sh: the Phase 0 gate.
#
# No task may leave BACKLOG until this exits 0. Run from the repo root.
#
# Usage:
#   scripts/bootstrap-check.sh            # full check (needs `gh` signed in: branch protection, production
#                                         # Environment and repo secret names, all read-only GET requests)
#   scripts/bootstrap-check.sh --offline  # skips the GitHub API checks (reported as SKIP, never PASS)
#
# Exit codes: 0 = all checks pass (accepted risks included, see S19 below), 1 = at least one check failed.

set -uo pipefail

OFFLINE=0
[ "${1:-}" = "--offline" ] && OFFLINE=1

PASS=0; FAIL=0; SKIP=0; RISK=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "        fix: $2"; FAIL=$((FAIL+1)); }
skip() { echo "  SKIP  $1"; SKIP=$((SKIP+1)); }

# S19 accepted risk: the person's decision file accepts exactly what it describes: production has no deployment
# branch policy (all branches), and the repository-level secrets SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD and
# SUPABASE_PROJECT_ID, until a later decision closes it. While the file exists and no file in tasks/decisions/
# has the exact line "Closes decision: <file name>" (CR ignored), those two findings print RISK instead of FAIL:
# counted apart, not failures. Any other non-main policy, or any other repository-level SUPABASE_* secret,
# still FAILs. Decision files are only read as text (grep -F), never executed. A PASS stays a PASS; unreadable
# answers and a missing Environment still FAIL.
S19_DECISION="tasks/decisions/2026-11-25-4d-supabase-secrets-accepted-until-step4.md"
S19_CLOSE_LINE="Closes decision: ${S19_DECISION##*/}"
S19_ACCEPTED_SECRETS="SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID"
s19_risk_open() {
  [ -f "$S19_DECISION" ] || return 1
  local f
  while IFS= read -r -d '' f; do
    tr -d '\r' <"$f" | grep -qxF -- "$S19_CLOSE_LINE" && return 1
  done < <(find tasks/decisions -type f -print0 2>/dev/null)
  return 0
}
risk() { echo "  RISK  $1 (ACCEPTED RISK until step 4 ends, see $S19_DECISION)"; [ -n "${2:-}" ] && echo "        fix: $2"; RISK=$((RISK+1)); }
s19_bad() { if [ "$S19_RISK_OPEN" = 1 ]; then risk "$@"; else bad "$@"; fi; }

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

# S19: production credentials live only in the main-only `production` Environment.
# Read-only GET requests; the secrets API returns names only, never values.
ENV_NAME="GitHub Environment production exists"
POL_NAME="production deploys only from main (deployment branch policy)"
SEC_NAME="no repository-level SUPABASE_* secrets"
ENV_FIX="Settings > Environments: create production, deployment branches: selected branches, main only"
POL_FIX="Settings > Environments > production > Deployment branches: 'Selected branches and tags' with exactly one branch rule: main (not 'Protected branches only')"
if [ "$OFFLINE" = 1 ]; then
  skip "production environment and repo secrets (offline mode: CI must run the full check)"
elif ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  bad "production environment and repo secrets (gh CLI missing or not signed in, so they can't be verified)" "install gh and run gh auth login, or run with --offline locally"
else
  S19_RISK_OPEN=0; s19_risk_open && S19_RISK_OPEN=1
  GH_ERR=$(mktemp "${TMPDIR:-/tmp}/bootstrap-gh.XXXXXX"); GH_OUT=$(mktemp "${TMPDIR:-/tmp}/bootstrap-gh.XXXXXX")
  # gh_get <path> [extra gh args]: sets GH_BODY (whitespace removed); on failure sets GH_CODE
  # (HTTP code from gh's stderr, or empty) and returns 1. Runs in this shell (no subshell).
  gh_get() {
    local p="$1"; shift
    GH_CODE=""; GH_BODY=""
    if gh api --method GET "$@" "$p" >"$GH_OUT" 2>"$GH_ERR"; then GH_BODY=$(tr -d '[:space:]' <"$GH_OUT"); return 0; fi
    GH_CODE=$(grep -oE 'HTTP [0-9]{3}' "$GH_ERR" | tail -1 | cut -d' ' -f2)
    return 1
  }
  unreadable() { [ -n "$GH_CODE" ] && echo "(could not read: HTTP $GH_CODE)" || echo "(could not read: gh api failed)"; }

  gh_get "repos/{owner}/{repo}/environments/production"; ENV_RC=$?; ENV_JSON="$GH_BODY"
  if [ "$ENV_RC" = 0 ] && [ -n "$ENV_JSON" ]; then
    ok "$ENV_NAME"
    if echo "$ENV_JSON" | grep -q '"deployment_branch_policy":null' || ! echo "$ENV_JSON" | grep -q '"deployment_branch_policy":'; then
      s19_bad "$POL_NAME" "$POL_FIX (now: all branches)"
    elif echo "$ENV_JSON" | grep -q '"protected_branches":true'; then
      bad "$POL_NAME" "$POL_FIX (now: protected branches)"
    elif ! echo "$ENV_JSON" | grep -q '"custom_branch_policies":true'; then
      bad "$POL_NAME" "$POL_FIX"
    elif ! gh_get "repos/{owner}/{repo}/environments/production/deployment-branch-policies?per_page=100"; then
      bad "$POL_NAME $(unreadable)" "$POL_FIX"
    else
      POL_JSON="$GH_BODY"
      # Each policy object carries "name" and "type"; exactly one, the branch rule main.
      POL_COUNT=$(echo "$POL_JSON" | grep -oE '"name":"[^"]*"' | wc -l | tr -d ' ')
      if [ "$POL_COUNT" = 1 ] && echo "$POL_JSON" | grep -q '"name":"main"' && echo "$POL_JSON" | grep -q '"type":"branch"'; then
        ok "$POL_NAME"
      else
        bad "$POL_NAME" "$POL_FIX (now: $POL_COUNT rule(s), not exactly the branch main)"
      fi
    fi
  elif [ "$ENV_RC" != 0 ] && [ "$GH_CODE" = 404 ]; then
    bad "$ENV_NAME" "$ENV_FIX"
    bad "$POL_NAME" "$POL_FIX"
  else
    bad "$ENV_NAME $(unreadable)" "check that gh can read the repository's environments"
    bad "$POL_NAME $(unreadable)" "$POL_FIX"
  fi

  if gh_get "repos/{owner}/{repo}/actions/secrets?per_page=100" --paginate; then
    FOUND=$(printf '%s' "$GH_BODY" | grep -oE '"name":"SUPABASE_[^"]*"' | sed -E 's/^"name":"(.*)"$/\1/' | sort -u | paste -sd, - | sed 's/,/, /g')
    # RISK only if every name found is one of the three the decision names; any other SUPABASE_* secret FAILs.
    OTHER=""
    for s in ${FOUND//,/ }; do
      case " $S19_ACCEPTED_SECRETS " in *" $s "*) ;; *) OTHER="$OTHER $s" ;; esac
    done
    if [ -z "$FOUND" ]; then ok "$SEC_NAME"
    elif [ -n "$OTHER" ]; then bad "$SEC_NAME (found: $FOUND)" "move it to the production Environment (Settings > Environments > production > Environment secrets) and delete the repository secret"
    else s19_bad "$SEC_NAME (found: $FOUND)" "move it to the production Environment (Settings > Environments > production > Environment secrets) and delete the repository secret"; fi
  else
    bad "$SEC_NAME $(unreadable)" "gh needs read access to the repository's Actions secrets (names only)"
  fi
  rm -f "$GH_ERR" "$GH_OUT"
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
TOTAL=$((PASS+FAIL+RISK))
# With no accepted risk the summary is exactly as before; otherwise "<n> accepted risk(s), " precedes the skip count.
RISK_NOTE=""
[ "$RISK" -eq 1 ] && RISK_NOTE="1 accepted risk, "
[ "$RISK" -gt 1 ] && RISK_NOTE="$RISK accepted risks, "
if [ "$FAIL" -eq 0 ]; then
  echo "bootstrap-check: PASS $PASS/$TOTAL (${RISK_NOTE}$SKIP skipped)"
  exit 0
else
  echo "bootstrap-check: FAIL $FAIL of $TOTAL checks failed (${RISK_NOTE}$SKIP skipped). Phase 0 is not complete: only git-release and devops-cicd may work."
  exit 1
fi

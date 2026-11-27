#!/usr/bin/env bash
# Format check of the drift check's connection URL (task 4e, L12). Prints no part of the value.
#
# Usage: DRIFT_DB_URL=<url> scripts/ci/drift-url-check.sh [--add-masks]
#   Reads the URL from the env var DRIFT_DB_URL (the workflow maps the secret SUPABASE_DRIFT_DB_URL to it).
#   Expected: postgresql://drift_reader.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
#   (scheme postgres:// accepted; optional query ?sslmode=<value> only).
#   Exit 0 + "URL check: session pooler URL for drift_reader (format OK)" when the format is right.
#   Exit 1 + "::error::drift check broken: SUPABASE_DRIFT_DB_URL <part> is not in the expected format (<hint>)"
#   otherwise. <part> is one of: value, scheme, user, ref, password, host, port, database, query.
#   --add-masks: after a passing check, also prints ::add-mask:: lines for the password, the ref and the host
#   (GitHub Actions only: the runner consumes them, they don't show in the log).
set -uo pipefail
export LC_ALL=C

ADD_MASKS=0
case "${1:-}" in
  "") ;;
  --add-masks) ADD_MASKS=1 ;;
  *) echo "usage: DRIFT_DB_URL=<url> drift-url-check.sh [--add-masks]" >&2; exit 2 ;;
esac

fail() {
  echo "::error::drift check broken: SUPABASE_DRIFT_DB_URL $1 is not in the expected format ($2)"
  exit 1
}

U="${DRIFT_DB_URL:-}"
NL=$'\n'
CR=$'\r'
[ -n "$U" ] || fail value "set the session pooler URL"

# Leading or trailing whitespace, or a line break anywhere (spaces inside a part are caught by that part).
case "$U" in
  *"$NL"* | *"$CR"* | [[:space:]]* | *[[:space:]]) fail value "no spaces or line breaks" ;;
esac

# Scheme.
case "$U" in
  postgresql://*) REST="${U#postgresql://}" ;;
  postgres://*) REST="${U#postgres://}" ;;
  *) fail scheme "postgresql://" ;;
esac

# Authority (userinfo@host:port) ends at the first "/"; the rest is the database and the query.
if [[ "$REST" == */* ]]; then
  AUTHORITY="${REST%%/*}"
  PATH_PART="${REST#*/}"
  HAS_PATH=1
else
  AUTHORITY="$REST"
  PATH_PART=""
  HAS_PATH=0
fi

if [[ "$AUTHORITY" == *@* ]]; then
  USERINFO="${AUTHORITY%@*}"
  HOSTPORT="${AUTHORITY##*@}"
else
  USERINFO=""
  HOSTPORT="$AUTHORITY"
fi

if [[ "$USERINFO" == *:* ]]; then
  USER_PART="${USERINFO%%:*}"
  PASSWORD="${USERINFO#*:}"
else
  USER_PART="$USERINFO"
  PASSWORD=""
fi

# User: exactly drift_reader.<ref> (case-sensitive).
[[ "$USER_PART" == drift_reader.* ]] || fail user "drift_reader.<project ref>"
REF="${USER_PART#drift_reader.}"
[[ "$REF" =~ ^[a-z]{20}$ ]] || fail ref "20 lowercase letters (Project Settings > General > Reference ID)"

# Password: present.
[ -n "$PASSWORD" ] || fail password "password required"

# Host and port.
if [[ "$HOSTPORT" == *:* ]]; then
  HOST="${HOSTPORT%:*}"
  PORT="${HOSTPORT##*:}"
else
  HOST="$HOSTPORT"
  PORT=""
fi
[[ "$HOST" =~ ^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$ ]] ||
  fail host "session pooler host aws-<n>-<region>.pooler.supabase.com (GitHub runners have no IPv6)"
[ "$PORT" = "5432" ] || fail port "port 5432 (session mode)"

# Database and query.
[ "$HAS_PATH" = 1 ] || fail database "database postgres"
if [[ "$PATH_PART" == *\?* ]]; then
  DB="${PATH_PART%%\?*}"
  QUERY="${PATH_PART#*\?}"
  HAS_QUERY=1
else
  DB="$PATH_PART"
  QUERY=""
  HAS_QUERY=0
fi
[ "$DB" = "postgres" ] || fail database "database postgres"
if [ "$HAS_QUERY" = 1 ]; then
  [[ "$QUERY" =~ ^sslmode=[a-z-]+$ ]] || fail query "only sslmode=..."
fi

echo "URL check: session pooler URL for drift_reader (format OK)"

if [ "$ADD_MASKS" = 1 ]; then
  # The whole secret is masked by GitHub; a part the CLI might print in an error is not, so mask each part.
  echo "::add-mask::$PASSWORD"
  echo "::add-mask::$REF"
  echo "::add-mask::$HOST"
fi
exit 0

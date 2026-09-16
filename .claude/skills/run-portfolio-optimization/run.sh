#!/usr/bin/env bash
# Local driver for the web app + API, with three tenants on three hostnames.
#
#   run.sh up              fresh scratch DB, tenants, analysts, both servers
#   run.sh login <tenant>  sign <tenant>'s analyst in and hand agent-browser the cookie
#   run.sh status          health + which org each hostname resolves to
#   run.sh shot <s> <name> screenshot session <s> to $DEMO_DIR/shots/<name>.png
#   run.sh calls [n]       last n non-auth writes the API received
#   run.sh stop            kill whatever listens on :3000 and :8001
#
# Tenants: d2c -> http://localhost:3000, acme -> http://acme.localhost:3000,
#          borealis -> http://borealis.localhost:3000
#
# Everything lives in $DEMO_DIR (a throwaway SQLite file plus logs). Nothing
# touches apps/api/portfolio.db or any real database.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEMO_DIR="${DEMO_DIR:-${TMPDIR:-/tmp}/portfolio-optimization-demo}"
DEMO_DIR="${DEMO_DIR%/}"
DB_FILE="$DEMO_DIR/demo.db"
API=http://localhost:8001
WEB=http://localhost:3000
PASSWORD=demo-password-123

origin_for() {
  case "$1" in
    d2c) echo "http://localhost:3000" ;;
    acme) echo "http://acme.localhost:3000" ;;
    borealis) echo "http://borealis.localhost:3000" ;;
    *) echo "unknown tenant '$1' (d2c | acme | borealis)" >&2; exit 2 ;;
  esac
}

email_for() {
  case "$1" in
    d2c) echo "analista@d2c.example" ;;
    acme) echo "analyst@acme.example" ;;
    borealis) echo "analyst@borealis.example" ;;
  esac
}

kill_port() {
  local pids
  pids="$(lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
}

wait_for() {
  local url="$1" label="$2" tries="${3:-90}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then echo "✓ $label up"; return 0; fi
    sleep 1
  done
  echo "✗ $label did not come up at $url — see $DEMO_DIR/*.log" >&2
  exit 1
}

api_env() {
  env DATABASE_URL="file:$DB_FILE" PORT=8001 \
    FRONTEND_URL="$WEB" BACKEND_URL="$API" \
    BETTER_AUTH_SECRET=local-demo-secret-not-for-production-0123456789 "$@"
}

provision() {
  # provision:tenant only accepts *.optim.app (decision D6); `up` remaps the
  # domain rows to *.localhost afterwards so a local browser can reach them.
  DATABASE_URL="file:$DB_FILE" pnpm --filter api --silent provision:tenant -- "$@" >/dev/null
}

sign_up() {
  local email="$1" name="$2" code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/auth/sign-up/email" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"name\":\"$name\"}")"
  [ "$code" = 200 ] || { echo "✗ sign-up for $email returned $code" >&2; exit 1; }
}

# Onboards and funds an analyst. With a slug, first moves their membership into
# that tenant as owner (D3: one user, one org) — the step provision:tenant
# cannot do yet (PLAN Task 0.9). Without one, they stay in the personal org the
# signup hook created.
place_user() {
  local email="$1" slug="$2"
  sqlite3 "$DB_FILE" <<SQL
$( [ -n "$slug" ] && cat <<MOVE
UPDATE organization_member
SET organization_id = (SELECT id FROM organization WHERE slug = '$slug'), role = 'owner'
WHERE user_id = (SELECT id FROM user WHERE email = '$email');
MOVE
)
UPDATE user SET email_verified = 1 WHERE email = '$email';

INSERT INTO user_profile (
  user_id, organization_id, country_code, currency, experience, horizon,
  risk_behavior, risk_tolerance, goal, markets_of_interest, concept_familiarity,
  current_step, completed_at, created_at, updated_at
)
SELECT u.id, m.organization_id, 'AR', 'USD', 'intermediate', 'long', 'hold', 'medium',
       'growth', '["NYSE","NASDAQ"]', '["markowitz","sharpe"]', 3, unixepoch(), unixepoch(), unixepoch()
FROM user u JOIN organization_member m ON m.user_id = u.id
WHERE u.email = '$email';

-- Fund through the ledger so wallet == SUM(ledger) still holds.
INSERT INTO credit_ledger (id, user_id, organization_id, delta, reason, idempotency_key, balance_after, created_at)
SELECT 'demo-grant-' || m.organization_id, NULL, m.organization_id, 250, 'grant',
       'demo:grant:' || m.organization_id, 250, unixepoch()
FROM user u JOIN organization_member m ON m.user_id = u.id
WHERE u.email = '$email';

INSERT INTO wallet_balance (organization_id, credits, updated_at)
SELECT m.organization_id, 250, unixepoch()
FROM user u JOIN organization_member m ON m.user_id = u.id
WHERE u.email = '$email'
ON CONFLICT (organization_id) DO UPDATE SET credits = 250;
SQL
}

cmd_up() {
  kill_port 3000
  kill_port 8001
  rm -rf "$DEMO_DIR"
  mkdir -p "$DEMO_DIR/shots"
  cd "$ROOT"

  # drizzle.config.ts loads no dotenv: without an explicit DATABASE_URL this
  # would migrate apps/api/portfolio.db instead of the scratch file.
  DATABASE_URL="file:$DB_FILE" pnpm --filter api --silent db:migrate >/dev/null
  echo "✓ migrated $DB_FILE"

  DATABASE_URL="file:$DB_FILE" pnpm --filter api --silent seed:dev-org >/dev/null
  echo "✓ default (D2C) tenant on localhost"

  provision --slug acme --name "Acme Capital" --hostname acme.optim.app --tier whitelabel \
    --support-email soporte@acme.example --privacy-url https://acme.example/privacidad \
    --terms-url https://acme.example/terminos --accent "#0f766e" \
    --product-name "Acme Portfolio Lab" --short-name "Acme" \
    --tagline "Construcción de carteras para asesores Acme"
  provision --slug borealis --name "Borealis Advisors" --hostname borealis.optim.app --tier cobranded \
    --support-email help@borealis.example --privacy-url https://borealis.example/privacy \
    --terms-url https://borealis.example/terms --accent "#4338ca" \
    --product-name "Borealis Allocator" --short-name "Borealis" \
    --tagline "Portfolio design for Borealis clients"
  sqlite3 "$DB_FILE" "UPDATE organization_domain SET hostname = replace(hostname, '.optim.app', '.localhost') WHERE hostname LIKE '%.optim.app';"
  echo "✓ tenants acme (whitelabel, teal) and borealis (co-branded, indigo)"

  # No .env exists in a fresh checkout, and `pnpm dev` in apps/api passes
  # --env-file=.env; run tsx directly with the environment inline instead.
  (cd "$ROOT/apps/api" && api_env nohup ./node_modules/.bin/tsx src/index.ts \
    >"$DEMO_DIR/api.log" 2>&1 </dev/null &)
  wait_for "$API/api/health" "API :8001"

  sign_up "$(email_for d2c)" "Martín Gómez"
  sign_up "$(email_for acme)" "Lucía Fernández"
  sign_up "$(email_for borealis)" "Noah Lindqvist"
  place_user "$(email_for d2c)" ""
  place_user "$(email_for acme)" acme
  place_user "$(email_for borealis)" borealis
  echo "✓ one onboarded, funded (250 credits) analyst per tenant"

  (cd "$ROOT/apps/web" && API_URL="$API" nohup ./node_modules/.bin/next dev -p 3000 \
    >"$DEMO_DIR/web.log" 2>&1 </dev/null &)
  wait_for "$WEB/" "web :3000" 180

  echo
  echo "DEMO_DIR=$DEMO_DIR"
  echo "Next: run.sh login <d2c|acme|borealis>, then drive agent-browser --session <tenant>"
}

cmd_login() {
  local tenant="${1:-}" origin email token
  origin="$(origin_for "$tenant")"
  email="$(email_for "$tenant")"

  # Sign in server-side, with no Origin header. From a tenant hostname the
  # browser's own sign-in gets a 403: BetterAuth's trustedOrigins is still the
  # single static FRONTEND_URL (PLAN Task 1.0 is unbuilt).
  token="$(curl -s -D - -o /dev/null -X POST "$API/api/auth/sign-in/email" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" \
    | tr -d '\r' \
    | sed -n 's/^[Ss]et-[Cc]ookie: better-auth\.session_token=\([^;]*\);.*/\1/p')"
  [ -n "$token" ] || { echo "✗ sign-in for $email returned no session cookie" >&2; exit 1; }

  agent-browser --session "$tenant" cookies set better-auth.session_token "$token" \
    --url "$origin" --httpOnly --sameSite Lax >/dev/null
  echo "✓ agent-browser session '$tenant' is signed in as $email on $origin"
}

cmd_status() {
  curl -s "$API/api/health"; echo
  for host in localhost acme.localhost borealis.localhost; do
    printf '%-20s -> ' "$host"
    # The JSON body has no trailing newline, so sed's output needs one added.
    curl -s "$API/api/tenants/by-host?host=$host" | sed -n 's/.*"slug":"\([^"]*\)".*"tier":"\([^"]*\)".*/\1 (\2)/p'
    echo
  done
  printf 'web                  -> HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")"
}

cmd_shot() {
  local session="${1:-}" name="${2:-}"
  [ -n "$session" ] && [ -n "$name" ] || { echo "usage: run.sh shot <session> <name>" >&2; exit 2; }
  mkdir -p "$DEMO_DIR/shots"
  agent-browser --session "$session" screenshot "$DEMO_DIR/shots/$name.png"
}

# Writes the API received, newest last. The quickest way to tell a click that
# submitted from one that silently missed (see Gotchas in SKILL.md).
cmd_calls() {
  grep -E '^--> (POST|PUT|PATCH|DELETE) ' "$DEMO_DIR/api.log" | grep -v '/api/auth/' | tail -n "${1:-20}"
}

cmd_stop() {
  kill_port 3000
  kill_port 8001
  echo "✓ stopped :3000 and :8001"
}

case "${1:-}" in
  up) cmd_up ;;
  login) shift; cmd_login "$@" ;;
  status) cmd_status ;;
  shot) shift; cmd_shot "$@" ;;
  calls) shift; cmd_calls "$@" ;;
  stop) cmd_stop ;;
  *) sed -n '2,14p' "$0"; exit 2 ;;
esac

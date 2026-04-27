#!/usr/bin/env bash
set -euo pipefail

SIGNALK_URL="${SIGNALK_URL:-http://127.0.0.1:3000}"
SIGNALK_TOKEN="${SIGNALK_TOKEN:-}"
INFLUXDB_URL="${INFLUXDB_URL:-http://127.0.0.1:8086}"
INFLUXDB_ORG="${INFLUXDB_ORG:-}"
INFLUXDB_BUCKET="${INFLUXDB_BUCKET:-}"
INFLUXDB_TOKEN="${INFLUXDB_TOKEN:-}"

warn_count=0

ok() {
  echo "[OK] $*"
}

warn() {
  warn_count=$((warn_count + 1))
  echo "[WARN] $*"
}

fail() {
  echo "[FAIL] $*"
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_http() {
  local name="$1"
  local url="$2"
  if curl -fsS --max-time 5 "$url" >/dev/null; then
    ok "$name reachable: $url"
  else
    fail "$name not reachable: $url"
  fi
}

signalk_http_code() {
  local path="$1"
  if [[ -n "$SIGNALK_TOKEN" ]]; then
    curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
      -H "Authorization: Bearer $SIGNALK_TOKEN" \
      "$SIGNALK_URL$path" || true
  else
    curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
      "$SIGNALK_URL$path" || true
  fi
}

echo "Running SV-Krishna marine PoC preflight"
echo "SignalK URL: $SIGNALK_URL"
echo "InfluxDB URL: $INFLUXDB_URL"

need_cmd curl
need_cmd jq

signalk_api_code="$(signalk_http_code "/signalk/v1/api/")"
if [[ "$signalk_api_code" == "200" || "$signalk_api_code" == "401" ]]; then
  ok "SignalK API reachable: $SIGNALK_URL/signalk/v1/api/ (HTTP $signalk_api_code)"
fi

if [[ "$signalk_api_code" == "200" ]]; then
  ok "SignalK API allows anonymous read access"
elif [[ "$signalk_api_code" == "401" ]]; then
  warn "SignalK API requires authentication (set SIGNALK_TOKEN for authenticated checks)"
else
  warn "SignalK API returned unexpected HTTP status: $signalk_api_code"
fi

if [[ -n "$SIGNALK_TOKEN" ]]; then
  if curl -fsS --max-time 5 \
    -H "Authorization: Bearer $SIGNALK_TOKEN" \
    "$SIGNALK_URL/signalk/v1/api/vessels/self" | jq -e 'type == "object"' >/dev/null; then
    ok "SignalK authenticated vessels/self endpoint returned JSON"
  else
    warn "SignalK authenticated vessels/self endpoint did not return expected JSON"
  fi
fi

check_http "InfluxDB health" "$INFLUXDB_URL/health"

if [[ -n "$INFLUXDB_TOKEN" && -n "$INFLUXDB_ORG" && -n "$INFLUXDB_BUCKET" ]]; then
  flux_query=$(cat <<Q
from(bucket: "$INFLUXDB_BUCKET")
  |> range(start: -15m)
  |> limit(n: 1)
Q
)

  query_response="$(curl -sS --max-time 10 \
    -H "Authorization: Token $INFLUXDB_TOKEN" \
    -H "Content-Type: application/vnd.flux" \
    -H "Accept: application/csv" \
    -X POST "$INFLUXDB_URL/api/v2/query?org=$(printf '%s' "$INFLUXDB_ORG" | jq -sRr @uri)" \
    --data-binary "$flux_query" || true)"

  if [[ -n "$query_response" ]]; then
    ok "InfluxDB query API responded with data"
  else
    warn "InfluxDB query API returned empty response; verify token/org/bucket"
  fi
else
  warn "Skipping InfluxDB query test (set INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET)"
fi

if command -v npm >/dev/null 2>&1; then
  if npm view signalk-mcp-server version >/dev/null 2>&1; then
    ok "npm can resolve signalk-mcp-server"
  else
    warn "npm could not resolve signalk-mcp-server"
  fi

  if npm view influxdb-mcp-server version >/dev/null 2>&1; then
    ok "npm can resolve influxdb-mcp-server"
  else
    warn "npm could not resolve influxdb-mcp-server"
  fi
else
  warn "npm not found; skipped MCP package checks"
fi

if [[ $warn_count -gt 0 ]]; then
  echo "Preflight completed with $warn_count warning(s)."
  exit 2
fi

echo "Preflight completed successfully."

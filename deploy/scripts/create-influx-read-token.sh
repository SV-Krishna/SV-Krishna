#!/usr/bin/env bash
set -euo pipefail

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd jq

INFLUXDB_URL="${INFLUXDB_URL:-http://127.0.0.1:8086}"
INFLUXDB_ADMIN_TOKEN="${INFLUXDB_ADMIN_TOKEN:-}"
INFLUXDB_ORG="${INFLUXDB_ORG:-}"
INFLUXDB_BUCKET="${INFLUXDB_BUCKET:-}"
TOKEN_DESCRIPTION="${INFLUXDB_READ_TOKEN_DESCRIPTION:-svkrishna-mcp-read}"

if [[ -z "$INFLUXDB_ADMIN_TOKEN" || -z "$INFLUXDB_ORG" || -z "$INFLUXDB_BUCKET" ]]; then
  cat >&2 <<USAGE
Usage:
  INFLUXDB_ADMIN_TOKEN=<admin-token> INFLUXDB_ORG=<org> INFLUXDB_BUCKET=<bucket> [INFLUXDB_URL=...] $0

Optional:
  INFLUXDB_READ_TOKEN_DESCRIPTION=svkrishna-mcp-read
USAGE
  exit 1
fi

auth_header=( -H "Authorization: Token ${INFLUXDB_ADMIN_TOKEN}" )

org_id="$({
  curl -fsS "${INFLUXDB_URL}/api/v2/orgs?org=$(printf '%s' "$INFLUXDB_ORG" | jq -sRr @uri)" "${auth_header[@]}"
} | jq -r '.orgs[0].id // empty')"

if [[ -z "$org_id" ]]; then
  echo "Failed to resolve org id for org='$INFLUXDB_ORG'" >&2
  exit 1
fi

bucket_id="$({
  curl -fsS "${INFLUXDB_URL}/api/v2/buckets?name=$(printf '%s' "$INFLUXDB_BUCKET" | jq -sRr @uri)&orgID=$(printf '%s' "$org_id" | jq -sRr @uri)" "${auth_header[@]}"
} | jq -r '.buckets[0].id // empty')"

if [[ -z "$bucket_id" ]]; then
  echo "Failed to resolve bucket id for bucket='$INFLUXDB_BUCKET' in org='$INFLUXDB_ORG'" >&2
  exit 1
fi

payload="$({
  jq -n \
    --arg description "$TOKEN_DESCRIPTION" \
    --arg orgID "$org_id" \
    --arg bucketID "$bucket_id" \
    '{
      description: $description,
      orgID: $orgID,
      permissions: [
        {
          action: "read",
          resource: { type: "buckets", id: $bucketID, orgID: $orgID }
        },
        {
          action: "read",
          resource: { type: "orgs", id: $orgID }
        }
      ]
    }'
})"

response="$({
  curl -fsS -X POST "${INFLUXDB_URL}/api/v2/authorizations" \
    "${auth_header[@]}" \
    -H "Content-Type: application/json" \
    --data "$payload"
})"

new_token="$(printf '%s' "$response" | jq -r '.token // empty')"
auth_id="$(printf '%s' "$response" | jq -r '.id // empty')"

if [[ -z "$new_token" ]]; then
  echo "Failed to create read token. Response:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

echo "Created InfluxDB read token"
echo "Authorization ID: $auth_id"
echo "Org: $INFLUXDB_ORG"
echo "Bucket: $INFLUXDB_BUCKET"
echo
printf 'INFLUXDB_TOKEN=%s\n' "$new_token"

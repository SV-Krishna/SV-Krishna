#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-admin@192.168.68.203}"

echo "Running remote Pi diagnostic against $TARGET"
echo "Started: $(date -Iseconds)"
echo

ssh -o ConnectTimeout=8 "$TARGET" 'bash -s' <<'EOF'
set -euo pipefail

section() {
  echo
  echo "== $* =="
}

probe_http() {
  local label="$1"
  local url="$2"
  local auth="${3:-noauth}"
  local tmp_body
  tmp_body="$(mktemp)"
  local code

  if [[ "$auth" == "auth" && -n "${SIGNALK_TOKEN:-}" ]]; then
    code="$(curl -sS --max-time 5 -H "Authorization: Bearer $SIGNALK_TOKEN" -o "$tmp_body" -w "%{http_code}" "$url" || true)"
  else
    code="$(curl -sS --max-time 5 -o "$tmp_body" -w "%{http_code}" "$url" || true)"
  fi

  echo "-- $label"
  echo "URL: $url"
  echo "HTTP: $code"
  echo "Body:"
  head -c 240 "$tmp_body" || true
  echo
  rm -f "$tmp_body"
}

SIGNALK_TOKEN=""
SIGNALK_URL=""
REMOTE_ENV=""
for candidate in /opt/svkrishna/app/.env /home/pi/svkrishna/app/.env /home/admin/svkrishna/app/.env; do
  if [[ -f "$candidate" ]]; then
    REMOTE_ENV="$candidate"
    SIGNALK_TOKEN="$(sed -n "s/^SIGNALK_TOKEN=//p" "$candidate" | tail -n 1)"
    SIGNALK_URL="$(sed -n "s/^SIGNALK_URL=//p" "$candidate" | tail -n 1)"
    break
  fi
done

section "Identity"
hostname || true
date -Iseconds || true
uptime || true
echo "hostname -I: $(hostname -I 2>/dev/null || true)"
echo "Remote env file: ${REMOTE_ENV:-<none found>}"
echo "SIGNALK_URL from env: ${SIGNALK_URL:-<unset>}"
if [[ -n "$SIGNALK_TOKEN" ]]; then
  echo "SIGNALK_TOKEN present: yes"
else
  echo "SIGNALK_TOKEN present: no"
fi

section "Disk And Memory"
df -h / || true
free -m || true

section "Relevant Services"
systemctl is-active ssh signalk.service svkrishna.service imu-bridge.service imu-sender.service svkrishna-usb-watchdog.timer 2>/dev/null || true

section "Listening Ports"
ss -ltnp | grep -E ':(22|3000|3300|8080|8091)\b' || true

section "USB / Serial Links"
ls -l /dev/ttyUSB* /dev/ttyOP_* 2>/dev/null || true

section "SignalK Public Paths"
probe_http "SignalK 3000 /signalk/v1/api/" "http://127.0.0.1:3000/signalk/v1/api/"
probe_http "SignalK 3000 /signalk/v1/api/vessels/self" "http://127.0.0.1:3000/signalk/v1/api/vessels/self"
probe_http "SignalK 3000 /admin/" "http://127.0.0.1:3000/admin/"
probe_http "SignalK 3000 /plugins/" "http://127.0.0.1:3000/plugins/"

section "SignalK Authenticated Paths"
if [[ -n "$SIGNALK_TOKEN" ]]; then
  probe_http "SignalK 3000 auth /signalk/v1/api/vessels/self" "http://127.0.0.1:3000/signalk/v1/api/vessels/self" "auth"
  probe_http "SignalK 3000 auth /plugins/" "http://127.0.0.1:3000/plugins/" "auth"
else
  echo "Skipping authenticated probes because no SIGNALK_TOKEN was found."
fi

section "SignalK Alternate Port 3300"
probe_http "SignalK 3300 /signalk/v1/api/" "http://127.0.0.1:3300/signalk/v1/api/"
if [[ -n "$SIGNALK_TOKEN" ]]; then
  probe_http "SignalK 3300 auth /signalk/v1/api/vessels/self" "http://127.0.0.1:3300/signalk/v1/api/vessels/self" "auth"
fi

section "SignalK Install Paths"
ls -ld /usr/lib/node_modules/signalk-server/public 2>/dev/null || true
ls -ld /usr/lib/node_modules/signalk-server/public/signalk 2>/dev/null || true
ls -ld /usr/lib/node_modules/signalk-server/public/admin 2>/dev/null || true
ls -ld /usr/lib/node_modules/signalk-server/public/plugins 2>/dev/null || true

section "Recent signalk.service Logs"
journalctl -u signalk.service -n 120 --no-pager 2>/dev/null || true

section "Recent Kernel Logs"
journalctl -k -n 120 --no-pager 2>/dev/null || true

section "Recent svkrishna.service Logs"
journalctl -u svkrishna.service -n 80 --no-pager 2>/dev/null || true

section "SignalK Raw Logs"
ls -1t ~/.signalk/skserver-raw_*.log 2>/dev/null | head -n 5 || true
EOF

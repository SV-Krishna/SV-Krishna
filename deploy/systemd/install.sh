#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (e.g. sudo $0)."
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cp "$repo_root/deploy/systemd/svkrishna.service" /etc/systemd/system/svkrishna.service
cp "$repo_root/deploy/systemd/svkrishna-whisper.service" /etc/systemd/system/svkrishna-whisper.service
cp "$repo_root/deploy/systemd/influxdb-mcp-server.service" /etc/systemd/system/influxdb-mcp-server.service
cp "$repo_root/deploy/systemd/svkrishna-home-assistant-bridge.service" /etc/systemd/system/svkrishna-home-assistant-bridge.service

systemctl daemon-reload

echo "Enable services:"
echo "  systemctl enable --now svkrishna-whisper.service"
echo "  systemctl enable --now svkrishna.service"
echo
echo "Optional marine telemetry sidecar:"
echo "  mkdir -p /opt/svkrishna/config"
echo "  cp $repo_root/deploy/systemd/svkrishna-marine.env.template /opt/svkrishna/config/marine.env"
echo "  systemctl enable --now influxdb-mcp-server.service"
echo
echo "Optional Home Assistant bridge:"
echo "  python3 -m venv /opt/svkrishna/venv-home-assistant-bridge"
echo "  /opt/svkrishna/venv-home-assistant-bridge/bin/pip install -r /opt/svkrishna/app/python/requirements-home-assistant-bridge.txt"
echo "  cp $repo_root/deploy/systemd/svkrishna-home-assistant-bridge.env.template /opt/svkrishna/config/home-assistant-bridge.env"
echo "  systemctl enable --now svkrishna-home-assistant-bridge.service"

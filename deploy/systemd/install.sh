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

systemctl daemon-reload

echo "Enable services:"
echo "  systemctl enable --now svkrishna-whisper.service"
echo "  systemctl enable --now svkrishna.service"
echo
echo "Optional marine telemetry sidecar:"
echo "  mkdir -p /opt/svkrishna/config"
echo "  cp $repo_root/deploy/systemd/svkrishna-marine.env.template /opt/svkrishna/config/marine.env"
echo "  systemctl enable --now influxdb-mcp-server.service"

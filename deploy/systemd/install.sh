#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (e.g. sudo $0)."
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cp "$repo_root/deploy/systemd/svkrishna.service" /etc/systemd/system/svkrishna.service
cp "$repo_root/deploy/systemd/svkrishna-whisper.service" /etc/systemd/system/svkrishna-whisper.service

systemctl daemon-reload

echo "Enable services:"
echo "  systemctl enable --now svkrishna-whisper.service"
echo "  systemctl enable --now svkrishna.service"

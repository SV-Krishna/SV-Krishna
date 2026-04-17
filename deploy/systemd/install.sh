#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (e.g. sudo $0)."
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

mkdir -p /etc/sv-krishna

if [[ ! -f /etc/sv-krishna/sv-krishna.env ]]; then
  cp "$repo_root/deploy/systemd/sv-krishna.env.example" /etc/sv-krishna/sv-krishna.env
  echo "Wrote /etc/sv-krishna/sv-krishna.env (edit this)."
fi

if [[ ! -f /etc/sv-krishna/whisper.env ]]; then
  cp "$repo_root/deploy/systemd/whisper.env.example" /etc/sv-krishna/whisper.env
  echo "Wrote /etc/sv-krishna/whisper.env (edit this)."
fi

cp "$repo_root/deploy/systemd/sv-krishna.service" /etc/systemd/system/sv-krishna.service
cp "$repo_root/deploy/systemd/sv-krishna-whisper.service" /etc/systemd/system/sv-krishna-whisper.service

systemctl daemon-reload

echo "Enable services:"
echo "  systemctl enable --now sv-krishna-whisper.service"
echo "  systemctl enable --now sv-krishna.service"


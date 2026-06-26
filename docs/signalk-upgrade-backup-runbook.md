# SignalK Upgrade Backup Runbook (Live Pi `206`)

Use this runbook before any SignalK server upgrade on the live boat Pi:

- host: `pi@192.168.195.206`
- hostname: `Krishna`

Goal: produce a complete rollback snapshot so the system can return to the exact pre-upgrade state.

## 1) What gets backed up

Required baseline:

- `/home/pi/.signalk`
- `/etc/systemd/system/signalk.service`

Also include current SV-Krishna integration state (required for IMU/SignalK behavior parity):

- `/home/pi/svkrishna/config`
- `/home/pi/svkrishna/bin`
- `/home/pi/svkrishna/app/imu-bridge.env`
- `/home/pi/svkrishna/app/src/scripts/imuBridge.ts`
- `/etc/systemd/system/imu-bridge.service`
- `/etc/systemd/system/imu-sender.service`

## 2) Backup naming convention

Use timestamped artifacts (same style as prior snapshots):

- directory: `/home/pi/backup-signalk-YYYYMMDD-HHMMSS`
- archive: `/home/pi/signalk-baseline-YYYYMMDD-HHMMSS.tgz`
- checksum: `/home/pi/signalk-baseline-YYYYMMDD-HHMMSS.tgz.sha256`

## 3) Snapshot command (copy/paste)

Run on `206` as `pi`:

```bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/home/pi/backup-signalk-${TS}"
ARCHIVE="/home/pi/signalk-baseline-${TS}.tgz"
mkdir -p "$BACKUP_DIR"

cp -a /home/pi/.signalk "$BACKUP_DIR/.signalk"
cp -a /etc/systemd/system/signalk.service "$BACKUP_DIR/signalk.service"

mkdir -p "$BACKUP_DIR/svkrishna"
cp -a /home/pi/svkrishna/config "$BACKUP_DIR/svkrishna/config"
cp -a /home/pi/svkrishna/bin "$BACKUP_DIR/svkrishna/bin"
cp -a /home/pi/svkrishna/app/imu-bridge.env "$BACKUP_DIR/svkrishna/imu-bridge.env"
cp -a /home/pi/svkrishna/app/src/scripts/imuBridge.ts "$BACKUP_DIR/svkrishna/imuBridge.ts"
cp -a /etc/systemd/system/imu-bridge.service "$BACKUP_DIR/svkrishna/imu-bridge.service"
cp -a /etc/systemd/system/imu-sender.service "$BACKUP_DIR/svkrishna/imu-sender.service"

{
  echo "host=$(hostname)"
  echo "captured_at=$(date -Is)"
  echo "node_version=$(node -v)"
  echo "npm_version=$(npm -v)"
  echo "signalk_service_before=$(systemctl is-active signalk.service || true)"
  echo "imu_bridge_service_before=$(systemctl is-active imu-bridge.service || true)"
  echo "imu_sender_service_before=$(systemctl is-active imu-sender.service || true)"
  echo
  echo "[global npm signalk packages]"
  npm list -g --depth=0 signalk-server 2>/dev/null || true
  echo
  echo "[signalk app package]"
  (cd /home/pi/.signalk && node -p "require('./package.json').name + '@' + require('./package.json').version") || true
  echo
  echo "[imu bridge package]"
  (cd /home/pi/svkrishna/app && node -p "require('./package.json').name + '@' + require('./package.json').version") || true
} > "$BACKUP_DIR/manifest.txt"

cd /home/pi
tar -czf "$ARCHIVE" "$(basename "$BACKUP_DIR")"
sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256"
sha256sum -c "${ARCHIVE}.sha256"
```

## 4) Validation checklist

- `sha256sum -c ...` returns `OK`
- backup directory contains `.signalk`, `signalk.service`, `svkrishna/`, `manifest.txt`
- all services were active before snapshot:
  - `signalk.service`
  - `imu-bridge.service`
  - `imu-sender.service`

## 5) Rollback procedure

If upgrade fails:

```bash
sudo systemctl stop signalk.service imu-bridge.service imu-sender.service
cd /home/pi
tar -xzf signalk-baseline-YYYYMMDD-HHMMSS.tgz

cp -a /home/pi/backup-signalk-YYYYMMDD-HHMMSS/.signalk /home/pi/
sudo cp -a /home/pi/backup-signalk-YYYYMMDD-HHMMSS/signalk.service /etc/systemd/system/signalk.service
sudo cp -a /home/pi/backup-signalk-YYYYMMDD-HHMMSS/svkrishna/imu-bridge.service /etc/systemd/system/imu-bridge.service
sudo cp -a /home/pi/backup-signalk-YYYYMMDD-HHMMSS/svkrishna/imu-sender.service /etc/systemd/system/imu-sender.service

sudo systemctl daemon-reload
sudo systemctl start signalk.service imu-bridge.service imu-sender.service
```

Post-rollback verify:

```bash
systemctl is-active signalk.service imu-bridge.service imu-sender.service
curl -fsS http://127.0.0.1:3000/signalk/v1/api/ >/dev/null
curl -fsS http://127.0.0.1:8091/health
```

## 6) Latest confirmed snapshot

Most recent pre-upgrade backup created on `2026-05-22`:

- `/home/pi/backup-signalk-20260522-135124`
- `/home/pi/signalk-baseline-20260522-135124.tgz`
- `/home/pi/signalk-baseline-20260522-135124.tgz.sha256`


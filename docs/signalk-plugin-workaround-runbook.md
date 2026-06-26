# SignalK IMU Workaround Runbook (Current)

This runbook documents the current production workaround used to publish IMU attitude/heading into SignalK on `SV-Krishna`.

Before any SignalK server upgrade, complete:

- `docs/signalk-upgrade-backup-runbook.md`

## 1) Why this workaround exists

On this SignalK setup, direct generic REST writes to navigation paths are not reliable for external writers:

- `navigation.attitude`
- `navigation.headingTrue`
- `navigation.headingMagnetic`

Observed behavior historically included:

- `405` for direct `PUT` to some vessel-path endpoints.
- `404` on some generic `POST /signalk/v1/api/...` attempts.
- `401` when publishing without auth.

## 2) Current architecture (not the old plugin path)

Data flow:

1. IMU reader emits roll/pitch/heading in degrees.
2. `imu-sender.service` posts samples to local bridge endpoint `http://127.0.0.1:8091/sample`.
3. `imu-bridge` applies calibration offsets.
4. `imu-bridge` publishes SignalK deltas over authenticated websocket stream (`/signalk/v1/stream`).

Result:

- SignalK receives updates on:
  - `navigation.attitude`
  - `navigation.headingMagnetic`
  - `navigation.headingTrue`

## 3) Runtime components on live Pi (`206`)

- Bridge code:
  - `/home/pi/svkrishna/app/src/scripts/imuBridge.ts`
- Bridge service:
  - `/etc/systemd/system/imu-bridge.service`
- Bridge env:
  - `/home/pi/svkrishna/app/imu-bridge.env`
- Sender service:
  - `/etc/systemd/system/imu-sender.service`
- Sender env:
  - `/home/pi/svkrishna/config/imu-sender.env`

## 4) Auth model

Bridge uses one of:

- static JWT (`IMU_BRIDGE_SIGNALK_TOKEN`), or
- username/password (`IMU_BRIDGE_SIGNALK_USERNAME`, `IMU_BRIDGE_SIGNALK_PASSWORD`) and login via `/signalk/v1/auth/login`.

Production on `206` uses dedicated SignalK user `imu-bridge` (readwrite).

## 5) Calibration operations

### Read calibration

```bash
curl -sS http://127.0.0.1:8091/calibration
```

### Set offsets explicitly

```bash
curl -sS -X POST http://127.0.0.1:8091/calibration \
  -H "Content-Type: application/json" \
  -d '{"rollOffsetDeg":-0.7,"pitchOffsetDeg":0.4,"headingOffsetDeg":2.3}'
```

### Zero from current reading

```bash
curl -sS -X POST http://127.0.0.1:8091/calibration/zero \
  -H "Content-Type: application/json" \
  -d '{"rollDeg":0.0,"pitchDeg":0.0,"headingDeg":90.0,"targetHeadingDeg":90.0}'
```

## 6) Health and publish verification

```bash
curl -sS http://127.0.0.1:8091/health
curl -sS http://127.0.0.1:8091/latest
curl -sS http://127.0.0.1:3000/signalk/v1/api/vessels/self
```

Expected:

- `/latest.publish.primary.ok` is `true`
- `navigation.attitude`, `navigation.headingMagnetic`, `navigation.headingTrue` have values

## 7) Known USB serial instability and mitigation

NMEA providers (`nmea2000`, `nmeain`, `windin`, `nmeaout`) can fail during USB bus faults (hub/cable/power/physical vibration), causing missing `/dev/ttyOP_*` paths.

Deployed mitigation on `206`:

- `svkrishna-usb-watchdog.service`
- `svkrishna-usb-watchdog.timer` (every 20s)
- Script:
  - `/home/pi/svkrishna/bin/usb_serial_watchdog.sh`

Behavior:

- Checks required links (`ttyOP_nmea2000`, `ttyOP_nmeaout`, `ttyOP_windin`).
- Attempts udev rescan.
- Restarts SignalK with cooldown if required links are still missing.
- Logs to journal tag `svkrishna-usb-watchdog`.

## 8) Troubleshooting quick list

1. Services

```bash
systemctl is-active signalk.service imu-bridge.service imu-sender.service
```

2. USB link presence

```bash
ls -l /dev/ttyUSB* /dev/ttyOP_* 2>/dev/null
```

3. Bridge logs

```bash
journalctl -u imu-bridge.service -n 120 --no-pager
tail -n 120 /home/pi/svkrishna/logs/imu-sender.log
```

4. SignalK serial/provider errors

```bash
journalctl -u signalk.service -n 200 --no-pager
journalctl -k -n 200 --no-pager
```


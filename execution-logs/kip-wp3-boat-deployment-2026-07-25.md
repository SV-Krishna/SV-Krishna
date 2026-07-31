# KIP WP3 Boat Deployment

## Execution

- Date: 2026-07-25
- Target: `pi@192.168.1.100` (`Krishna`)
- Signal K: `2.13.5`
- Previous KIP: `4.8.0`
- Installed KIP: `4.8.0-krishna.1`
- Package SHA-256:
  `2d86e6e0f4cc46a69b08ff610cbb6adc3055a65c0a467965e630ac62610cd546`
- Service restarted: `signalk`
- User confirmed the instance was not in live navigational use during deployment.

## Pre-Deployment Backup

A fresh private backup was created before installation:

```text
/home/pi/backup-kip-deploy-20260725-170513
```

It contains:

- the complete installed stock KIP `4.8.0` package;
- `/home/pi/.signalk/package.json`;
- `/home/pi/.signalk/package-lock.json`;
- the complete KIP application-data directory;
- installed-version and SHA-256 manifests.

The candidate was copied to the persistent path:

```text
/home/pi/.signalk/local-packages/mxtommy-kip-4.8.0-krishna.1.tgz
```

The workstation and boat copies had the same recorded SHA-256.

## Installation

The package was installed from the Signal K project directory with:

```bash
cd /home/pi/.signalk
npm install --save-exact \
  ./local-packages/mxtommy-kip-4.8.0-krishna.1.tgz
sudo systemctl restart signalk
```

The npm transaction rebuilt the existing native `mdns` dependency and took
approximately 152 seconds. An early health probe briefly observed KIP absent
while npm was replacing its package directory. Signal K's API remained
available. The pre-deployment package and metadata were copied back as an
immediate protective action, but the still-running npm transaction then
completed successfully with exit status zero and installed the candidate.
Final state was checked only after no npm or node-gyp process remained.

The installed dependency is now the persistent local artifact:

```text
file:local-packages/mxtommy-kip-4.8.0-krishna.1.tgz
```

No registry publication or npm audit remediation was performed.

## Profile Activation

Only the separate `Krishna LVGL` profile was changed. Its Anchor Watch
placeholder at grid position `0,0`, size `12 x 16`, was replaced with:

```text
widget-krishna-anchor-situation
```

The Host2 configuration contains the widget's ten read-only Signal K paths,
one-second sampling, and a five-second GPS stale threshold. The original
`Krishna` profile was not changed.

Both live KIP application-data aliases were updated and are byte-identical:

```text
c44cc4e70624404c01a80245adda4048fd9db1556676e52cea429931789b21db  11.0.0.json
c44cc4e70624404c01a80245adda4048fd9db1556676e52cea429931789b21db  11.99.0.json
```

## Verification

Verified after installation and restart:

- `signalk.service` is active;
- npm resolves `@mxtommy/kip@4.8.0-krishna.1`;
- `http://192.168.1.100:3000/@mxtommy/kip/` returns HTTP 200;
- `http://192.168.1.100:3000/signalk/v1/api/` returns HTTP 200;
- the KIP asset served over HTTP contains the
  `Krishna Anchor Situation` registration;
- both application-data aliases contain exactly one native anchor widget in
  the intended Anchor Watch location, with all ten configured paths;
- position and true heading had live values with observed ages of one second
  or less during the final check;
- true wind speed had no live value at that instant, so the widget is expected
  to omit that optional indication;
- no Signal K error-level journal entries were present after the final
  restart.

This verifies package, server, profile, served-bundle and representative-data
health. Physical display appearance and genuinely active Anchor Alarm
behavior remain unresolved.

## Rollback

Rollback is available but was not required or executed:

1. restore the package and package metadata from
   `/home/pi/backup-kip-deploy-20260725-170513`;
2. restore only the required KIP application-data aliases from that backup;
3. restart Signal K;
4. verify stock KIP `4.8.0`, HTTP endpoints, profiles and representative
   telemetry.

Selecting the unchanged `Krishna` profile is the immediate configuration-only
fallback.

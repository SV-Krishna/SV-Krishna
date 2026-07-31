# KIP WP1 Live Baseline and Backup Evidence

## Execution

- Date: 2026-07-25
- Target: `pi@192.168.1.100` (`Krishna`)
- Scope: KIP application data only
- Mode: live execution, configuration-preserving
- Services restarted: none
- Active KIP configuration changed: no
- Existing profiles changed: no

The live KIP application-data directory was verified as:

`/home/pi/.signalk/applicationData/global/kip`

A private timestamped backup was created at:

`/home/pi/backup-kip-20260725-160640`

The backup contains:

- `kip/9.0.0.json`
- `kip/11.0.0.json`
- `kip/11.99.0.json`
- `source-sha256.txt`
- `backup-sha256.txt`

The backup directory mode is `0700`, owned by `pi:pi`. The copied JSON files
retain mode `0644`. No credential or exact vessel-position value is included
in this repository evidence.

## Checksums

| File | Live source SHA-256 | Backup SHA-256 | Result |
|---|---|---|---|
| `9.0.0.json` | `17959eac1e388e340944338b8cc5f056c445b9c2da3ebfdb20ae19a84ca90aee` | `17959eac1e388e340944338b8cc5f056c445b9c2da3ebfdb20ae19a84ca90aee` | Match |
| `11.0.0.json` | `e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c` | `e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c` | Match |
| `11.99.0.json` | `e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c` | `e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c` | Match |

The source checksums were recalculated after copying and remained unchanged.
The `11.0.0` and `11.99.0` application-data files were already
byte-identical before this work.

## Sanitized Baseline Summary

KIP `4.8.0` is served by Signal K `2.13.5`. The current server-backed data
contains the profiles:

- `Defalt`
- `Default`
- `Krishna`

`Krishna` contains five existing dashboards with 1, 14, 1, 8 and 9 widgets.
They remain intact. The baseline includes navigation, wind, depth, battery and
Pi-monitor widgets. It also contains suspect legacy mappings that must not be
copied blindly, notably a Starter Current label mapped to battery power with
ampere conversion and a Starter Voltage label mapped to `vin-v`.

The full field classification and safe stale thresholds are recorded in
`docs/kip-lvgl-live-data-contract-2026-07-25.md`.

## Rollback

The preferred rollback after future prototype work is to switch back to the
unchanged `Krishna` profile. If the KIP application-data object itself is
damaged, stop before changing the wider Signal K installation and restore only
the required JSON file from:

`/home/pi/backup-kip-20260725-160640/kip/`

Any restore must be preceded by a fresh backup and followed by checksum,
profile-list and browser smoke checks. This rollback was prepared and
verified by checksum; it was not executed because no active configuration was
changed.

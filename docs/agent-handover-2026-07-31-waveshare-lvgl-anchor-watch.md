# Waveshare LVGL Overview and Anchor Watch handover

Date: 2026-07-31

## Delivered state

The native `800 x 480` LVGL Overview and read-only Anchor Watch screens are
implemented in `firmware/waveshare-lvgl-overview/` and deployed to the attached
Waveshare ESP32-S3-Touch-LCD-7.

- Board MAC: `cc:ba:97:15:2d:b8`
- Serial alias:
  `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00`
- Last verified display IP: `192.168.68.64`
- Workstation Signal K: `192.168.68.134:3300`
- SD mount: 30,436 MiB with `/krishna/boot.txt` write verified
- Final application size: `0x15a570`; 66% of the 4 MiB partition free
- Final application SHA-256:
  `6f78a4a616068f13826e5ed2b228a2dfca0673885f17cd0d8261d7067d9a3b44`

The Overview baseline is owner-accepted and design-locked. Anchor Watch is
boat-up and uses the same upright cyan boat icon. It provides:

- anchor symbol, rode, vessel offset and bounded recent trail;
- amber warning and red maximum-radius boundaries;
- nearby fresh moving AIS targets;
- rotating N/E/S/W compass context and a cyan relative-wind sector;
- Overview-style cards for distance, anchor-to-vessel bearing, vessel heading,
  and true wind, with wind speed as the primary value;
- continuous Wi-Fi, Signal K, GPS and Signal K-clock top-bar status;
- explicit inactive, within, warning, critical, stale, unavailable and fault
  states, including GPS age.

An instrument-style numbered compass-dial experiment was physically rejected
and fully rolled back. The deployed build is the preferred preceding design.

## Signal K and Anchor Alarm state

The firmware subscribes read-only to standard position, heading, wind, AIS,
anchor radius/position and notification paths. It also consumes
`environment.wind.angleTrueWater` for the relative wind sector.

Workstation Signal K has Anchor Alarm 2.0.1 installed and enabled for isolated
review. The controlled state uses constant 3 m depth and 15 m rode. Read-back
confirmed approximately 14.6969 m maximum radius, 11.7576 m warning radius and
0 m initial distance. A fixed synthetic 40-degree starboard true-wind angle is
published for visual review. These fixtures must never be copied to the boat.

`AnchorAlarmService` remains a client of the Signal K plugin, not a second
alarm engine. Its former hard-coded position fallback was removed; anchor
activation now fails closed unless a fresh local or remote GPS fix is present.
The hardened application was tested and deployed to Test Pi
`admin@192.168.68.203`; `svkrishna.service` and its HTTP UI were verified.

No boat Pi or boat Signal K configuration was changed. Live boat activation
still requires controlled physical approval and validation of real position,
depth and plugin configuration.

## Locked decisions

- Do not alter the accepted Overview without explicit owner approval.
- Keep Anchor Watch boat-up and the own-vessel symbol upright.
- Keep the Signal K Anchor Alarm plugin as the sole alarm/state authority.
- Keep the display fail-closed for unavailable or stale GPS.
- Do not add anchor-setting, raise/disable or radius writes without an
  authenticated contract, confirmation UX and controlled physical testing.
- Amber/red radius rings are safety boundaries; compass and wind indications
  must remain visually distinct.
- Do not revive the rejected broad light numbered instrument dial.

## Validation and evidence

Host telemetry and Signal K delta tests pass with
`-Wall -Wextra -Werror`. The final firmware build, written-image hashes, boot,
PSRAM, touch identification, SD mount, Wi-Fi, Signal K subscription and full
telemetry readiness all passed.

Primary evidence:

- `execution-logs/waveshare-lvgl-anchor-watch-deployment-2026-07-31.md`
- `execution-logs/signalk-test-anchor-plugin-integration-2026-07-31.md`
- `docs/lvgl-marine-dashboard-specification.md`
- `docs/kip-anchor-situation-data-contract-2026-07-25.md`
- `config/signalk/lvgl-test-simulator.json`
- `config/signalk/anchoralarm-test.json`

## Recovery

The local full-flash recovery image is:

`backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin`

SHA-256:
`dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`

Runtime backups and generated artifacts are intentionally ignored by Git and
remain local. Repository source, fixtures, specifications and execution
records are tracked.

## Recommended next action

Treat the current screen as the review baseline. If development resumes,
exercise warning, critical, stale, unavailable, fault and non-self AIS states
one at a time with controlled workstation data. Do not promote activation to
the boat until the owner explicitly opens that safety-critical step.

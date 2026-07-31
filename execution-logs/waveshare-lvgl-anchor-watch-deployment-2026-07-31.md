# Waveshare LVGL Anchor Watch deployment

Date: 2026-07-31

## Scope

Deploy the first read-only native Anchor Watch screen to the attached
Waveshare ESP32-S3-Touch-LCD-7. No Signal K host, simulator configuration or
boat environment was changed.

## Target and recovery

- Serial alias: `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00`
- Detected target: ESP32-S3 revision 0.2, MAC `cc:ba:97:15:2d:b8`
- Flash: 16 MB; 8 MB octal PSRAM
- Existing full-flash recovery image:
  `backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin`
- Recovery SHA-256:
  `dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`

## Build and flash

- ESP-IDF: 5.5.5
- Application size: `0x159050`; 66% of the 4 MiB application partition free
- Application binary SHA-256:
  `88f33f08ffeee79e1f3155dd64c1f627af536cdfd4ce4c43aa1a81145f950c9d`
- Flash command used:
  `idf.py -p /dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00 flash`
- Esptool verified the written hashes for bootloader, partition table and
  application, then hard-reset the device.

## Post-reset verification

Serial observation confirmed:

- application loaded from offset `0x10000`;
- 16 MB flash at 80 MHz QIO;
- 8 MB PSRAM detected and memory test passed;
- GT911 touch controller identified;
- SD mounted at 30,436 MiB and `/krishna/boot.txt` written;
- Wi-Fi connected with RSSI `-26 dBm` and IP `192.168.68.64`;
- Signal K WebSocket connected to `192.168.68.134:3300` and subscribed;
- first telemetry delta applied;
- complete dashboard readiness reported for clock, wind, power, stores, GPS
  and heading;
- no panic, reset or error appeared during the post-readiness stability window.

The existing GT911 initial-address warning and SD command-probe warnings were
observed before successful touch identification and SD mounting, matching the
previous known boot sequence.

## Remaining acceptance

Deployment and runtime readiness passed. Physical inspection of the Anchor
Watch layout and touch navigation still requires owner acceptance. The current
test feed has no anchor state, so the expected initial screen state is
`INACTIVE`; active geometry and all warning/failure states remain to be tested
with controlled synthetic inputs before safety use.

## Head-up correction and synthetic review deployment

The owner identified that the initial Anchor Watch screen incorrectly used a
north-up frame and a different vessel glyph. Review of
`docs/lvgl-marine-dashboard-specification.md` confirmed that the native LVGL
plot must be head-up: the own-vessel icon stays upright, North rotates by the
negative true heading, and AIS targets use the same relative transform. The
separate older KIP widget design said north-up and was the conflicting source;
it is not authoritative for this native screen.

The follow-up build:

- uses the exact 27 x 30, 3 px cyan boat outline from Overview;
- transforms the vessel offset, trail, North marker and eligible AIS targets
  into the head-up frame;
- renders up to eight fresh moving AIS targets when they fall within the
  current anchor plot extent;
- subscribes to all anchor, notification and true-wind-direction paths;
- accepts paired numeric leaf coordinates from the workstation simulator.

The running workstation simulator was backed up to
`backups/signalk-test/2026-07-31-pre-anchor-watch-review/simulator.json` with
SHA-256
`2e8c8051d1ef5f83d93d8874c0acbab8a3a44534eb8bab4f64a3b9fd4dc00055`.
Only the workstation test container was restarted. Its fixture now publishes
a clearly synthetic fixed anchor, vessel position approximately 20 m away,
40 m warning radius, 50 m maximum radius, 20 m current distance and 35 m rode.
This does not invoke or arm the Anchor Alarm plugin.

API read-back confirmed every synthetic position/radius path. Both host tests
passed with `-Wall -Wextra -Werror`. ESP-IDF build passed at `0x159a60` with
66% free. The corrected build was flashed to the same board with hash
verification. Post-reset SD, touch, Wi-Fi, Signal K and complete telemetry
readiness passed, followed by a ten-second no-panic/no-reset observation.

The expected review state is `WITHIN`, approximately `20 m`, with 40/50 m
warning/maximum boundaries. AIS rendering is implemented but no synthetic AIS
target context was injected in this review fixture.

The plot-origin placeholder was subsequently replaced by a native 29 x 32
amber anchor symbol. The `0x159bc0` build passed, was hash-verified during
flash, and reached complete post-reset telemetry readiness.

The Anchor Watch top bar was then aligned with Overview, including measured
Wi-Fi strength arcs, Signal K and GPS freshness, and the Signal K-derived
clock. The `0x15a0b0` build was hash-verified during flash and reached complete
post-reset telemetry readiness.

## Numeric-label rendering correction

The four requested data areas and GPS-age field were receiving valid telemetry
but rendered blank because LVGL was configured without floating-point support
for `lv_label_set_text_fmt`. The valid `WITHIN` classification confirmed that
the anchor position, current GPS fix, current radius and maximum radius were
already present. All affected values now use `snprintf` followed by
`lv_label_set_text`, matching the working formatting pattern used elsewhere in
the dashboard.

- Application size: `0x15a120`; 66% of the 4 MiB partition free
- Application SHA-256:
  `bd707a3c6c1e737b90279b5b55b323cca275636cfd40e87a4405a6994cb14614`
- Esptool hash verification passed for all three written images
- Post-reset IP: `192.168.68.64`
- Signal K WebSocket connected and subscribed to `192.168.68.134:3300`
- Complete telemetry readiness passed for clock, wind, power, stores, GPS and
  heading; no panic or reset appeared before the monitor was closed

No Signal K, simulator, plugin, Test Pi or boat setting was changed for this
display-only correction.

## Compass and true-wind instrument-ring deployment

The Anchor Watch plot now has a fixed outer compass circumference with twelve
rotating ticks and rotating N/E/S/W labels. True heading rotates this scale
under the always-upright boat. A short cyan sector indicates
`environment.wind.angleTrueWater`; it is hidden when that relative-angle path
is unavailable. The amber warning-radius and red maximum-radius circles remain
metric safety boundaries and are not reused as instrument scales.

The four right-side values were rebuilt as Overview-style cards: accent rail,
muted title, 28 px value, separate unit and coloured detail line. Absolute
`environment.wind.directionTrue` and true wind speed remain in the wind card.

Validation and deployment evidence:

- `telemetry_state_test`: pass with `-Wall -Wextra -Werror`
- `signalk_delta_test`: pass with `-Wall -Wextra -Werror`
- ESP-IDF 5.5.5 application size: `0x15a510`; 66% free
- Application SHA-256:
  `e63cae60c73647159e95249b96e8f10a639eba5d21f7d8f0c6a02cbf91598937`
- Esptool verified hashes for bootloader, application and partition table
- Post-reset touch identification, 30,436 MiB SD mount, Wi-Fi at
  `192.168.68.64`, Signal K subscription and complete telemetry readiness
  passed

The workstation simulator did not initially publish the relative wind angle.
Its live configuration was backed up to
`backups/signalk-test/2026-07-31-pre-wind-angle-ring/simulator.json` (SHA-256
`374080ef519861bf4eefad21215a4fabe2d760ed59b108578801451204bf6d99`) before
deploying the repository fixture with a constant synthetic 40-degree
starboard angle. API read-back returned `0.698131701 rad`. After the isolated
test-container restart, Anchor Alarm read-back still returned 0 m current
radius and 14.696938456699069 m maximum radius. No Test Pi or boat system was
changed.

## Wind-sector visibility correction

API read-back confirmed `environment.wind.angleTrueWater` was live at the
synthetic `0.698131701 rad` (40 degrees starboard), so the absent sector was a
rendering fault. The short LVGL arc was replaced with nine explicit cyan
perimeter markers spanning 32 degrees. They are moved to the foreground on
each update so a maximum-radius boundary cannot obscure them; the centre wind
angle marker is larger.

The true-wind card now prioritises speed as its large value in knots and shows
absolute true-wind direction on the detail line. Degree units on the bearing,
heading and wind displays now read `deg`.

- Host telemetry tests: pass
- Application size: `0x15a570`; 66% free
- Application SHA-256:
  `6f78a4a616068f13826e5ed2b228a2dfca0673885f17cd0d8261d7067d9a3b44`
- Flash hash verification: pass for all written images
- Post-reset touch, SD, Wi-Fi, Signal K subscription and complete telemetry
  readiness: pass

## Instrument-style dial review build

The left plot was reworked toward the supplied round sailing-instrument
reference without removing Anchor Watch semantics. It now uses a broad light
compass annulus around a dark inner face, twelve rotating cardinal/30-degree
labels and ticks, a red North label, and a fixed heading window at the bow.
Relative true wind drives both the existing cyan perimeter sector and a new
5 px rounded ray from the plot centre. The boat remains upright.

Anchor warning/max-radius boundaries, anchor symbol, vessel position, rode,
trail and AIS objects remain separate dynamic layers. Foreground ordering
keeps the boat and heading window legible over wind and safety geometry.

- Host telemetry tests: pass
- Application size: `0x15a8a0`; 66% free
- Application SHA-256:
  `55390fda726781063084427819ed66da456f8b5ed3e9f1987de330ea091c5844`
- Flash hash verification: pass
- Post-reset touch, 30,436 MiB SD mount, Wi-Fi at `192.168.68.64`, Signal K
  subscription and full dashboard telemetry readiness: pass

## Instrument-dial rollback

Physical owner review rejected the instrument-style dial. Only that latest
experiment was removed. The restored build is the immediately preceding dark
plot with rotating N/E/S/W markers, cyan perimeter wind sector, compact metric
cards and unchanged anchor safety geometry.

- Restored application size: `0x15a570`, exactly matching the preceding build
- Host telemetry tests: pass
- Flash hash verification: pass
- Post-reset touch, SD, Wi-Fi, Signal K and full telemetry readiness: pass

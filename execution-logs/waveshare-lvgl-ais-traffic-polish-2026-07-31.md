# Waveshare LVGL AIS traffic and visual polish deployment

Date: 2026-07-31

## Scope

Apply the agreed review changes to the physical LVGL Overview: correct solar
formatting, centre and improve the own-vessel symbol, retain useful moving AIS
traffic when Anchor Watch is inactive, use 10/20 NM bands, replace the Wi-Fi
bars with curved strength arcs, and remove the development performance overlay.

## Recovery and environment boundary

- The checksum-recorded 16 MiB full-flash backup from the initial Waveshare
  deployment remains the device recovery point.
- The existing checksum-recorded Signal K simulator backup remains the test
  server rollback point.
- No boat Pi or boat Signal K configuration was changed in this session.
- The workstation simulator was not changed to inject AIS targets.

## Implementation

- Signal K hello/self context and `vessels.*` position/SOG deltas are separated
  so target data cannot overwrite own-vessel telemetry.
- Up to eight targets are retained. The inactive view accepts only position and
  SOG not older than 15 seconds, SOG above 0.5 kn, and range within 20 NM.
- Target bearings are transformed into the existing head-up frame.
- The boat outline is geometrically centred and remains upright.
- Inactive rings are labelled 10 NM and 20 NM; the summary reports moving
  targets rather than anchor geometry.
- Solar watts use integer formatting, avoiding embedded nano-printf's unsupported
  floating-point output.
- Wi-Fi uses a dot and three curved arcs driven directly by ESP-IDF station RSSI.
- LVGL's FPS/CPU performance monitor is disabled.

## Validation and corrected failures

- `telemetry_state_test`: pass with `-Wall -Wextra -Werror`.
- `signalk_delta_test`: pass with `-Wall -Wextra -Werror`, including self/AIS
  context separation.
- ESP-IDF 5.5.5 build: pass; application size `0x14f820`, with 67% of the
  4 MiB application partition free.
- Flash write and image hash verification: pass.
- Device boot: pass; PSRAM test, LVGL startup, GT911 identification, and SD
  mount/write all succeeded. SD capacity read back as 30,436 MiB.
- Network acceptance: Wi-Fi associated at `192.168.68.64` with device-reported
  RSSI `-31 dBm`; Signal K WebSocket connected and the full dashboard telemetry
  readiness diagnostic passed.
- Stability observation after readiness: no panic, watchdog, stack overflow,
  or reset.

Two intermediate physical-test failures were corrected before the final flash:
an LVGL canvas polygon caused a draw watchdog and was replaced by a lightweight
closed line; then local copies of the enlarged telemetry state exhausted the
LVGL/WebSocket task stacks and were moved to static storage. The boot-loop image
was overwritten by the final hash-verified flash.

## Acceptance boundary

The firmware is deployed and serial-validated on the attached ESP32. Actual
moving-target rendering is host-tested but not end-to-end accepted because the
test Signal K instance currently provides no AIS target contexts. A new physical
photo/pixel inspection has not yet been performed.

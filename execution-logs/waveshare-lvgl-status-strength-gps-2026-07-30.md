# Waveshare LVGL signal status and anchor wind deployment

Date: 2026-07-30

## Scope

Replace the binary top-row indicators with useful Wi-Fi, Signal K, and GPS
quality states, and replace the fixed Anchor Watch `8 kn` text with apparent
wind telemetry.

## Behaviour deployed

- Wi-Fi displays four RSSI tiers and changes colour at strong, usable, weak,
  and poor thresholds.
- Signal K displays `LIVE` when a delta arrived within five seconds, `STALE`
  when connected without fresh deltas, and unavailable when disconnected.
- GPS displays `LIVE`, `STALE`, or unavailable from
  `navigation.position` or `navigation.gnss.methodQuality`.
- The `TEST TELEMETRY` top-row title was removed to make room.
- Anchor Watch apparent wind now uses
  `environment.wind.speedApparent`, converts m/s to knots, and applies the same
  live/stale/unavailable colour treatment.

The test Signal K simulator fixture was extended with a synthetic
`navigation.gnss.methodQuality` value of `1`. The established pre-synthetic
simulator backup and checksum remain the rollback boundary. The fixture
continues to be explicitly test-only; no boat instance was changed.

## Validation

- Signal K REST read-back confirmed GNSS method quality value `1` with source
  `simulator.2`.
- `telemetry_state_test: PASS`
- `signalk_delta_test: PASS`, including object-valued
  `navigation.position` GPS freshness
- ESP-IDF build: pass; application size `0x15acf0`, with 66% of the 4 MiB
  partition free
- esptool write and hash verification: pass
- SD mount/write, Wi-Fi, and WebSocket subscription: pass
- final device read-back:
  `Dashboard telemetry ready: clock, wind, house, start and GPS; Wi-Fi RSSI -17 dBm`
- no panic or reset loop observed during the validation window

The physical row layout and dynamic apparent-wind value were deployed to the
attached display. Independent camera-based pixel/layout acceptance was not
performed.

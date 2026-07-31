# Waveshare LVGL Vessel Stores and head-up plot deployment

Date: 2026-07-31

## Scope

Replace the numeric Wi-Fi strength suffix with an icon-only strength display,
connect fresh-water and solar data, improve the apparent-wind caption, and
establish a head-up coordinate model for the Anchor Watch plot.

## Signal K contract and test source

The installed Signal K 2.26 schema was treated as authoritative:

- `tanks.freshWater.0.currentLevel` — ratio
- `electrical.solar.0.panelPower` — W
- `navigation.headingTrue` — rad

The reversible workstation simulator fixture was extended with those paths.
API read-back confirmed approximately 81% water, 405 W solar, and a valid
true heading during acceptance. No boat Signal K configuration was changed.
The existing checksum-recorded pre-synthetic simulator backup remains the
rollback boundary.

## Firmware behaviour

- Wi-Fi has four ascending icon bars; active bars and colour reflect RSSI.
  The textual `4/4` suffix is removed.
- Vessel Stores shows fresh-water percent/bar and solar watts with
  live/stale/unavailable treatment.
- Anchor summary caption is `App Wind`.
- The fixed home glyph and illustrative offset dot were replaced by a compact
  upright boat outline.
- The plot is head-up. The boat remains upright and the `N` marker moves from
  `navigation.headingTrue`.
- Future AIS targets are explicitly required to use the same relative
  head-up transform; AIS targets are not yet rendered.

## Validation

- telemetry state test: pass
- Signal K delta test: pass
- ESP-IDF 5.5.5 build: pass; application size `0x15c5c0`, 66% of the 4 MiB
  application partition free
- esptool flash write and hash verification: pass
- device SD mount/write, Wi-Fi, WebSocket, and first delta: pass
- final serial acceptance:
  `Dashboard telemetry ready: clock, wind, power, stores, GPS and heading; Wi-Fi RSSI -25 dBm`
- no panic or reset loop observed

The new physical layout was deployed, but no independent camera/pixel
acceptance was performed.

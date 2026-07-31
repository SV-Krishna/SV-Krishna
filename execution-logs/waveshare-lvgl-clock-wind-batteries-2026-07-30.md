# Waveshare LVGL clock, wind, and batteries deployment

Date: 2026-07-30

## Intent

Drive the top-right clock from Signal K and provide a reversible synthetic
source for wind, House battery, and Start battery gauges on the workstation
test instance.

## Recovery

Before changing the test Signal K simulator, its configuration was copied to:

`backups/signalk-test/2026-07-30-pre-lvgl-synthetic/simulator.json`

SHA-256:
`af00d4abe5c510cc851fd92aae9a3a6f7679b33d21db39c0cec10d82d26908b0`

The container image ID, image reference, restart policy, and running state
were recorded alongside it. Restore the original file to
`/home/node/.signalk/plugin-config-data/simulator.json` and restart
`svkrishna-signalk` to roll back the external change.

The established ESP32 full-flash and immediate pre-telemetry recovery captures
remain unchanged and available.

## External test-instance change

Installed `config/signalk/lvgl-test-simulator.json` and restarted only the
workstation `svkrishna-signalk` container. The fixture preserved SOG/depth and
added:

- apparent wind: 3–8 m/s
- true wind: 4–9 m/s
- House battery: 68–82%, 12.5–13.0 V, -6–12 A
- Start battery: 90–98%, 12.65–12.85 V, -0.2–0.5 A

Signal K API read-back confirmed all paths with `$source` values
`simulator.2` through `simulator.9`. No boat Pi configuration was changed.

## Firmware behaviour

- Parses the UTC timestamp on Signal K update deltas.
- Maintains display time between updates using ESP32 monotonic time.
- Converts display time with the configured POSIX timezone; Europe/London is
  the default.
- Uses standard `electrical.batteries.house.*` and
  `electrical.batteries.start.*` paths.
- Keeps `electrical.batteries.A.*` as a House fallback.
- Updates House and Start values/bars independently.

## Validation

- `telemetry_state_test: PASS`
- `signalk_delta_test: PASS`, including exact millisecond timestamp parsing
- ESP-IDF 5.5.5 build: pass; image `0x15a660`, with 66% of the 4 MiB
  application partition free
- esptool flash write and hash verification: pass
- 30,436 MiB SD mount and `/sdcard/krishna/boot.txt` write: pass
- Wi-Fi association and Signal K WebSocket subscription: pass
- device serial acceptance:
  `Dashboard telemetry ready: clock, wind, house and start`
- no panic or reset loop observed during the validation window

Physical values are visible on the attached display, but an independent
image-based assertion was not performed. The feed is explicitly synthetic and
must not be presented as boat sensor data.

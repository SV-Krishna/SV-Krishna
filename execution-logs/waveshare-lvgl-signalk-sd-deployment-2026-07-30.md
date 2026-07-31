# Waveshare LVGL Signal K and SD deployment evidence

Date: 2026-07-30

## Scope

Bind the native LVGL Overview gauges to the test Signal K instance, keep the
endpoint portable to the boat Pi, and use the attached 32 GB microSD without
formatting it.

## Recovery

The existing full 16 MB pre-LVGL capture remains available at:

`backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin`

SHA-256:
`dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`

An immediate pre-telemetry application boundary was also captured at:

`backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-signalk-telemetry/boot-partition-app-0x110000.bin`

SHA-256:
`514ed239a9e65747687e7e62f9eec7395de2355d1c86f942a53879936ac17131`

## Validation

- ESP-IDF 5.5.5 build passed; final application size was approximately
  1.35 MiB in a 4 MiB factory partition.
- Flash completed with esptool hash verification through the stable
  `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00` path.
- The 32 GB card mounted as 30,436 MiB without formatting.
- `/sdcard/krishna/boot.txt` was written successfully.
- No SD `config.json` was present, so the ignored firmware fallback selected
  the workstation test service at `192.168.68.134:3300`.
- The device associated with Wi-Fi and received `192.168.68.64`.
- Signal K WebSocket connected, subscribed, and applied its first delta.
- The test feed exposed live SOG and depth-below-surface data; unavailable
  wind and battery data remained explicitly unavailable.
- `telemetry_state_test: PASS`.
- `signalk_delta_test: PASS`, including malformed and missing input.
- No panic or reset loop was observed during the boot validation window.

The host at `192.168.68.203` was reachable but did not expose Signal K during
this session. The workstation container was therefore used as the authorised
test instance. No boat Pi environment was changed.

## Remaining risk

- WebSocket deltas split across frames are currently ignored.
- Long reconnect, SD removal, power-loss-during-write, and soak tests were not
  run.
- Wind, battery, and active anchor paths require a source before their live
  presentation can be accepted.
- The SD endpoint override still needs a controlled boot test after a
  `config.json` is placed on the card.

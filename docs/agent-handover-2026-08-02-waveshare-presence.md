# Waveshare LD2410C presence and display-power handover

Date: 2026-08-02

## Current delivered state

The native Waveshare ESP32-S3-Touch-LCD-7 firmware now consumes the Hi-Link
LD2410C digital presence output and controls the LCD backlight:

- stable `PRESENT` enables the backlight;
- stable `CLEAR` disables the backlight;
- the ESP32, RGB/LVGL pipeline, touch controller, Wi-Fi, Signal K telemetry and
  presence task remain running while the backlight is dark;
- presence does not publish to Signal K or control alarms or other automation.

This complete sensor-to-screen cycle was physically observed and accepted.
The current firmware is deployed to the attached Waveshare and all related
repository commits are pushed to `origin/main` through commit `45f102f`.

Device and build identity:

- board: Waveshare ESP32-S3-Touch-LCD-7 V1.2, 800 x 480;
- ESP32-S3 MAC: `cc:ba:97:15:2d:b8`;
- native USB serial:
  `/dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_CC:BA:97:15:2D:B8-if00`;
- last verified IP: `192.168.68.64`;
- development Signal K endpoint: `192.168.68.134:3300`;
- ESP-IDF: 5.5.5;
- deployed application size: `0x15ab70`, 66% of the 4 MiB app partition free;
- application binary SHA-256:
  `816a04a8f53adbcfc12ae6510522a4a621b0144b3edbabaefb951ee28c6917be`;
- deployed ELF SHA-256 prefix reported at boot: `96b10d919`.

## Accepted solder-free wiring

The Waveshare slide selector must remain in the `UART2` position. The sensor
uses only its digital `OUT`; its UART protocol pins remain disconnected.

| LD2410C | Connection |
| --- | --- |
| `VCC` | Regulated 5 V supply |
| `GND` | Supply ground and Waveshare UART2 `GND` |
| `OUT` | Waveshare UART2 `RXD`, routed to ESP32 GPIO44 |
| `UART_TX` | Not connected |
| `UART_RX` | Not connected |

All grounds must be common. Do not power the LD2410C from the Waveshare 3.3 V
header. Do not use Sensor AD/GPIO4: it is shared with and actively driven by
the GT911 touch reset/interrupt path. GPIO6 is not exposed on the documented
solder-free connectors.

With the selector at UART2, use the board's native `USB` connector for logs and
flashing. Firmware keeps CH422G `EXIO5/USB_SEL` low so native USB remains routed
to that connector instead of CAN.

## Sensor commissioning state

The LD2410C was configured externally with the Hi-Link radar tool:

- maximum range: 1.5 m;
- nominal no-person delay: 15 seconds.

These values live in the sensor and are not managed by the ESP32 firmware. One
accepted test logged `CLEAR` roughly 48 seconds after the leave instruction,
but the timestamp did not establish the operator's exact departure time. Do
not treat that as a precise sensor hold-time measurement.

## Validation completed

- Host presence-filter tests passed with `-Wall -Wextra -Werror`, covering
  stable transitions, bounce rejection and 32-bit timer wrap.
- Complete ESP-IDF 5.5.5 build passed.
- Full-flash recovery checksum was verified before deployment.
- Esptool verified bootloader, partition-table and application writes.
- Boot read-back passed 8 MB PSRAM, display/touch startup, SD mount, Wi-Fi,
  Signal K subscription, dashboard readiness and presence monitoring.
- Physical `PRESENT -> CLEAR -> PRESENT` produced backlight
  `ON -> OFF -> ON`, confirmed by both logs and the operator.
- An earlier 3,584-byte main-task stack overflowed once during monitor-triggered
  startup. Checked-in defaults now allocate 8 KiB; the corrected image passed
  five consecutive native-USB monitor/reset cycles with no panic, watchdog or
  stack overflow. One Signal K connection timeout recovered automatically.

## Recovery

Local recovery image:

`backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin`

SHA-256:

`dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`

The recovery image is intentionally ignored by Git and exists only in the
local repository checkout. Verify its checksum and the exact target before any
restore. A full-flash restore overwrites bootloader, partition table,
application, NVS and all other flash contents.

## Important files

- `firmware/waveshare-lvgl-overview/main/sensors/presence_sensor.c`
- `firmware/waveshare-lvgl-overview/main/sensors/presence_filter.c`
- `firmware/waveshare-lvgl-overview/main/main.c`
- `firmware/waveshare-lvgl-overview/main/waveshare_rgb_lcd_port.c`
- `firmware/waveshare-lvgl-overview/sdkconfig.defaults`
- `firmware/waveshare-lvgl-overview/README.md`
- `execution-logs/waveshare-ld2410c-uart2-poc-2026-08-02.md`
- `docs/Boat_Information_Media_Control_Panel_System_Design_v1.md`
- `docs/todo.md`
- `docs/log.md`

## Remaining work and boundaries

- Perform five physical cold-power boots. The completed five-cycle test covered
  native-USB monitor resets, not removal and restoration of power.
- Measure peak and steady 5 V current with the backlight on and off, including
  Wi-Fi and sensor load, before finalising regulator, wiring and fuse ratings.
- Measure the actual no-person interval from a clearly timed departure in the
  installed geometry.
- Optionally repeat the physical off/on cycle after the stack-only correction;
  presence logic was unchanged and the earlier cycle remains accepted.
- The ordered Pololu D24V22F5 5 V buck regulator had not arrived during this
  work. The intended final power topology is one enclosure supply feeding a
  common regulated 5 V rail for both Waveshare and LD2410C, with common ground.
- Do not alter the owner-accepted Overview layout or expand presence into
  alarms, Signal K publication or other consequential automation without a new
  explicit requirement and validation plan.

## Restart prompt for the next agent

> Continue the Waveshare display work in `/home/antony-slack/Documents/repos/SV-Krishna` from pushed `main` at or after `45f102f`. Read
> `docs/agent-handover-2026-08-02-waveshare-presence.md`,
> `firmware/waveshare-lvgl-overview/README.md`, `docs/todo.md`, and the LD2410C
> execution log first. Confirm a clean worktree and preserve the local recovery
> image. Next, perform and record five physical cold-power boots and measure
> backlight-on/off current; do not change the accepted Overview or add new
> presence automation without explicit owner approval.

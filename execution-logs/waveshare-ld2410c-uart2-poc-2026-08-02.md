# Waveshare LD2410C UART2 proof-of-concept deployment

Date: 2026-08-02

## Scope

Flash and boot the locally validated LD2410C digital-input proof of concept on
the attached Waveshare ESP32-S3-Touch-LCD-7 V1.2. No Signal K, boat or other
external configuration was changed.

## Recovery

The existing complete 16 MB recovery image was confirmed before deployment:

```text
backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin
SHA-256 dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1
```

Recovery was prepared but not exercised.

## Deployment and read-back

- Attached device: ESP32-S3 revision v0.2, 16 MB flash, 8 MB PSRAM.
- Serial identity:
  `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00`.
- ESP-IDF 5.5.5 wrote bootloader, partition table and the `0x15a920`
  application; esptool verified every written hash.
- The device hard-reset and booted the intended application. Boot read-back
  reported ELF SHA-256 prefix `6a90255fb`, PSRAM test success, GT911 identity,
  30,436 MiB SD mount, Wi-Fi association, Signal K subscription and complete
  dashboard telemetry readiness.
- Presence monitoring started on GPIO44 with 250 ms debounce.

## Physical result and remaining test

The first boot reported `PRESENT` while the board remained selected to
`UART1`. This is not accepted sensor evidence: the CH343 UART receive path
holds GPIO44 high in that selector position. Power must be removed, the slide
selector moved to `UART2`, and the native `USB` connector used for logs before
testing real `CLEAR`/`PRESENT` transitions from the LD2410C `OUT` pin.

Status: deployed but not physically accepted.

## Native USB and GPIO44 diagnostic follow-up

- Corrected the CH422G output state so `EXIO5/USB_SEL` remains low after touch
  reset. With the selector at UART2, native USB enumerated as Espressif
  USB Serial/JTAG device `CC:BA:97:15:2D:B8`.
- Added a five-second raw/debounced presence heartbeat, built an application of
  `0x15a9a0`, and flashed it directly through native USB. Esptool verified all
  written hashes.
- Boot read-back reported ELF SHA-256 prefix `38c6a8894` and retained Wi-Fi,
  Signal K and dashboard readiness.
- GPIO44 repeatedly reported `raw=1 stable=PRESENT`. No transition was observed
  during the deliberate move-away/approach test.
- Next controlled check: disconnect only LD2410C `OUT` from UART2 `RXD`. GPIO44
  should fall to `raw=0 stable=CLEAR` through its configured pull-down. This
  distinguishes a continuously asserted sensor output from a board/input fault.

## Solder-free wiring and physical result

The LD2410C was powered from a separate regulated 5 V breadboard supply. Its
ground was joined to Waveshare UART2 ground and `OUT` was connected to UART2
`RXD`/GPIO44.

Observed sequence:

- removing only `OUT` drove GPIO44 to `CLEAR`, proving the input, pull-down,
  UART2 routing and shared-ground path;
- reconnection established a stable `CLEAR` baseline;
- movement in front of the sensor produced a debounced `PRESENT` transition
  and stable raw high state;
- after the person stepped away, the sensor remained `PRESENT` throughout a
  further 35-second observation.

Status: deployed and positive presence detection physically observed. Absence
clearing is not yet accepted; the sensor may be detecting another target,
using a longer configured hold time, or require sensitivity/zone tuning.

## Complete empty-room acceptance cycle

A subsequent controlled test removed the operator from the room rather than
only moving to the side of the sensor's broad field:

- the input began at stable `PRESENT`;
- after approximately 44 seconds with the room empty, it changed to stable
  `CLEAR`;
- after the operator returned and moved within approximately 1-2 m, it changed
  back to `PRESENT`.

Status: end-to-end accepted for the basic local presence-detection concept.
The approximately 44-second observed absence delay should be treated as a
commissioning value to review before presence controls display power or other
automation.

## Presence-controlled backlight deployment and acceptance

- Recovery image verification passed with SHA-256
  `dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`.
- The `0x15ab70` presence-backlight application was flashed through native USB;
  bootloader, partition-table and application writes passed esptool hash
  verification.
- Boot read-back identified ELF SHA-256 prefix `7ceae4891`, passed the 8 MB
  PSRAM test, initialized display/touch, associated to Wi-Fi, subscribed to
  Signal K and reached complete dashboard telemetry readiness.
- During the controlled physical cycle, the relevant runtime sequence was:

```text
LD2410C diagnostic: raw=1 stable=PRESENT
LD2410C presence changed: CLEAR
Presence display policy: backlight OFF
LD2410C diagnostic: raw=0 stable=CLEAR
LD2410C presence changed: PRESENT
Presence display policy: backlight ON
LD2410C diagnostic: raw=1 stable=PRESENT
```

- The operator confirmed that the display went dark and illuminated again as
  expected. This accepts the complete sensor-to-backlight behaviour.
- The clear transition was logged roughly 48 seconds after the leave
  instruction, not a precise measurement from actual departure. The installed
  sensor remains configured for a 1.5 m range and nominal 15-second no-person
  delay; installed commissioning must retest the actual clear interval.
- One preceding monitor-triggered reboot reported a main-task stack overflow.
  The automatic restart completed successfully and the device remained stable
  through the acceptance cycle, but reboot robustness remains unaccepted and
  requires investigation.

## Main-task stack correction prepared

Review found that the deployed image retained ESP-IDF's 3,584-byte main-task
stack while `app_main` initializes the display, storage, telemetry and both
LVGL screens. The checked-in defaults now explicitly allocate 8 KiB. This is a
targeted correction for the observed startup overflow; it does not alter the
presence policy. Build, flash and repeated physical reboot results are recorded
below when executed.

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

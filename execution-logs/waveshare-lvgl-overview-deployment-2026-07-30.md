# Waveshare LVGL Overview Deployment Evidence — 2026-07-30

## Scope

Build and deploy the first native LVGL Overview screen to the locally attached
Waveshare ESP32-S3-Touch-LCD-7. This milestone intentionally uses labelled
static design data and makes no connection to Signal K or writable controls.

## Target and authoritative baseline

- serial alias: `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00`
- USB bridge: QinHeng `1a86:55d3`
- chip: ESP32-S3 revision `v0.2`
- flash: 16 MB, manufacturer `c8`, device `4018`
- PSRAM: 8 MB octal AP Memory
- panel baseline: Waveshare official
  `ESP32-S3-Touch-LCD-7-Demo/ESP-IDF/08_lvgl_Porting`
- UI authority: `docs/lvgl-marine-dashboard-specification.md`

The official Waveshare port identifies an ST7701 RGB panel and GT911 touch
controller. Its display/LVGL port files were retained with their SPDX headers;
the Krishna UI is isolated under `main/ui/`.

## Recovery checkpoint

The full flash was captured before any write:

```text
read-flash 0x0 0x1000000
bytes read: 16777216
elapsed: 419.2 seconds
SHA-256: dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1
```

Local ignored location:

```text
backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/full-flash-16mb.bin
```

The capture is deliberately untracked because full flash can include private
configuration. Restore only after confirming the target and checksum:

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 \
  write-flash 0x0 full-flash-16mb.bin
```

Rollback was prepared but not rehearsed, because that would immediately replace
the newly deployed milestone and require a second deployment.

## Reproducible build

- ESP-IDF: `v5.5.5`, tag commit
  `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- target: `esp32s3`
- managed dependencies:
  - `lvgl/lvgl 8.4.0`
  - `espressif/esp_lcd_touch 1.1.2`
  - `espressif/esp_lcd_touch_gt911 1.1.1~1`

Command:

```bash
source local/toolchains/esp-idf-v5.5.5/export.sh
cd firmware/waveshare-lvgl-overview
idf.py build
```

Outcome: passed. The first built application was `0x97d20` bytes, leaving
`0x682e0` bytes (41%) in the factory app partition.

Final application:

```text
build/krishna_lvgl_overview.bin
SHA-256: 799d7c3e4600d2ac1d192737c57bf694c8feeee05d36622c25e81cc84942e755
```

## Deployment

Command:

```bash
idf.py -p /dev/serial/by-id/usb-1a86_USB_Single_Serial_5958027113-if00 flash
```

Outcome: passed.

- bootloader: 22,272 bytes written and hash verified
- application: 621,856 bytes written and hash verified
- partition table: 3,072 bytes written and hash verified
- device hard-reset by esptool after the write

## Authoritative serial read-back

`idf.py monitor` after reset confirmed:

- boot from the factory partition at `0x10000`
- flash size 16 MB at 80 MHz QIO
- 8 MB PSRAM detected at 80 MHz
- PSRAM memory test passed
- CPU running at 240 MHz
- RGB LCD panel driver installed and initialized
- I2C, GPIO, touch LCD and GT911 controller initialized
- GT911 hardware ID `0x39,0x31,0x31`, config version `88`
- LVGL task created
- project name `krishna_lvgl_overview`
- `Starting Krishna marine Overview`
- `app_main()` returned without a panic or reset loop

The GT911 driver first logged `Unable to initialize the I2C address`, then
successfully read its ID and configuration. Treat touch as pending until a
visible button interaction is observed.

## Acceptance status

- native 800 x 480 LVGL implementation: passed by source/build
- recovery captured before write: passed
- build: passed
- flash and write verification: passed
- boot, PSRAM and driver startup: passed
- no invented live values: passed; screen says `STATIC DESIGN DATA`
- panel appearance: not observed from the workstation cameras
- touch interaction: controller identified; end-to-end tap not yet observed
- daylight/night review: not run
- soak test: not run
- rollback rehearsal: not run

Status is therefore `deployed`, not `end-to-end accepted`.

# Krishna LVGL Overview

Native LVGL firmware for the Waveshare `ESP32-S3-Touch-LCD-7` marine display.
This firmware implements the `800 x 480` Overview and read-only Anchor Watch
screens defined in `docs/lvgl-marine-dashboard-specification.md` and binds
available gauges to a Signal K WebSocket feed.

## Current scope

The Overview layout is design-locked at the user-accepted 2026-07-31 physical
baseline. Further screen development must not alter it without an explicit
request or a verified defect correction.

- native LVGL 8.4 objects; no HTML, browser, or full-screen bitmap
- fixed top status bar and three-target bottom navigation
- live SOG, depth, wind, and battery bindings with stale/unavailable states
- central head-up anchor/traffic presentation with moving AIS targets
- compact battery, solar, water, and essential-system summaries
- touch navigation between the persistent Overview and Anchor Watch screens
- head-up Anchor Watch geometry, boundary, short trail, nearby moving AIS,
  GPS age and explicit
  inactive/within/warning/critical/stale/unavailable/fault states
- four-tier Wi-Fi RSSI, Signal K freshness, and GPS freshness indicators
- local display time derived from Signal K UTC delta timestamps
- local LD2410C digital presence input with debounced transition logging and
  presence-controlled display backlight
- 32 GB microSD support for portable Signal K endpoint configuration

The current workstation test feed supplies the dashboard telemetry but does
not inject AIS vessels or anchor state. Anchor state is deliberately shown as
inactive; it is not inferred from vessel motion. While inactive, the Overview
plot uses 10 NM and 20 NM
rings and shows only fresh moving AIS targets within 20 NM. This is an
informational display and must not be used as the sole source for navigation
or anchor safety decisions.

## Hardware and dependencies

- Waveshare ESP32-S3-Touch-LCD-7
- ESP32-S3-WROOM-1-N16R8: 16 MB flash and 8 MB octal PSRAM
- ST7701 RGB display, 800 x 480
- GT911 capacitive touch controller
- ESP-IDF 5.5.5
- managed components pinned by `dependencies.lock`:
  - LVGL 8.4.0
  - Espressif LCD touch 1.1.2
  - Espressif GT911 touch 1.1.1~1
  - Espressif WebSocket client 1.8.0

The display, touch, and LVGL port began from Waveshare's official
`ESP32-S3-Touch-LCD-7-Demo/ESP-IDF/08_lvgl_Porting` example. The marine UI is
implemented separately under `main/ui/`.

## LD2410C proof-of-concept wiring

The initial integration uses only the LD2410C digital `OUT` signal. The
manufacturer specifies a 5 V supply capable of at least 200 mA and a 3.3 V
digital output. Follow the labels on the physical LD2410C rather than assuming
its orientation from a photograph:

| LD2410C | Connection |
| --- | --- |
| `VCC` | Regulated 5 V supply shared with the display supply |
| `GND` | Supply ground and Waveshare ground (all common) |
| `OUT` | Waveshare `UART2` header `RXD` (ESP32 GPIO44) |
| `UART_TX` | Not connected for this proof of concept |
| `UART_RX` | Not connected for this proof of concept |

With power off, move the Waveshare slide selector from `UART1` to `UART2`.
This routes the four-pin `UART2` header to ESP32 GPIO43/GPIO44. The proof of
concept repurposes only its `RXD`/GPIO44 pin as a digital input; `TXD` remains
unused. The LD2410C `OUT` signal is 3.3 V, so it can connect directly to RXD.

Do not connect `OUT` to the exposed Sensor AD pin. Sensor AD is GPIO4 and is
shared with the actively driven GT911 touch interrupt/reset sequence. An
inline resistor would limit contention current but would not make the shared
line a reliable presence input because the touch controller also drives it.
Do not power the LD2410C from either header's 3.3 V pin.

Moving the selector to `UART2` disconnects the CH343 USB-to-UART path used by
the `UART1` USB-C connector. Use the board's native `USB` connector for the
ESP-IDF secondary USB Serial/JTAG log while testing this build. The display
initialization explicitly holds CH422G `USB_SEL` low after touch reset so the
native USB pins remain routed to that connector rather than to CAN.

On boot, the firmware configures GPIO44 as an input with a pull-down and logs
the initial state. A state that remains changed for 250 ms produces one of:

```text
LD2410C presence changed: PRESENT
LD2410C presence changed: CLEAR
```

The initial debounced state and each subsequent stable transition drive only
the LCD backlight: `PRESENT` turns it on and `CLEAR` turns it off. The ESP32,
LVGL application, touch controller, telemetry and presence task continue
running while the backlight is off, so detection can wake it immediately. The
LD2410C's configured no-person delay determines how long after the space clears
the `OUT` signal remains high; the commissioned sensor is currently set to a
1.5 m range and 15-second no-person delay. Presence is not published to Signal
K and does not drive alarms or any other automation. The firmware continues to
log the raw and debounced state every five seconds for commissioning visibility.

## Build

Install ESP-IDF 5.5.5 and then run:

```bash
source /path/to/esp-idf-v5.5.5/export.sh
idf.py build
```

The checked-in defaults select the ESP32-S3 target, 240 MHz CPU, QIO flash,
16 MB flash capacity, 80 MHz octal PSRAM, LVGL tearing avoidance, and the
Montserrat font sizes used by the interface.

Wi-Fi credentials and the fallback Signal K endpoint are ESP-IDF Kconfig
values stored only in the ignored local `sdkconfig`. Do not commit credentials.

## Signal K and microSD configuration

At boot the firmware mounts the card at `/sdcard`, without formatting it, and
looks for:

```text
/krishna/config.json
```

Copy `config.json.example` to that path and set the boat Pi address and port.
Only the non-secret Signal K endpoint belongs in this file. A valid SD value
overrides the compiled fallback, allowing the same firmware image to move from
the test instance to the boat. Missing or malformed configuration safely
retains the fallback endpoint.

The device writes `/krishna/boot.txt` after each successful mount with the
firmware identity, selected endpoint, and configuration source. The SD card is
also reserved for later offline assets, bounded telemetry cache, and
diagnostics; those stores are not implemented in this milestone.

Current path bindings are:

- `navigation.speedOverGround`
- `navigation.position`
- `navigation.gnss.methodQuality`
- `navigation.headingTrue`
- `environment.depth.belowKeel`, falling back to
  `environment.depth.belowSurface`
- `environment.wind.speedApparent`
- `environment.wind.speedTrue`
- `environment.wind.angleTrueWater`
- `environment.wind.directionTrue`
- `electrical.batteries.house.capacity.stateOfCharge`
- `electrical.batteries.house.voltage`
- `electrical.batteries.house.current`
- `electrical.batteries.start.capacity.stateOfCharge`
- `electrical.batteries.start.voltage`
- `electrical.batteries.start.current`
- `tanks.freshWater.0.currentLevel`
- `electrical.solar.0.panelPower`

Legacy `electrical.batteries.A.*` values remain accepted as a House-bank
fallback. Clock time comes from the timestamp on each Signal K update and
advances locally between deltas. `CONFIG_KRISHNA_TIMEZONE` controls the POSIX
timezone; its default is Europe/London with daylight-saving transitions.

The top-row Wi-Fi indication uses a dot and three curved arcs whose colour and
visible arc count follow the ESP32 station RSSI; it is not synthetic Signal K
data. Signal K is `LIVE` while
deltas arrive within five seconds, then `STALE`, and becomes unavailable when
the WebSocket disconnects. GPS is `LIVE`, `STALE`, or unavailable based on
fresh `navigation.position` or `navigation.gnss.methodQuality` updates. The
The Anchor Watch wind card uses true wind speed and absolute true direction;
its cyan perimeter sector uses true wind angle relative to the bow.
The Vessel Stores panel converts fresh-water ratio to percent and displays
solar panel power as integer watts plus a proportional bar scaled to the
boat's 50 W maximum input. The compact Essential Systems card omits the
redundant read-only caption. The Anchor Watch plot is head-up: its
boat symbol is centred from the plot object's actual centre, always points
upward, and the north marker moves on a fixed-radius orbit just beyond the
20 NM ring. The outer range label is drawn inside the plot in high contrast.
from true heading. When anchor watch is inactive, only AIS targets with fresh
position and SOG above 0.5 kn are plotted, out to 20 NM, after transformation
into this same head-up frame. The development FPS/CPU overlay is disabled.

## Controlled deployment

Before the first flash of a device, capture its complete flash using the size
reported by `esptool flash-id`. For the verified 16 MB board:

```bash
python -m esptool --port /dev/ttyACM0 read-flash 0x0 0x1000000 full-flash-16mb.bin
sha256sum full-flash-16mb.bin
idf.py -p /dev/ttyACM0 flash
idf.py -p /dev/ttyACM0 monitor
```

Use a `/dev/serial/by-id/` path in preference to `/dev/ttyACM0` when available.

## Recovery

The complete pre-deployment flash can be restored with:

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 \
  write-flash 0x0 full-flash-16mb.bin
```

Verify the backup checksum and exact target before restoring. A recovery write
replaces the bootloader, partition table, application, NVS, and all other flash
content.

## Validation boundary

The deployed build has verified flash integrity, boot, PSRAM, RGB/LVGL
startup, GT911 identification, 30,436 MiB SD mount and write, Wi-Fi association,
Signal K WebSocket subscription, and complete live dashboard readiness. Host
tests cover telemetry state/quality, self-versus-AIS context separation, and
valid, null, unknown, missing, and malformed delta inputs. Live AIS rendering
has not been end-to-end accepted because the test feed has no AIS targets.
WebSocket fragmentation, long-duration reconnect/soak behaviour,
touch interactions, daylight readability, and reduced brightness remain to be
validated.

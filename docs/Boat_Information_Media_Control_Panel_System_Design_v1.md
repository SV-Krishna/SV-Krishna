# Boat Information and Media Control Panel

## System Design Document

**Version:** 1.0 (Working Draft)

## 1. Introduction

This document defines the architecture for a permanently installed boat information and media control panel based on the Waveshare ESP32-S3 7-inch touchscreen. The Raspberry Pi remains the primary onboard computer. The ESP32 provides a responsive touchscreen user interface, local environmental sensing and media control.

## 2. Objectives

- Display live vessel data from Signal K.
- Measure cabin temperature, humidity and pressure.
- Control the Raspberry Pi media player.
- Minimise power consumption by sleeping the display backlight while keeping the ESP32 operational.
- Provide a modular platform for future expansion.

## 3. Scope

### Included

- Waveshare ESP32-S3 7-inch display
- LVGL
- Wi-Fi
- Signal K publish/subscribe
- Bosch BME280
- Hi-Link LD2410C
- Raspberry Pi media control
- microSD assets and logs
- OTA firmware updates

### Excluded

- NMEA2000/CAN
- BLE sensors
- Gas sensors
- Tank sensors
- Local audio playback

## 4. System Architecture

```text
BME280 --> ESP32 Display <-- LD2410C
                |
             Wi-Fi
                |
         Raspberry Pi
      Signal K + Media
                |
          HiFiBerry DAC
                |
         Amplifier/Speakers
```

## 5. Hardware

### Display

Waveshare ESP32-S3 7-inch capacitive touchscreen with microSD, Wi-Fi and LVGL.

### Raspberry Pi

Hosts Signal K, media player, internet radio and HiFiBerry DAC.

### Environmental Sensor

Bosch BME280 connected via I²C.

### Presence Sensor

Hi-Link LD2410C using digital OUT through the Waveshare UART2 RXD header pin
to GPIO44.

### Power

12 V boat supply → 2 A fuse → IP67/IP68 12 V to 5 V 5 A buck converter.

## 6. Wiring

### BME280

- 3V3
- GND
- SDA → GPIO8
- SCL → GPIO9

### LD2410C

- 5 V
- GND
- OUT → UART2 RXD / GPIO44

Set the board's physical UART selector to `UART2`; the proof of concept treats
RXD as an ordinary digital input rather than enabling the LD2410C serial
protocol. The exposed Sensor AD connector remains unsuitable because GPIO4 is
shared with the actively driven GT911 touch interrupt/reset sequence. The
LD2410C UART pins remain disconnected.

### Connectors

- WAGO 221 for power distribution.
- Phoenix-style pluggable screw terminals for sensors.
- Ferrules on all stranded conductors.

## 7. GPIO Allocation

- GPIO44 via UART2 RXD: Presence sensor
- GPIO8: I²C SDA
- GPIO9: I²C SCL

## 8. Signal K

### Publish

- `environment.inside.cabin.temperature`
- `environment.inside.cabin.relativeHumidity`
- `environment.inside.cabin.pressure`

### Subscribe

Battery, solar, GPS, depth, heading, wind, navigation, media status and other selected vessel data.

## 9. Media Interface

ESP32 communicates with a REST API on the Raspberry Pi supporting:

- Play
- Pause
- Next
- Previous
- Volume
- Source selection
- Current track metadata
- Album artwork

## 10. LVGL Screens

1. Home
2. Environment
3. Electrical
4. Navigation
5. Media
6. Settings

## 11. Power Management

### Normal

- Backlight on
- Wi-Fi active
- Signal K connected

### Idle

- Future option: dim display after inactivity. This is not implemented in the
  current firmware.

### Sleep

- Backlight off.
- ESP32 remains active.
- Wi-Fi maintained.
- BME280 sampling continues.
- Signal K communications continue.

### Wake

- LD2410C `PRESENT` enables the backlight immediately. The commissioned sensor
  currently uses a 1.5 m range and 15-second no-person delay; its stable
  `CLEAR` output disables the backlight.
- Future option: touchscreen wake. This is not implemented because the
  backlight is currently controlled directly from presence state.

## 12. microSD Usage

- Fonts
- Icons
- Album artwork cache
- Station logos
- Configuration
- Diagnostic logs

## 13. Software Architecture

Modules:

- Display/LVGL
- BME280 driver
- Presence manager
- Signal K client
- Media client
- Wi-Fi manager
- OTA manager
- Configuration manager

## 14. Bill of Materials

- Waveshare ESP32-S3 7-inch display
- Bosch BME280 breakout
- Hi-Link LD2410C
- IP67/IP68 12 V → 5 V 5 A converter
- 2 A blade fuse
- WAGO 221 connectors
- Phoenix pluggable terminals
- 16–32 GB microSD

## 15. Development Phases

1. Hardware bring-up.
2. Sensor integration.
3. Signal K integration.
4. Media control.
5. LVGL refinement.
6. OTA updates.
7. Enclosure and commissioning.

## 16. Open Items

- Confirm exact PCB revision.
- Measure and record LD2410C OUT voltage level on the installed sensor; the
  manufacturer's documented logic-high level is 3.3 V and the physical
  digital-state path has been accepted.
- Measure real current draw with backlight on/off.
- Finalise media API.
- Produce enclosure drawings.
- Produce wiring schematics.

# Boat Information and Media Control Panel

## System Design v0.1

## Purpose

Create a permanently installed touchscreen panel for the boat using the Waveshare ESP32-S3 7-inch display.

The panel will:

- present vessel information using LVGL;
- measure cabin temperature, humidity and pressure;
- publish cabin readings to Signal K;
- subscribe to selected Signal K vessel data;
- act as a remote control for the Raspberry Pi media system;
- dim and switch off the screen backlight when nobody is present;
- keep the ESP32, Wi-Fi and BME280 running while the screen is off.

The Raspberry Pi remains responsible for Signal K, media storage, audio decoding and DAC output.

## Confirmed Scope

### Included

- Waveshare ESP32-S3 7-inch touchscreen;
- LVGL interface;
- Wi-Fi connection to Raspberry Pi;
- BME280 environmental sensor;
- Hi-Link LD2410C presence sensor;
- Signal K publish and subscribe;
- Raspberry Pi media remote control;
- backlight dimming and sleep behaviour;
- microSD assets and logs;
- OTA firmware updates;
- separate regulated 5 V supply.

### Excluded

- NMEA 2000 and CAN;
- gas sensors;
- tank-level sensors on this device;
- BLE sensors;
- local audio decoding;
- safety-critical switching.

## Architecture

```text
BME280 --I2C--> Waveshare ESP32-S3 display
                        |
                        | Wi-Fi
                        v
                  Raspberry Pi
                  - Signal K
                  - media server
                  - DAC
                        |
                        v
                  amplifier/speakers
```

## Hardware

### Waveshare ESP32-S3 7-inch display

The board provides:

- 800 x 480 capacitive touchscreen;
- ESP32-S3 processor;
- Wi-Fi;
- PSRAM and flash;
- microSD slot;
- external I2C;
- external `AD` input mapped to GPIO6 on the identified revision.

The exact PCB revision must be confirmed before final pin definitions are frozen.

### BME280

Use a genuine Bosch BME280 breakout from Pimoroni or Adafruit.

Measurements:

- temperature;
- relative humidity;
- atmospheric pressure.

Mount it 10-30 cm away from the display electronics and buck converter in a ventilated housing, away from sunlight and condensation drips.

### LD2410C presence sensor

Use a genuine Hi-Link HLK-LD2410C.

Purpose:

- detect somebody near the display;
- wake the backlight;
- keep the screen awake while somebody is sitting still;
- allow the screen to turn off when the cabin area is unoccupied.

Configure a short detection range, provisionally 1.5-2 metres.

### Power converter

Use a fixed-output encapsulated buck converter with:

- nominal 12 V boat input;
- preferred input range around 9-36 V DC;
- regulated 5 V output;
- minimum 3 A capacity;
- preferred 5 A capacity;
- IP67 or IP68 encapsulation;
- short-circuit, overcurrent and thermal protection.

Avoid exposed adjustable MP1584-style modules for the permanent installation.

## Power Wiring

```text
Boat 12 V positive
  |
  |-- 2 A fuse near source
  |-- optional isolation switch
  v
12 V to 5 V buck converter
  |
  |-- Waveshare display
  |-- LD2410C
  v
Common negative return
```

The final fuse rating must be checked against cable size, converter characteristics and measured startup current.

## Sensor Wiring

### BME280

```text
Waveshare        BME280
-------------------------
3.3 V       ->   3V3/VIN
GND         ->   GND
GPIO8 SDA   ->   SDA
GPIO9 SCL   ->   SCL
```

Expected I2C address: `0x76` or `0x77`.

### LD2410C

```text
LD2410C          Connection
---------------------------
VCC         ->   regulated 5 V
GND         ->   common GND
OUT         ->   GPIO6 / J8 AD
TX          ->   unused initially
RX          ->   unused initially
```

Confirm that the `OUT` signal is safe for a 3.3 V ESP32 input before direct connection. Use level shifting if required.

## GPIO Allocation

```text
GPIO6   LD2410C presence input
GPIO8   I2C SDA
GPIO9   I2C SCL
```

## Connectors and Fasteners

Permanent installation principles:

- no loose Dupont leads;
- use stranded wire;
- use bootlace ferrules;
- use strain relief;
- label both ends of cables;
- make the display removable without cutting wires.

Use:

- WAGO 221 connectors or marine distribution terminals for 12 V, 5 V and ground;
- Phoenix-style pluggable screw terminal blocks for BME280, LD2410C and removable board connections;
- a small interface PCB or secured carrier for the terminal blocks.

## Signal K

### Publish

```text
environment.inside.cabin.temperature
environment.inside.cabin.relativeHumidity
environment.inside.cabin.pressure
```

Use Signal K standard units:

- temperature in kelvin;
- humidity as a ratio from 0 to 1;
- pressure in pascals.

Initial timing:

- sample BME280 every 5-10 seconds;
- update the local screen immediately;
- publish every 10-30 seconds.

### Subscribe

Candidate data:

- leisure battery voltage;
- starter battery voltage;
- battery current;
- state of charge;
- solar generation;
- charging state;
- speed and course over ground;
- heading;
- depth;
- position;
- water temperature;
- wind data;
- anchor alarm and bilge status where available.

## Media Control

The Raspberry Pi remains responsible for music storage, internet radio, decoding, playlists and DAC output.

The ESP32 will provide:

- play and pause;
- previous and next;
- volume and mute;
- source selection;
- station or playlist selection;
- current track or station;
- album artwork or station logo.

Candidate API:

```text
GET  /api/media/status
POST /api/media/play
POST /api/media/pause
POST /api/media/next
POST /api/media/previous
POST /api/media/volume
POST /api/media/source
POST /api/media/station
```

## LVGL Screens

### Home

- cabin readings;
- battery and solar summary;
- current media;
- navigation buttons.

### Environment

- temperature;
- humidity;
- pressure;
- short trend graphs;
- minimum and maximum readings.

### Electrical

- battery voltages;
- current;
- state of charge;
- solar generation;
- charger state.

### Navigation

- speed over ground;
- course over ground;
- heading;
- depth;
- position;
- water temperature;
- wind data where available.

This is a secondary display, not the sole navigation instrument.

### Media

- artwork or station logo;
- title and artist;
- transport controls;
- volume;
- source and favourites.

### Settings

- brightness;
- dimming timeout;
- screen-off timeout;
- Wi-Fi and server status;
- firmware version;
- diagnostics.

## Power-Saving Behaviour

### Active

- backlight on;
- normal LVGL refresh;
- Wi-Fi connected;
- Signal K active;
- media status active;
- BME280 sampling active.

### Dimmed

After a configurable period without presence, reduce brightness while keeping all services active.

### Screen Off

After a second timeout:

- switch off the LCD backlight;
- stop unnecessary animations;
- reduce LVGL redraws;
- keep ESP32 running;
- keep Wi-Fi connected;
- continue Signal K and BME280 activity;
- continue receiving media status.

Wake on presence and, where supported, touchscreen activity.

## microSD Use

```text
/assets/icons
/assets/fonts
/assets/station-logos
/assets/album-art
/config/settings.json
/logs/system.log
```

The Raspberry Pi remains the primary long-term data store.

## Software Structure

```text
src/
  main.cpp
  display/
  sensors/
  signalk/
  media/
  network/
  storage/
  config/
```

The display, sensing and networking code must be non-blocking so that a failed network request cannot freeze LVGL.

## Offline Behaviour

When Wi-Fi or the Raspberry Pi is unavailable:

- continue displaying live BME280 readings;
- show last-known Signal K values as stale;
- show media server as offline;
- continue local presence and screen-control behaviour.

## Initial Bill of Materials

- Waveshare ESP32-S3 7-inch touchscreen;
- Pimoroni or Adafruit BME280 breakout;
- genuine Hi-Link HLK-LD2410C;
- IP67/IP68 fixed 12 V to 5 V converter, minimum 3 A and preferred 5 A;
- 2 A blade fuse and holder;
- WAGO 221 connectors or marine distribution terminals;
- Phoenix-style pluggable terminal blocks;
- 16-32 GB microSD card;
- stranded wire, ferrules, heat-shrink and strain relief.

## Development Phases

1. Hardware bring-up: power, display, LVGL, BME280 and presence sensor.
2. Signal K: publish cabin data and subscribe to selected vessel paths.
3. Media: implement Raspberry Pi API and ESP32 remote controls.
4. Refinement: sleep behaviour, OTA, graphs, caching and diagnostics.

## Open Items

- confirm the exact Waveshare board revision;
- confirm connector pin order against the physical board;
- verify LD2410C output voltage;
- select the exact buck converter;
- identify the Raspberry Pi media software and control interface;
- confirm the available Signal K paths;
- design the enclosure and sensor ventilation;
- measure active, dimmed and backlight-off current.
# ESP32-S3 Relay 6CH provisioning firmware

This Arduino sketch turns the Waveshare `ESP32-S3-Relay-6CH` into a provisioning access point + relay HTTP endpoint device.

## Default provisioning network

- SSID: `SVK-Relay-6CH-<MACSUFFIX>` (printed on serial at boot)
- Password: `svkrishna`
- Device IP on that network: `192.168.4.1`

Open:

- `http://192.168.4.1/` for relay control
- `http://192.168.4.1/wifi` to set boat/router Wi‑Fi (STA) credentials

Once STA credentials are saved, the device will try to connect while keeping the AP up. The STA IP is printed to serial and shown on the web UI.

## Control endpoints

The firmware exposes:

- `GET /getData` -> JSON array of six relay states
- `GET /Switch1` ... `GET /Switch6` -> toggle a single relay
- `GET /AllOn`
- `GET /AllOff`
- `GET /PowerCyclePi` -> pulse `CH6` high for 5 seconds, then restore it to off

`CH6` is reserved for Pi power-cycle wiring in this firmware. Remote recovery
flows should use `/PowerCyclePi` instead of raw `/Switch6` toggles.

## Build (arduino-cli)

After installing `arduino-cli` and the `esp32:esp32` core:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32s3 --export-binaries firmware/esp32-s3-relay6ch-provisioning
```

Flashing requires multiple binaries and offsets (bootloader/partitions/app). The compiled build output includes a `flasher_args.json` which can be used to determine offsets.

## Upload

Example upload to the attached relay on `/dev/ttyACM0`:

```bash
/home/antony-slack/Documents/SV-Krishna/local/tools/arduino-cli upload \
  -p /dev/ttyACM0 \
  --fqbn esp32:esp32:esp32s3 \
  firmware/esp32-s3-relay6ch-provisioning
```

Verified on July 1, 2026:

- board enumerated as Espressif USB JTAG/serial debug unit
- serial device `/dev/ttyACM0`
- STA hostname `svk-relay-6ch-551b18.local`
- STA IP `192.168.68.81`
- `/PowerCyclePi` returned `OK` and restored relay state to all-off

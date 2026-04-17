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

## Build (arduino-cli)

After installing `arduino-cli` and the `esp32:esp32` core:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32s3 --export-binaries firmware/esp32-s3-relay6ch-provisioning
```

Flashing requires multiple binaries and offsets (bootloader/partitions/app). The compiled build output includes a `flasher_args.json` which can be used to determine offsets.


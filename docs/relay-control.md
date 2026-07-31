# Relay control (Waveshare ESP32-S3-Relay-6CH, provisioning firmware)

This repo now controls the Waveshare `ESP32-S3-Relay-6CH` using the custom
provisioning firmware in
`firmware/esp32-s3-relay6ch-provisioning/`. The device exposes a local HTTP
control surface and can either run in its own provisioning AP mode or join the
boat/router Wi‑Fi in STA mode while keeping the AP up.

## 1) Flash the SV-Krishna provisioning firmware

Build:

```bash
/home/antony-slack/Documents/SV-Krishna/local/tools/arduino-cli compile \
  --fqbn esp32:esp32:esp32s3 \
  --export-binaries \
  firmware/esp32-s3-relay6ch-provisioning
```

Upload to the connected relay:

```bash
/home/antony-slack/Documents/SV-Krishna/local/tools/arduino-cli upload \
  -p /dev/ttyACM0 \
  --fqbn esp32:esp32:esp32s3 \
  firmware/esp32-s3-relay6ch-provisioning
```

Current verified device details from the July 1, 2026 bench test:

- USB serial device: `/dev/ttyACM0`
- AP SSID: `SVK-Relay-6CH-551B18`
- AP password: `svkrishna`
- STA hostname: `svk-relay-6ch-551b18.local`
- STA IP on `Maison de papa elton`: `192.168.68.81`

The relay web server exposes these endpoints:

- `GET /getData` → JSON array of 6 relay flags (0/1)
- `GET /Switch1` … `GET /Switch6` → toggle relay channel
- `GET /AllOn` / `GET /AllOff`
- `GET /PowerCyclePi` → pulse `CH6` high for 5 seconds, then restore it to off

`CH6` is reserved for Pi power-cycle wiring in the provisioning firmware. Use
`/PowerCyclePi` for that path instead of a raw `/Switch6` toggle if the relay is
wired to interrupt the Pi power path.

## 2) Provision Wi‑Fi

If the relay is in AP mode:

1. Join the relay AP:
   - SSID `SVK-Relay-6CH-551B18` for the currently tested unit
   - password `svkrishna`
2. Open `http://192.168.4.1/wifi`
3. Enter the target SSID/password
4. Click `Save & Reconnect`

For the July 1, 2026 test, the relay was joined to:

- SSID: `Maison de papa elton`

Once connected in STA mode, prefer using either:

- `http://svk-relay-6ch-551b18.local`
- `http://192.168.68.81`

## 3) Enable relay control in SV-Krishna

In your `.env` (or exported env vars):

- `RELAY_CONTROL_ENABLED=true`
- `RELAY_BASE_URL=http://<device-ip>` (or `http://<device-host>.local` if mDNS is enabled)
- `RELAY_REQUIRE_CONFIRMATION=true` (recommended)

For the currently tested relay, use one of:

- `RELAY_BASE_URL=http://192.168.68.81`
- `RELAY_BASE_URL=http://svk-relay-6ch-551b18.local`

## 4) Use it

Run SV‑Krishna and use typed mode (`t`) or voice.

Example prompts:

- `Turn relay ch1 on`
- `Turn all relays off`
- `Relay status`
- `Power cycle the Pi`

SV‑Krishna uses the LLM to produce a structured relay command, asks for confirmation (if enabled), then calls the device HTTP endpoints. For per-channel “set” operations it uses `/getData` to avoid relying on toggles when the state is already correct.

If you want voice commands to switch immediately (no click-confirm in the Web UI), set:

- `RELAY_REQUIRE_CONFIRMATION=false`

## 5) Router-triggered Pi recovery

The intended OpenWrt recovery path is:

1. SSH to the router
2. Issue an HTTP request from the router to the relay:

```bash
wget -O - http://192.168.68.81/PowerCyclePi
```

or

```bash
curl http://192.168.68.81/PowerCyclePi
```

3. The relay pulses `CH6` for 5 seconds, then returns it to `off`
4. If `CH6` is wired into the Pi power path with the expected polarity, the Pi power is interrupted for the pulse window and then restored

Bench verification on July 1, 2026:

- `GET /PowerCyclePi` returned `OK`
- two test pulses completed successfully
- `GET /getData` returned `[0,0,0,0,0,0]` after each pulse, confirming `CH6` returned to `off`

Before using this remotely from the router, confirm the wiring polarity:

- `CH6 on` must be the "power disconnected" state
- `CH6 off` must be the "power restored" state

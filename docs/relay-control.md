# Relay control (Waveshare ESP32-S3-Relay-6CH, MAIN_WIFI_STA)

This repo can control a Waveshare `ESP32-S3-Relay-6CH` over HTTP using the vendor Arduino demo `MAIN_WIFI_STA` (Wi‑Fi station mode + on-device web server).

## 1) Flash the Waveshare STA demo

1. Download the Waveshare demo bundle referenced from the wiki page.
2. Open `Arduino/examples/MAIN_WIFI_STA/MAIN_WIFI_STA.ino` in the Arduino IDE.
3. Edit Wi‑Fi credentials in `WS_Information.h`:
   - `STASSID` (Wi‑Fi SSID)
   - `STAPSK` (Wi‑Fi password)
4. Build and flash.
5. Open the serial monitor and note the printed IP address (the web server listens on port 80).

The demo web server exposes these endpoints:

- `GET /getData` → JSON array of 6 relay flags (0/1)
- `GET /Switch1` … `GET /Switch6` → toggle relay channel
- `GET /AllOn` / `GET /AllOff`

## 2) Enable relay control in SV-Krishna

In your `.env` (or exported env vars):

- `RELAY_CONTROL_ENABLED=true`
- `RELAY_BASE_URL=http://<device-ip>` (or `http://<device-host>.local` if mDNS is enabled)
- `RELAY_REQUIRE_CONFIRMATION=true` (recommended)

## 3) Use it

Run SV‑Krishna and use typed mode (`t`) or voice.

Example prompts:

- `Turn relay ch1 on`
- `Turn all relays off`
- `Relay status`

SV‑Krishna uses the LLM to produce a structured relay command, asks for confirmation (if enabled), then calls the device HTTP endpoints. For per-channel “set” operations it uses `/getData` to avoid relying on toggles when the state is already correct.

If you want voice commands to switch immediately (no click-confirm in the Web UI), set:

- `RELAY_REQUIRE_CONFIRMATION=false`

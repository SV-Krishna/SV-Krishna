# Pi boot / persistent services

Goal: the Pi boots into a responsive SV‑Krishna setup, and optional components (relay + TTS) can be down without stopping the app.

## Recommended deployment layout

- Clone or copy this repo to `/opt/SV-Krishna`
- Build once (do not run `tsx` in production):
  - `npm ci`
  - `npm run build`
- Create writable runtime dirs, e.g.:
  - `/var/lib/svkrishna/audio`
  - `/var/lib/svkrishna/rag`

## systemd services

Unit templates live in `deploy/systemd/`:

- `deploy/systemd/sv-krishna.service` (main app)
- `deploy/systemd/sv-krishna-whisper.service` (Whisper HTTP server)

Install helper:

- `sudo bash deploy/systemd/install.sh`

Then edit:

- `/etc/sv-krishna/sv-krishna.env`
- `/etc/sv-krishna/whisper.env`

Enable + start:

- `sudo systemctl enable --now sv-krishna-whisper.service`
- `sudo systemctl enable --now sv-krishna.service`

Logs:

- `journalctl -u sv-krishna.service -f`
- `journalctl -u sv-krishna-whisper.service -f`

## Relay addressing

For maximum robustness, prefer one of:

- DHCP reservation for the relay MAC, then `RELAY_BASE_URL=http://<fixed-ip>`
- mDNS hostname (requires Avahi on the Pi), e.g. `RELAY_BASE_URL=http://svk-relay-6ch-551b18.local`

## Degraded mode behavior

SV‑Krishna should keep running even if:

- relay is unreachable (relay actions return “Relay unavailable …” but the app stays up)
- Piper/TTS is not installed/configured (it will still respond via text)

When running headless (no terminal), use the Web UI and the `Listen` button to trigger a one-shot voice run.

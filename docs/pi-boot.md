# Pi boot / persistent services

Goal: the Pi boots into a responsive SV‑Krishna setup, and optional components (relay + TTS) can be down without stopping the app.

## Recommended deployment layout

- Clone or copy this repo to `/opt/svkrishna/app`
- Build once (do not run `tsx` in production):
  - `npm ci`
  - `npm run build`
- Create `/opt/svkrishna/app/.env` from `.env.template` and adjust values for the Pi (audio devices, models, etc.)
- Create writable runtime dirs, e.g.:
  - `/var/lib/svkrishna/audio`
  - `/var/lib/svkrishna/rag`

## systemd services

Unit templates live in `deploy/systemd/`:

- `deploy/systemd/svkrishna.service` (main app)
- `deploy/systemd/svkrishna-whisper.service` (Whisper HTTP server)

Install helper:

- `sudo bash deploy/systemd/install.sh`

Enable + start:

- `sudo systemctl enable --now svkrishna-whisper.service`
- `sudo systemctl enable --now svkrishna.service`

Logs:

- `journalctl -u svkrishna.service -f`
- `journalctl -u svkrishna-whisper.service -f`

## Relay addressing

For maximum robustness, prefer one of:

- DHCP reservation for the relay MAC, then `RELAY_BASE_URL=http://<fixed-ip>`
- mDNS hostname (requires Avahi on the Pi), e.g. `RELAY_BASE_URL=http://svk-relay-6ch-551b18.local`

## Degraded mode behavior

SV‑Krishna should keep running even if:

- relay is unreachable (relay actions return “Relay unavailable …” but the app stays up)
- Piper/TTS is not installed/configured (it will still respond via text)

When running headless (no terminal), use the Web UI and the `Listen` button to trigger a one-shot voice run.

## RAG ingest policy (recommended)

On the Pi, prefer **read-only RAG**:

- `RAG_ALLOW_INGEST=false`
- copy `/opt/svkrishna/rag/inbox/*.pdf` + `/opt/svkrishna/rag/store.json` from the build machine

This keeps the Pi responsive and prevents accidental rebuilds with a different extractor.

## Piper voice selection (optional)

To change the voice, point `PIPER_MODEL_PATH` at another `.onnx` voice model under `/opt/svkrishna/models/piper/`
and restart `svkrishna.service`.

# Pi boot / persistent services

Goal: the Pi boots into a responsive SV‑Krishna setup, and optional components (relay + TTS) can be down without stopping the app.

## Recommended deployment layout

- Clone or copy this repo to `/opt/svkrishna/app`
- Build once (do not run `tsx` in production):
  - `npm ci`
  - `npm run build`
- Create `/opt/svkrishna/app/.env` from `.env.template` and adjust values for the Pi (audio devices, models, etc.)
- Ensure writable runtime dirs exist (the defaults are under `/opt/svkrishna/`):
  - `/opt/svkrishna/audio`
  - `/opt/svkrishna/rag`
  - `/opt/svkrishna/logs`

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

## Wake word runtime

Wake-word detection runs inside the main `svkrishna.service` process. It does not use a separate systemd unit.

Prerequisites on the Pi:

- `python3`
- `python3-venv`
- `sox` or `arecord`
- `openwakeword` installed into the configured Python environment
- a trained wake-word model file for `"Hey Krishna"`

Recommended layout:

- Python runtime: `/opt/svkrishna/venvs/wakeword/bin/python`
- model file: `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`

Required `.env` settings:

```text
ENABLE_WAKE_WORD=true
WAKE_WORD_PHRASE=Hey Krishna
WAKE_WORD_PYTHON=/opt/svkrishna/venvs/wakeword/bin/python
WAKE_WORD_MODEL_PATH=/opt/svkrishna/models/openwakeword/hey-krishna.onnx
AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0
AUDIO_INPUT_CHANNELS=2
AUDIO_INPUT_CHANNEL_SELECT=right
RESPEAKER_XVF_ENABLED=true
```

Verification:

- `journalctl -u svkrishna.service -f`
- open the Web UI and confirm the wake-word status says it is listening
- if it says enabled but not listening, check the model path, Python path, and `AUDIO_INPUT_DEVICE`
- during live wake-word checks, look for `Wake-word follow-up looked like filler: ...`, `Wake-word retry captured command: ...`, and `Wake-word retry still looked like filler: ...`
- if a user pauses after `Hey Krishna`, expect one reprompt before the app asks them to say `Hey Krishna` and the request together

## Transcribing cue runtime

The main service can also play a short `Got it` cue during `transcribing`.

Recommended `.env` settings:

```text
ENABLE_TRANSCRIBING_CUE=true
TRANSCRIBING_CUE_TEXT=Got it
```

Notes:

- the cue uses the existing Piper voice actor and is pre-generated to a local WAV cache
- playback is best-effort and is stopped before reply playback begins
- AEC remains deferred because the playback device must stay as-is for now

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

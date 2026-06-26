# Deploy From Local Machine To Raspberry Pi

This document describes the repeatable process we use to get changes from the local development machine to the Raspberry Pi.

It covers two deployment paths:

1. Git pull + build on the Pi (recommended)
2. Copy `dist/` to the Pi (quick hotfix fallback)

It also calls out the RAG store workflow (build machine -> Pi).

For detailed RASA + SignalK operational history (training artifacts, service config, and anchor alarm troubleshooting/fixes), see:

- `docs/rasa-signalk-ops-log-2026-05-18.md`

## Assumptions

- Local repo path: `/home/antony-slack/Documents/SV-Krishna`
- Raspberry Pi app path: `/opt/svkrishna/app`
- Raspberry Pi RAG path: `/opt/svkrishna/rag`
- Local test Pi user: `admin`
- Local test Pi IP: `192.168.68.203`
- Live onboard Pi hostname: `Krishna`
- Live onboard Pi user: `pi`
- Live onboard Pi IP: `192.168.195.206`

If any of those differ, adjust the commands accordingly.

Environment note:

- `192.168.68.203` remains the pre-deploy test target.
- `192.168.195.206` is the live boat target.
- On test Pi `203`, the SV-Krishna app Web UI is `http://192.168.68.203:8080/` (confirmed) and not `:3000`.
- `:3000` is reserved for SignalK API/UI.

## SSH access to the Pi

Basic access (test Pi):

```bash
ssh admin@192.168.68.203
```

Basic access (live Pi):

```bash
ssh pi@192.168.195.206
```

We strongly recommend switching to SSH keys so deploys do not require typing a password each time.

### Optional: add an SSH config entry

On the local machine, create or edit `~/.ssh/config`:

```text
Host svk-pi-test
  HostName 192.168.68.203
  User admin

Host svk-pi-live
  HostName 192.168.195.206
  User pi
```

Then connect with:

```bash
ssh svk-pi-test
ssh svk-pi-live
```

### Optional: set up SSH keys (recommended)

On the local machine (if you don't already have a key):

```bash
ssh-keygen -t ed25519
```

Copy the public key to the Pi (choose one approach):

```bash
# Option A: ssh-copy-id (if installed)
ssh-copy-id admin@192.168.68.203
ssh-copy-id pi@192.168.195.206

# Option B: manual copy (always works)
cat ~/.ssh/id_ed25519.pub | ssh admin@192.168.68.203 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
cat ~/.ssh/id_ed25519.pub | ssh pi@192.168.195.206 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

After this, both `ssh admin@192.168.68.203` and `ssh pi@192.168.195.206` should not prompt for a password.

## 1) Git pull + build on the Pi (recommended)

Recommended order:

1. Deploy to test Pi (`192.168.68.203`) and validate.
2. Promote the same commit to live Pi (`192.168.195.206`).

### Step A - On the local machine: test, commit, push

From the repo root:

```bash
cd /home/antony-slack/Documents/SV-Krishna

# Run tests (required gate)
npm test

git status
git add -A
git commit -m "Describe change"
git push origin main
```

Note:

- The repo uses `main` as the primary branch.
- If `git push` fails due to HTTPS auth, ensure `origin` is set to SSH:
  - `git remote set-url origin git@github.com:SV-Krishna/SV-Krishna.git`

### Step B - On the test Pi: pull, install, build

```bash
ssh admin@192.168.68.203

cd /opt/svkrishna/app

# If the working tree is clean, this should be a fast-forward pull.
git pull --ff-only

# Install Node deps exactly (uses package-lock.json)
npm ci

# Compile TypeScript -> dist/
npm run build
```

### Step C - Promote to the live Pi: pull, install, build

```bash
ssh pi@192.168.195.206

cd /opt/svkrishna/app
git pull --ff-only
npm ci
npm run build
```

### Step D - Restart the app

If running via `systemd`, restart the service:

```bash
sudo systemctl restart svkrishna.service
```

If running manually in the background:

```bash
pkill -f "node dist/index.js" || true
nohup node dist/index.js >/opt/svkrishna/logs/app.out 2>&1 & disown
```

Validate:

```bash
tail -n 50 /opt/svkrishna/logs/app.out
```

For wake-word changes, also watch the service log during a live trial:

```bash
journalctl -u svkrishna.service -f
```

## 2) Copy dist/ to the Pi (fallback)

Use this only for quick experiments. It bypasses the Pi build step and can lead to confusion if the Pi's TypeScript source does not match the `dist/` tree.

From local:

```bash
cd /home/antony-slack/Documents/SV-Krishna
npm run build

# Test Pi
scp -r dist admin@192.168.68.203:/opt/svkrishna/app/

# Live Pi
scp -r dist pi@192.168.195.206:/opt/svkrishna/app/
```

Then restart as above.

## 2b) Full source sync to Pi with rsync (safe settings)

If you choose to sync the full repo tree to `/opt/svkrishna/app`, do not overwrite
Pi secrets. Exclude `.env` so `SIGNALK_TOKEN`, `INFLUXDB_TOKEN`, and other local-only
credentials survive deploys.

From local:

```bash
cd /home/antony-slack/Documents/SV-Krishna

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'local' \
  --exclude '.env' \
  ./ admin@192.168.68.203:/opt/svkrishna/app/
```

Then on test Pi:

```bash
cd /opt/svkrishna/app
npm ci
npm run build
sudo systemctl restart svkrishna.service
```

Repeat for the live Pi after test validation:

```bash
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'local' \
  --exclude '.env' \
  ./ pi@192.168.195.206:/opt/svkrishna/app/
```

## 3) RAG store deployment (build machine -> Pi)

Docling extraction is expensive on the Pi for large manuals. The recommended approach is:

- build `store.json` + `embeddings.json` on the local machine
- copy PDFs + stores to the Pi

See `docs/rag-evaluation-report.md` for details and copy-paste commands.

## 4) OpenWakeWord deployment on Pi

The wake-word path now uses `OpenWakeWord` through a small Python helper:

- detector script: `/opt/svkrishna/app/python/wakeword_detector.py`
- Python requirements: `/opt/svkrishna/app/python/requirements-wakeword.txt`
- current model path: `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`

Important:

- the `"Hey Krishna"` label in the Web UI is only the configured phrase name
- real detection still requires a trained `OpenWakeWord` model file at `WAKE_WORD_MODEL_PATH`

Current recommended `.env` settings on the test Pi:

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

If the wake-word model changes, deploy both:

- the Node app changes under `/opt/svkrishna/app`
- the model artifact under `/opt/svkrishna/models/openwakeword/`

### Step A - Install Python runtime for wake word on test Pi `203`

```bash
ssh admin@192.168.68.203

sudo apt update
sudo apt install -y python3 python3-venv python3-pip sox alsa-utils

sudo mkdir -p /opt/svkrishna/venvs
python3 -m venv /opt/svkrishna/venvs/wakeword
source /opt/svkrishna/venvs/wakeword/bin/activate
pip install --upgrade pip
pip install -r /opt/svkrishna/app/python/requirements-wakeword.txt
```

### Step B - Copy the Hey Krishna model onto test Pi `203`

Create the target directory and copy the trained model:

```bash
ssh admin@192.168.68.203 'mkdir -p /opt/svkrishna/models/openwakeword'

scp /path/to/hey_krishna!.onnx \
  admin@192.168.68.203:/opt/svkrishna/models/openwakeword/hey-krishna.onnx
```

If your trained file has a different name, either rename it on upload or update:

```bash
WAKE_WORD_MODEL_PATH=/opt/svkrishna/models/openwakeword/<your-model>.onnx
```

in `/opt/svkrishna/app/.env`.

### Step C - Configure environment on test Pi `203`

In `/opt/svkrishna/app/.env`, set:

```bash
ENABLE_WAKE_WORD=true
WAKE_WORD_PHRASE=Hey Krishna
WAKE_WORD_PYTHON=/opt/svkrishna/venvs/wakeword/bin/python
WAKE_WORD_MODEL_PATH=/opt/svkrishna/models/openwakeword/hey-krishna.onnx
WAKE_WORD_THRESHOLD=0.5
WAKE_WORD_CHUNK_SIZE=1280
WAKE_WORD_COOLDOWN_MS=8000
AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0
AUDIO_INPUT_CHANNELS=2
AUDIO_INPUT_CHANNEL_SELECT=right
RESPEAKER_XVF_ENABLED=true
RESPEAKER_XVF_HOST_PATH=/opt/svkrishna/tools/respeaker-xvf3800/xvf_host
RESPEAKER_XVF_AUTO_ROUTE=true
```

Audio note:

- wake-word detection uses the same `AUDIO_INPUT_DEVICE` as the main voice path
- if the listener does not start, verify the configured ALSA input device works with:

```bash
arecord -D plughw:CARD=Array,DEV=0 -f S16_LE -c 2 -r 16000 -d 3 /tmp/test.wav
```

### Step D - Restart and verify on test Pi `203`

```bash
ssh admin@192.168.68.203
sudo systemctl restart svkrishna.service
journalctl -u svkrishna.service -n 120 --no-pager
```

Then open:

- `http://192.168.68.203:8080/`

Expected behavior:

- the wake-word toggle shows `"Hey Krishna"`
- when enabled and correctly configured, status should indicate that wake word is listening
- if the model file or Python runtime is missing, the UI will show enabled but not listening
- if the user pauses after saying `Hey Krishna`, the controller should reprompt once with `Go ahead.`
- the journal should then show either `Wake-word retry captured command: ...` or `Wake-word retry still looked like filler: ...`

Recommended validation on `203`:

1. Say `Hey Krishna` and pause. Confirm the reprompt happens and no generic Ollama answer is produced from filler.
2. After the reprompt, say `what is our current depth` and confirm the retry transcript is routed normally.
3. Say `Hey Krishna what is our current depth` in one utterance and confirm the retry path is not needed.

### Step E - Promote to live Pi `206`

After validating on `203`, repeat the same steps on `206`:

```bash
ssh pi@192.168.195.206
sudo apt update
sudo apt install -y python3 python3-venv python3-pip sox alsa-utils
sudo mkdir -p /opt/svkrishna/venvs /opt/svkrishna/models/openwakeword
python3 -m venv /opt/svkrishna/venvs/wakeword
source /opt/svkrishna/venvs/wakeword/bin/activate
pip install --upgrade pip
pip install -r /opt/svkrishna/app/python/requirements-wakeword.txt
```

Copy the same trained model:

```bash
scp /path/to/hey_krishna!.onnx \
  pi@192.168.195.206:/opt/svkrishna/models/openwakeword/hey-krishna.onnx
```

Update `/opt/svkrishna/app/.env`, then:

```bash
sudo systemctl restart svkrishna.service
journalctl -u svkrishna.service -n 120 --no-pager
```

## Common pitfalls

- Git state on Pi:
  - If `git pull` fails because of local changes/untracked files, stash first:
    - `git stash push -u -m "pre-update"`
- SSH host key / Git SSH auth:
  - If using `git@github.com` on the Pi and it fails with host key verification, add `github.com` to `~/.ssh/known_hosts` by running:
    - `ssh -T git@github.com`
  - If you cannot or do not want SSH auth on the Pi, keep the Pi remote as HTTPS and rely on public read access.
- Audio defaults:
  - Device `default` may not work for USB mics/speakers; set explicit ALSA devices via `arecord -L` / `aplay -L`.
  - On test Pi `192.168.68.203` (validated on May 17, 2026), working ALSA mapping is:
    - `AUDIO_INPUT_DEVICE=plughw:CARD=UACDemoV10_1,DEV=0`
    - `AUDIO_OUTPUT_DEVICE=plughw:CARD=UACDemoV10,DEV=0`
  - Do not assume capture and playback are on the same card name.
- Rasa intent router:
  - If `/model/parse` keeps returning old intents after retraining, check for stale manual `rasa run` processes on port `5005`:
    - `ps -ef | grep "rasa run" | grep -v grep`
    - `sudo ss -ltnp | grep 5005`
  - Keep only the `systemd`-managed process (`rasa-test.service`) to avoid an old process masking the new model.
- Voice test stability on test Pi:
  - If conversational TTS fails with `audio open error: Device or resource busy`, disable background alert speech while testing:
    - `SIGNALK_ALERT_MONITOR_ENABLED=false`
  - This avoids contention between periodic SignalK alert playback and interactive voice responses.
- SignalK telemetry verification (`206`):
  - Use `http://127.0.0.1:3000/signalk/v1/api/sources` to confirm live source timestamps.
  - NMEA2000 is considered live only when PGN timestamps are advancing (for example PGNs `128259` / `128267`).
  - If `nmeaout` looks active in SignalK UI but a direct serial tap returns zero lines, treat this as expected on TX-only wiring/adapters.
  - In that case, verify output from SignalK raw logs instead of relying on local readback from `/dev/ttyOP_nmeaout`.

## Quick verification commands (`206`)

```bash
ssh pi@192.168.195.206
```

Check source freshness:

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
curl -fsS http://127.0.0.1:3000/signalk/v1/api/sources
```

Confirm AIS targets present:

```bash
curl -fsS http://127.0.0.1:3000/signalk/v1/api/vessels/
```

Direct `nmeaout` tap (may be empty on TX-only setups):

```bash
timeout 20s cat /dev/ttyOP_nmeaout
```

If tap is empty, confirm emitted NMEA sentences from SignalK raw log:

```bash
grep -a ';N;$' ~/.signalk/skserver-raw_$(date +%Y-%m-%dT%H).log | tail -n 50
```

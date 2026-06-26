# Agent Handover — 2026-06-05

## Scope

- Repo: `/home/antony-slack/Documents/SV-Krishna`
- Target Pi: `192.168.68.203`
- Relay device: `192.168.68.57`
- Objective: stabilize wake-word voice control for scoped marine commands using the harness approach, with current emphasis on relay control and telemetry queries such as current depth.

## What Was Built

- Added scoped marine harness:
  - `src/services/marineCommandHarness.ts`
- Wired harness into the controller voice flow:
  - `src/controller.ts`
- Added deterministic fast paths before Ollama for:
  - simple relay phrases
  - simple telemetry phrases
- Added and updated tests:
  - `src/test/marineCommandHarness.test.ts`
  - `src/test/controllerTelemetry.test.ts`

## Why The Changes Were Needed

- Ollama tool-calling on the Pi was too slow for simple scoped commands.
- Direct timing on the Pi showed:
  - `tryHandleMarineHarnessCommand("what is our current depth", [])`
  - took about `64872 ms`
- This delay was inside the harness’s Ollama tool-call step.
- Deterministic fast paths now bypass Ollama for direct relay and telemetry phrasings.

## Current Code Changes

### Relay fast path

- File: `src/services/marineCommandHarness.ts`
- Added deterministic parsing for simple relay commands such as:
  - `on relay one`
  - `turn relay 1 on`
  - `relay status`

### Telemetry fast path

- File: `src/services/marineCommandHarness.ts`
- Added deterministic parsing for simple telemetry commands such as:
  - `what is our current depth`
  - `current depth`
  - `current speed`
  - `wind speed`
  - `battery voltage`
  - `cabin temperature`

### Tests

- File: `src/test/marineCommandHarness.test.ts`
  - verifies simple relay fast path bypasses Ollama
  - verifies simple telemetry fast path bypasses Ollama
- File: `src/test/controllerTelemetry.test.ts`
  - updated wake-word depth test to reflect deterministic telemetry handling

## Test Status

### Local

- `npm test` → passing
- `npm run build` → passing
- Final local suite status:
  - `37/37` passing

### Pi

- Deployed to:
  - `/opt/svkrishna/app`
- Pi test run:
  - `npm test` → passing
  - final Pi suite status: `37/37`
- Service restarted successfully after deploy.

## Pi Runtime State

- Service:
  - `svkrishna.service`
- Status:
  - active and running
- Wake word:
  - enabled
- Voice status endpoint:
  - `http://192.168.68.203:8080/api/voice/status`

## Important Pi Audio Configuration

- Input device in app env:
  - `AUDIO_INPUT_DEVICE=plughw:CARD=UACDemoV10,DEV=0`
- Output device in app env:
  - `AUDIO_OUTPUT_DEVICE=plughw:CARD=UACDemoV10_1,DEV=0`
- Env file:
  - `/opt/svkrishna/app/.env`

## Audio Device Verification

### ALSA enumeration

- Capture:
  - card `0`: `UACDemoV10`
- Playback:
  - card `1`: `UACDemoV10_1`

### Mixer state

- Capture card `0`:
  - `Mic` set to max
  - `Auto Gain Control` set to `on`
- Playback card `1`:
  - `PCM` remained at about `30%`

### Basic audio tests

- Playback test passed on:
  - `plughw:CARD=UACDemoV10_1,DEV=0`
- Raw capture test passed on:
  - `plughw:CARD=UACDemoV10,DEV=0`
- While service is running, direct `arecord` on the mic fails with:
  - `Device or resource busy`
- That is expected because the wake-word process holds the capture device open.

## Audio Quality Findings

- Devices are correct.
- Playback path is correct.
- Capture path is correct.
- The primary historical issue was weak/unclear speech capture, not wrong device selection.

### Example earlier Whisper mis-transcriptions

- `You lay one.`
- `B-lay one.`
- `Mm-hmm.`
- `I'll current that.`

### After mic tuning

- Recognition improved materially.
- A depth request improved to:
  - Whisper transcript: `current depth`
  - Rasa-routed transcript: `what is our current depth`

## SignalK State

- SignalK is running on the Pi at:
  - `http://127.0.0.1:3300`
- Access requires auth token from:
  - `/opt/svkrishna/app/.env`
- Current depth is synthetic/simulated at the moment:
  - path: `environment.depth.belowTransducer`
  - source: `simulator.*`

## Relay State

- Relay base URL:
  - `http://192.168.68.57`
- Relay control is working.
- Relay state can be checked with:
  - `curl http://192.168.68.57/getData`

## Web UI Behavior

- The browser `Speak` button does **not** use browser microphone input.
- It triggers Pi-local capture through:
  - `POST /api/voice/run`
- The browser is only a control and status surface.
- Actual audio capture is from the USB mic physically attached to the Pi.

## Known Non-Blocking Issue

- Service preflight still reports:
  - `rag-extractor: spawn /home/antony-slack/Documents/SV-Krishna/python/.venv/bin/python ENOENT`
- This leaves startup state with:
  - `preflight failed: rag-extractor`
- This does **not** block:
  - wake word
  - relay control
  - telemetry queries
  - voice flow

## Key Files

- Harness:
  - `src/services/marineCommandHarness.ts`
- Controller voice loop:
  - `src/controller.ts`
- Rasa normalization:
  - `src/controller.ts`
- Intent mapping:
  - `src/controller.ts`
- Web voice endpoint:
  - `src/web/webServer.ts`
- Tests:
  - `src/test/marineCommandHarness.test.ts`
  - `src/test/controllerTelemetry.test.ts`

## Useful Commands

### Service status

```bash
ssh admin@192.168.68.203 'systemctl status svkrishna.service --no-pager -l'
```

### Live logs

```bash
ssh admin@192.168.68.203 'journalctl -u svkrishna.service -f --no-pager'
```

### Voice status

```bash
curl http://192.168.68.203:8080/api/voice/status
```

### Relay state

```bash
ssh admin@192.168.68.203 'curl -sS http://192.168.68.57/getData'
```

### SignalK depth check

Use `SIGNALK_TOKEN` from `/opt/svkrishna/app/.env`, then query:

```bash
http://127.0.0.1:3300/signalk/v1/api/vessels/self
```

## Latest Confirmed Successful Depth Flow

Before the final telemetry fast-path deploy, a materially improved run completed as:

- wake word detected
- sample recorded
- Whisper transcript: `current depth`
- Rasa-routed transcript: `what is our current depth`
- spoken reply: `Depth is 5.7 meters.`

This run still had a long delay because it was waiting on Ollama inside the harness.

That delay is the reason for the final deterministic telemetry fast-path patch.

## Expected Behavior After Final Patch

For:

- `Krishna what is our current depth`

expected runtime path is now:

- wake word
- record
- Whisper transcript close to `current depth`
- Rasa normalize to `what is our current depth`
- deterministic telemetry fast path
- quick spoken reply
- no Ollama delay for this simple telemetry request

## Latest User Action

- User said `Done` after being asked to provide another depth voice sample.
- That latest post-deploy sample has **not** been inspected yet in this handover file.

## Immediate Next Step For The Next Agent

Inspect the most recent voice run after the final telemetry fast-path deploy:

1. Check service logs:
   - `journalctl -u svkrishna.service --since "<recent time>" --no-pager`
2. Check voice status:
   - `curl http://192.168.68.203:8080/api/voice/status`
3. Confirm whether the latest sample produced:
   - quick transcript
   - quick Rasa normalization
   - quick depth reply
   - no long pause before TTS

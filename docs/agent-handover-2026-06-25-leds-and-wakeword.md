# Agent Handover - 2026-06-25

## Scope

This handover covers the recent work on:

- ReSpeaker XVF3800 USB 4-Mic Array integration
- LED state feedback on the mic array
- wake-word timing improvements for early visual feedback
- deployment and smoke testing on the test Pi
- debugging a stale flashing-green LED state on the test Pi

This does **not** resolve the older relay-device timeout issue, and it does **not** fully resolve the playback-device contention issue on the test Pi.

## Repo and working location

- Repo root: `/home/antony-slack/Documents/SV-Krishna`
- Main docs folder: `/home/antony-slack/Documents/SV-Krishna/docs`

## Test Pi

- Host: `admin@192.168.68.203`
- Hostname observed: `cluster03`
- Service path: `/opt/svkrishna/app`
- Main service: `svkrishna.service`
- Web UI / API: `http://127.0.0.1:8080`

## ReSpeaker hardware state

Detected on the test Pi as:

- USB device: `2886:001a`
- ALSA capture device: `plughw:CARD=Array,DEV=0`

The XVF3800 control utility is installed on the test Pi here:

- `/opt/svkrishna/tools/respeaker-xvf3800/xvf_host`

The app uses:

- `RESPEAKER_LED_ENABLED=true`
- `RESPEAKER_LED_HOST_PATH=/opt/svkrishna/tools/respeaker-xvf3800/xvf_host`

## What was implemented

### 1. LED integration into the stack

Added ReSpeaker LED control into the Node app:

- `src/services/reSpeakerLedService.ts`
- wired into `src/controller.ts`
- config added in `src/config.ts`
- types added in `src/types.ts`

The LED service uses the official `xvf_host` binary and sets `LD_LIBRARY_PATH` to the binary directory.

### 2. Current LED state mapping

The currently deployed LED mapping is:

- `starting` -> rainbow, dim
- `idle` -> DoA mode
- `listening` -> solid green
- `playing` -> solid green
- `transcribing` -> solid amber
- `thinking` -> rainbow
- `speaking` -> fast pulsing green
- `error` -> solid red

Important detail:

- The XVF3800 firmware does not provide a documented literal blink/flash mode.
- `speaking` is implemented using the device `breath` effect at high speed.

### 3. Wake-word timing fix

The original behavior changed LED state too late because the Python detector emitted the wake event only after recording the full post-wake audio window.

This was changed to a two-stage event model:

- `wake-detected` emitted immediately when threshold is crossed
- `wake-captured` emitted after the command audio buffer is ready

Files changed:

- `python/wakeword_detector.py`
- `src/services/wakeWordService.ts`
- `src/controller.ts`

Current behavior:

1. user says wake word
2. detector emits `wake-detected`
3. controller immediately sets `listening`
4. user can keep speaking while LED is already green
5. detector emits `wake-captured`
6. controller starts the Whisper path with the captured WAV
7. LED transitions to `transcribing`, then `thinking`, then `speaking`, then `idle`

## Bug found and fixed during debugging

### Symptom

The user observed that the LEDs were flashing green on the test Pi when they expected idle / DoA behavior.

### Root cause

This was **not** a bad LED map. The service had actually been left in `speaking` state after a wake-triggered flow failed during audio playback.

Observed live state on the test Pi before the fix:

- `LED_EFFECT 1`
- `LED_COLOR 65344`
- `LED_SPEED 3`
- `LED_BRIGHTNESS 160`

Logs showed failures such as:

- `aplay exited with code 1: aplay: main:850: audio open error: Device or resource busy`

The wake-triggered failure path in `handleWakeWordDetected()` logged the error and restarted wake-word listening, but did not restore `idle`, so the LED remained on the last `speaking` profile.

### Fix

Changed the wake-triggered error path to explicitly restore `idle` using `humanizeOperationalError(error)`.

Files changed:

- `src/controller.ts`
- `src/test/controllerTelemetry.test.ts`

## Verification completed

### Local test status

Latest local test run was green:

- `34 tests`
- `34 pass`
- `0 fail`

### Test Pi deployment status

Deployed to the test Pi:

- rebuilt `dist/`
- updated `python/wakeword_detector.py`

Service restart status:

- `svkrishna.service` is `active`

### Current live LED idle state on test Pi

After the stale-state fix and restart, the live idle state was verified as:

- `LED_EFFECT 4`
- `LED_DOA_COLOR 4144 65535`

So the test Pi is currently back in the intended idle / DoA state.

### Stack smoke status

Typed stack smoke passed on the test Pi through:

- `POST http://127.0.0.1:8080/api/command`

Example successful reply observed:

- `Depth is 4.8 meters.`

## Remaining known issues

### 1. Playback device contention on test Pi

This remains unresolved and is the next practical debugging target.

Observed failure:

- `aplay: audio open error: Device or resource busy`

Impact:

- wake-word flows can fail during TTS playback
- before the stale-state fix, this also left the LEDs visually stuck in `speaking`
- after the fix, the LEDs now recover to `idle`, but the underlying audio contention still exists

Likely next steps:

1. identify which process is holding the output device open during failure windows
2. inspect ALSA device usage while `svkrishna.service` is running
3. confirm whether Piper playback and any other audio consumer are racing
4. consider serializing playback access or switching output device config if needed

### 2. Relay device preflight still failing

This issue predates the LED work and remains unresolved.

Observed in preflight:

- `NO relay:device: Relay device timed out for /getData.`

This is unrelated to the LED implementation.

## Files touched in this work

- `src/types.ts`
- `src/config.ts`
- `src/services/reSpeakerLedService.ts`
- `src/services/wakeWordService.ts`
- `src/controller.ts`
- `python/wakeword_detector.py`
- `src/test/config.test.ts`
- `src/test/reSpeakerLedService.test.ts`
- `src/test/wakeWordService.test.ts`
- `src/test/controllerTelemetry.test.ts`

## Useful operational checks for the next agent

### Service status

```bash
ssh admin@192.168.68.203 'systemctl is-active svkrishna.service'
```

### Recent service logs

```bash
ssh admin@192.168.68.203 'journalctl -u svkrishna.service -n 120 --no-pager'
```

### Current LED state

```bash
ssh admin@192.168.68.203 'sudo /opt/svkrishna/tools/respeaker-xvf3800/xvf_host LED_EFFECT'
ssh admin@192.168.68.203 'sudo /opt/svkrishna/tools/respeaker-xvf3800/xvf_host LED_COLOR'
ssh admin@192.168.68.203 'sudo /opt/svkrishna/tools/respeaker-xvf3800/xvf_host LED_SPEED'
ssh admin@192.168.68.203 'sudo /opt/svkrishna/tools/respeaker-xvf3800/xvf_host LED_BRIGHTNESS'
ssh admin@192.168.68.203 'sudo /opt/svkrishna/tools/respeaker-xvf3800/xvf_host LED_DOA_COLOR'
```

### Smoke the typed command path

```bash
ssh admin@192.168.68.203 "curl -s -X POST http://127.0.0.1:8080/api/command -H 'Content-Type: application/json' -d '{\"message\":\"what is our current depth\"}'"
```

## Recommended next task

The next agent should focus on the playback contention on the test Pi, because that is now the main blocker affecting reliability of the end-to-end voice loop.

## 2026-06-26 Addendum - XVF routing, transcribing cue, and Hey Krishna deployment

### What changed after the original handover

The following work was completed after the original 2026-06-25 note:

- validated the ReSpeaker XVF3800 capture routing with a dedicated stereo probe script
- confirmed the best live ASR path is the XVF `right` channel
- changed the target wake phrase from `Okay Krishna` to `Hey Krishna`
- deployed the supplied `Hey Krishna` ONNX model to the Test Pi
- added a short transcribing-stage `Got it` cue using the existing Piper voice actor

### XVF routing outcome

Probe script:

- `src/scripts/xvfRoutingProbe.ts`

The script records the XVF stereo stream, splits `left`, `right`, and `mix`, and sends each channel through Whisper for comparison.

Observed result on the Test Pi:

- `right` transcribed correctly across the tested positions
- `mix` also transcribed correctly
- `left` was sometimes louder but produced one recognition regression (`debt` vs `depth`)

Current routing baseline:

- `AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0`
- `AUDIO_INPUT_CHANNELS=2`
- `AUDIO_INPUT_CHANNEL_SELECT=right`

### Wake-word deployment state

Current wake-word phrase:

- `Hey Krishna`

Current deployed model path on the Test Pi:

- `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`

Current persisted wake-word state:

- `enabled: true`
- `phrase: "Hey Krishna"`
- `running: true`

The detector was verified running with:

- `--model-path /opt/svkrishna/models/openwakeword/hey-krishna.onnx`
- `--phrase Hey Krishna`
- `--input-device plughw:CARD=Array,DEV=0`
- `--input-channels 2`
- `--channel-select right`
- `--threshold 0.5`

### Transcribing cue behavior

The controller now starts a short `Got it` WAV when entering `transcribing` while the LED is solid amber.

Implementation details:

- the cue is generated in advance using the existing Piper voice
- playback is started fire-and-forget
- playback is stopped when transcription completes to avoid colliding with reply playback

Cached file on the Test Pi:

- `/opt/svkrishna/app/local/svkrishna/audio/cues/transcribing-got-it.wav`

Constraint:

- the current USB playback device does not support mixed concurrent playback, so this cue is best-effort rather than true simultaneous mixed audio

### Smoke status

After deploying the `Hey Krishna` model and related code:

- `svkrishna.service` restarted cleanly
- typed smoke via `POST /api/command` returned a valid depth response
- wake-word API status reported the listener running

Current non-fatal note:

- `lastError` may still show the ONNXRuntime CPU warning about `CUDAExecutionProvider` not being available; this is expected and does not stop detection

### Current next step

The next practical task is live spoken validation of `Hey Krishna` on the Test Pi, followed by threshold tuning only if real-world false accepts or false rejects appear.

# Speech Pipeline (ASR + TTS)

This document describes the current speech I/O pipeline in this repository:

- speech-to-text (ASR) using a Whisper HTTP endpoint
- text-to-speech (TTS) using the Piper binary (with optional future HTTP mode)

It is written to match the phase-one goal: a simple, fully offline, Pi-friendly pipeline.

## High-level flow

At runtime the controller follows this loop:

1. Push-to-talk trigger (keyboard)
2. Record audio to a local WAV file
3. Send the WAV file to Whisper (HTTP) for transcription
4. Send the user text (+ optional RAG excerpts) to Ollama for a reply
5. If TTS is enabled:
   - synthesize the reply text to a WAV file using Piper
   - play the WAV file locally

Code entry point:

- `src/controller.ts`

Quick end-to-end sanity check (records -> Whisper -> Ollama -> optional Piper):

- `npm run voice:check`

## Speech-to-text (Whisper)

### What we run

Whisper is accessed via an HTTP wrapper service. The controller sends a recorded WAV file and receives a transcript.

Implementation:

- `src/services/whisperClient.ts`

The whisper endpoint is modeled as a configured service:

- `src/config.ts` (service name `whisper`)

### Environment variables

- `ENABLE_WHISPER_HTTP=true|false`
- `WHISPER_ENDPOINT=http://127.0.0.1:9001`
- `WHISPER_LANGUAGE=en`

### Controller usage

In `src/controller.ts`, after a recording is made:

- `whisper.transcribe(recordingPath)` is called
- if transcription is empty, the controller returns to idle

## Text-to-speech (Piper)

### What we run

Piper is run as a local process. The controller writes a WAV file to disk.

Implementation:

- `src/services/piperClient.ts`

### Environment variables

- `ENABLE_TTS=true|false`
- `PIPER_BINARY_PATH=/path/to/piper`
- `PIPER_MODEL_PATH=/path/to/voice.onnx`

Optional (not currently used in the main flow):

- `ENABLE_PIPER_HTTP=true|false`
- `PIPER_ENDPOINT=http://127.0.0.1:9002`

### Controller usage

In `src/controller.ts`, after the LLM reply is produced:

- if `ENABLE_TTS=true`, call `piper.synthesize(replyText)` -> returns a WAV path
- play that WAV path via the platform audio helper

## Audio capture + playback

Audio is recorded and played on the host (not in Docker).

Relevant configuration:

- `AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0`
- `AUDIO_INPUT_CHANNELS=2`
- `AUDIO_INPUT_CHANNEL_SELECT=right`
- `AUDIO_OUTPUT_DEVICE=plughw:CARD=UACDemoV10_1,DEV=0`
- `AUDIO_RECORD_SECONDS=5`
- `AUDIO_SAMPLE_RATE=16000`
- `AUDIO_WORK_DIR=/opt/svkrishna/audio`

The goal is to keep the hardware boundary simple for the Pi 5.

### Debug playback (recommended off)

If you hear your own spoken command played back faintly before transcription, that is microphone sample playback
used for debugging capture.

- `ENABLE_AUDIO_PLAYBACK_DEBUG=true` replays the recorded sample before sending it to Whisper
- This adds roughly `AUDIO_RECORD_SECONDS` of extra latency per voice run
- For normal operation, keep `ENABLE_AUDIO_PLAYBACK_DEBUG=false`

### Common Raspberry Pi note (USB microphones)

On some Raspberry Pi audio setups, `arecord -D default` may fail even though the device is present.
In that case set `AUDIO_INPUT_DEVICE` to an explicit ALSA device string from `arecord -L`, for example:

- `plughw:CARD=UACDemoV10,DEV=0`

### ReSpeaker XVF3800 note

The ReSpeaker XVF3800 is not a generic mono mic. It exposes a 2-channel processed stream:

- left channel: processed beamformed/post-processed output
- right channel: ASR-oriented auto-selected beam output

For the XVF3800 path, use:

- `AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0`
- `AUDIO_INPUT_CHANNELS=2`
- `AUDIO_INPUT_CHANNEL_SELECT=right`
- `RESPEAKER_XVF_ENABLED=true`
- `RESPEAKER_XVF_HOST_PATH=/opt/svkrishna/tools/respeaker-xvf3800/xvf_host`
- `RESPEAKER_XVF_AUTO_ROUTE=true`

This keeps Whisper and OpenWakeWord on the XVF ASR channel while preserving the device's internal routing.

Routing validation on the test Pi used `src/scripts/xvfRoutingProbe.ts` and showed:

- `right` was the most stable transcription path across the tested positions
- `mix` also worked, but does not improve on the dedicated ASR lane
- `left` was louder but produced a recognition regression on one run

The current baseline is therefore `AUDIO_INPUT_CHANNEL_SELECT=right`.

## Offline testing without a microphone

You can validate the ASR pipeline before hardware arrives by using a pre-recorded audio file.

Two common patterns:

1. Use an existing WAV file (16 kHz mono is preferred) and send it to the Whisper HTTP endpoint directly.
2. Convert an MP3 to a WAV file locally, then send the WAV.

This repo does not currently ship a dedicated CLI for "transcribe this file", but the Whisper endpoint can be tested independently from the controller.

## Current limitations / known gaps

- The project currently assumes the Whisper HTTP wrapper is already running and reachable.
- Piper HTTP mode is not the default path; Piper is invoked as a local binary.
- Latency on Pi is dominated by the LLM (Ollama model size/quantization) and ASR model choice.

## Optional non-LLM intent routing (Rasa)

The controller can optionally normalize Whisper transcripts through a local Rasa server
before relay/telemetry routing.

Environment variables:

- `ENABLE_RASA_INTENT_ROUTER=true|false`
- `RASA_ENDPOINT=http://127.0.0.1:5005`
- `RASA_INTENT_MIN_CONFIDENCE=70` (percentage)

When enabled, high-confidence intents are converted to canonical command text for both:

- spoken pipeline (`runVoiceOnce`)
- typed UI pipeline (`POST /api/chat`)

Execution order is:

1. RASA normalization
2. deterministic command handlers (anchor alarm, telemetry reads, relay)
3. LLM fallback (`chat.ask`) when no deterministic route matches

Troubleshooting:

- If `RASA_ENDPOINT` health checks pass but parse results look outdated, verify there is only one Rasa process bound to `:5005`.
- On Pi systems, stale manually started `rasa run` processes can keep serving an older model while `rasa-test.service` appears healthy.
- Detailed training/runtime evidence and known service pitfalls are documented in:
  - `docs/rasa-signalk-ops-log-2026-05-18.md`

## Wake word setting

The Web UI now exposes a wake-word setting for `"Hey Krishna"` at `http://<pi>:8080/`.

Environment variables:

- `ENABLE_WAKE_WORD=true|false`
- `WAKE_WORD_PHRASE=Hey Krishna`
- `WAKE_WORD_CONFIG_PATH=/opt/svkrishna/config/wake-word.json`
- `WAKE_WORD_PYTHON=python3`
- `WAKE_WORD_MODEL_PATH=/opt/svkrishna/models/openwakeword/hey-krishna.onnx`
- `WAKE_WORD_THRESHOLD=0.5`
- `WAKE_WORD_CHUNK_SIZE=1280`
- `WAKE_WORD_COOLDOWN_MS=8000`

Runtime behavior:

- the setting is persisted and can be enabled/disabled from the Web UI
- when enabled, the controller starts a background `OpenWakeWord` listener and triggers a voice run when it detects the configured wake word model
- detection reads live microphone audio using `arecord` or `sox`, selects the configured capture channel, and feeds 16 kHz mono PCM into `OpenWakeWord`
- the current detector runtime on the test Pi uses the XVF stereo capture with `--input-channels 2 --channel-select right`
- wake-triggered runs now use a guard for filler follow-ups such as `okay`, `yeah`, `hello`, or just `Hey Krishna`
- if the first post-wake transcript looks like filler, the controller reprompts once with `Go ahead.` and records one short retry before routing anything to Ollama
- if the retry is still filler or empty, the controller asks the user to say `Hey Krishna` and the command together

Important note:

- the phrase label is `"Hey Krishna"`, but `OpenWakeWord` still requires a trained wake-word model file at `WAKE_WORD_MODEL_PATH`
- if that model file is missing, the Web UI will show the wake word as enabled but not listening

Current deployed model:

- `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`

Useful live log lines during wake-word testing:

- `Wake word detected: Hey Krishna (...)`
- `Wake-word follow-up looked like filler: ...`
- `Wake-word retry captured command: ...`
- `Wake-word retry still looked like filler: ...`

Recommended live test sequence on `203`:

1. Say `Hey Krishna` and pause. Confirm the app reprompts instead of sending filler to Ollama.
2. After the reprompt, say a clear command such as `what is our current depth`.
3. Repeat with a single-utterance form: `Hey Krishna what is our current depth`.
4. Check `journalctl -u svkrishna.service -f` and verify whether the retry path is helping or whether thresholds/timing still need tuning.

## Transcribing cue

The controller can now play a short acknowledgement cue while Whisper transcription is in progress and the LED is solid amber.

Environment variables:

- `ENABLE_TRANSCRIBING_CUE=true|false`
- `TRANSCRIBING_CUE_TEXT=I'm on it`

Behavior:

- the cue WAV is generated in advance using the configured Piper voice
- playback is started fire-and-forget when the controller enters `transcribing`
- playback is stopped when transcription completes so it does not overlap the assistant response
- this is best-effort because the current USB output device does not support mixed concurrent playback

Current cache path on the test Pi:

- `/opt/svkrishna/app/local/svkrishna/audio/cues/transcribing-i-m-on-it.wav`

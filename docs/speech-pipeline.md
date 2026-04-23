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

- `AUDIO_INPUT_DEVICE=default`
- `AUDIO_OUTPUT_DEVICE=default`
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

# Target Architecture

This document defines the recommended phase-one runtime architecture for the `SV Krishna` offline voice assistant.

The design goal is to stay close to the known-working `whisplay-ai-chatbot` flow while avoiding unnecessary complexity around Raspberry Pi hardware, ARM packaging, and audio device handling.

## Architecture summary

Phase one should be `host-first`, not `container-first`.

That means:

- the main controller application runs natively on the Raspberry Pi
- `ollama` runs natively on the Raspberry Pi
- microphone capture and speaker playback happen on the host
- helper services may be containerized later if they prove awkward to manage natively

This keeps the hardware boundary simple and makes debugging practical on a Pi 5.

## Recommended runtime split

### Host-native components

These should run directly on the Raspberry Pi host in phase one:

- `controller`
- `ollama`
- audio capture
- audio playback
- boot/service management

### Optional containerized components

These may be moved into containers later, but should not block the first integrated build:

- `whisper-http`
- `piper-http`
- `qdrant` if retrieval is added in a later phase

## Why not fully containerize phase one

A full-container approach adds friction in the exact areas that are already risky on Raspberry Pi:

- ARM64 image compatibility
- local audio device access
- model storage and runtime tuning
- terminal input handling
- boot-time service coordination

For a first working build, those costs are not justified.

## Phase-one process model

The intended runtime chain is:

`push-to-talk input -> audio record -> ASR -> LLM -> TTS -> audio playback -> idle`

That becomes the following process model on the Pi.

### 1. Controller process

Suggested responsibility:

- terminal UI
- keyboard push-to-talk input handling
- state machine and session flow
- recording orchestration
- ASR request dispatch
- LLM request dispatch
- TTS request dispatch
- playback orchestration
- logs and health output

Suggested implementation:

- Node.js / TypeScript

Suggested service name:

- `svkrishna-controller`

### 2. Ollama process

Suggested responsibility:

- local LLM runtime
- model management
- inference serving over HTTP

Suggested implementation:

- host-native `ollama serve`

Suggested service name:

- `ollama`

### 3. Whisper process

Suggested responsibility:

- accept recorded audio from the controller
- transcribe speech locally

Suggested implementation:

- start with the same HTTP wrapper pattern used by the upstream repo
- run host-native first unless packaging becomes painful

Suggested service name:

- `svkrishna-whisper`

### 4. Piper process

Suggested responsibility:

- synthesize local speech from text

Suggested implementation:

- start with a direct process invocation or a simple local HTTP wrapper
- keep audio file generation local on disk

Suggested service name:

- `svkrishna-piper`

## Port plan

Use fixed localhost ports so every component is predictable.

Recommended initial ports:

- `11434` for `ollama`
- `9001` for `whisper-http`
- `9002` for `piper-http` if an HTTP wrapper is used

Notes:

- If `piper` is invoked directly as a local binary, no port is required.
- Do not expose these ports outside the Pi in phase one unless remote access is explicitly needed.

## Directory layout on the Pi

Recommended host layout:

```text
/opt/svkrishna/
  app/
  config/
  logs/
  data/
  audio/
  models/
```

Suggested meaning:

- `/opt/svkrishna/app` stores the checked-out project or built runtime files
- `/opt/svkrishna/config` stores `.env` and service configuration
- `/opt/svkrishna/logs` stores controller and helper logs
- `/opt/svkrishna/data` stores runtime state and future knowledge assets
- `/opt/svkrishna/audio` stores temporary recordings and synthesized responses
- `/opt/svkrishna/models` stores any non-Ollama model artifacts you manage directly

Ollama models should remain in the standard Ollama storage location unless there is a clear reason to override it.

## Startup order

Use a simple startup dependency chain.

Recommended order:

1. audio stack becomes available on the host
2. `ollama` starts
3. `whisper` starts if running as a separate service
4. `piper` starts if running as a separate service
5. `svkrishna-controller` starts

Controller startup checks should verify:

- audio input device exists
- audio output device exists
- `ollama` endpoint responds
- `whisper` endpoint responds if enabled
- `piper` endpoint responds if enabled

If a dependency is unavailable, the controller should fail clearly rather than hang silently.

## Service management recommendation

For phase one, use `systemd` on the Pi.

Recommended reasons:

- native boot integration
- straightforward restart policies
- simple log inspection with `journalctl`
- better fit for host-native audio and Ollama processes

Suggested phase-one services:

- `ollama.service`
- `svkrishna-whisper.service`
- `svkrishna-piper.service`
- `svkrishna-controller.service`

Not every one of these needs to exist immediately. The controller and Ollama are the important first pair.

## Docker recommendation

Docker is optional and should be introduced only where it simplifies installation.

### Good Docker use cases

- packaging a Python `whisper-http` wrapper
- packaging a `piper-http` helper
- isolating dependencies that are annoying to install manually

### Poor Docker use cases for phase one

- containerizing the main terminal controller
- putting microphone capture inside the container
- putting speaker playback inside the container
- using Docker as the only deployment mechanism before the host-native flow works

## Suggested future compose layout

If Docker is added later, keep the split narrow:

- host-native `ollama`
- host-native `svkrishna-controller`
- optional container `svkrishna-whisper`
- optional container `svkrishna-piper`

This preserves direct hardware access where it matters and still gives some packaging convenience.

## Failure model

The controller should treat the assistant as unavailable if:

- microphone capture fails
- speaker playback fails
- Ollama is unavailable
- ASR is unavailable
- TTS is unavailable

Each failure should produce:

- a visible terminal error
- a log entry
- a clean return to idle or a clean process exit

Avoid silent retries that hide the real state of the system.

## Logging model

Write logs to the host filesystem and standard output.

Minimum log streams:

- controller lifecycle
- audio device selection
- recording start and stop
- ASR latency
- LLM latency
- TTS latency
- playback start and stop
- fatal dependency failures

## Security and networking

Phase one is offline-first.

That means:

- bind helper services to `127.0.0.1`
- do not expose model services on LAN by default
- do not depend on cloud APIs
- keep configuration local on the Pi

If remote administration is needed later, add it deliberately rather than by accident.

## Recommended implementation sequence

1. build the host-native controller
2. wire in host-native `ollama`
3. prove host audio capture and playback
4. wire in local `whisper`
5. wire in local `piper`
6. only then consider Docker for helper services

## Decision summary

For this project, phase-one architecture should be:

- `host-native controller`
- `host-native ollama`
- `host-native audio`
- `optional helper containers later`

That is the lowest-risk path to a real working offline assistant on Raspberry Pi 5.

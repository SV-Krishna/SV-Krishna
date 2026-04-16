# Reference Review

This document captures the parts of the upstream projects that matter for the initial Raspberry Pi 5 offline build.

## 1. `PiSugar/whisplay-ai-chatbot`

Role in this project:

- main architecture reference
- source of the runtime flow to adapt

Key observations:

- The core app is a TypeScript project with a state-machine driven chat flow.
- The project already supports local `ollama`, local `whisper`, and local `piper` integrations.
- Push-to-talk is implemented as a manual record start on button press and stop on button release.
- Device handling is split from core chat flow, which makes replacement practical.

Reusable areas:

- `src/core/ChatFlow.ts`
- `src/core/chat-flow/states.ts`
- `src/cloud-api/local/*`
- `src/device/audio.ts`
- `.env.template`
- `install_dependencies.sh`
- `build.sh`
- `run_chatbot.sh`

Hardware-coupled areas:

- `src/device/display.ts`
- `python/chatbot-ui.py`
- `python/whisplay.py`
- `src/device/battery.ts`
- Whisplay/PiSugar driver assumptions in startup and audio setup

Adaptation conclusion:

- keep the TypeScript application shape
- replace the display/button layer first
- preserve the local model wiring pattern unless hardware constraints force a change

## 2. `PiSugar/Whisplay`

Role in this project:

- hardware driver reference only

What matters:

- confirms the original project depends on the Whisplay HAT for LCD, button, and audio-related device setup
- shows that the reference build is tightly coupled to I2C, SPI, and I2S peripherals on the HAT

Adaptation conclusion:

- do not import this driver stack into phase one
- replace all LCD/button assumptions with generic terminal input and stdout rendering

## 3. `PiSugar/pisugar-power-manager-rs`

Role in this project:

- optional future reference only

What matters:

- battery service exposes HTTP, WebSocket, TCP, and Unix socket APIs
- useful only if the boat assistant later needs onboard battery telemetry

Adaptation conclusion:

- exclude from phase one
- revisit only if battery monitoring becomes a real project requirement

## 4. `ollama/ollama`

Role in this project:

- local LLM runtime baseline

What matters:

- reference project already assumes a local Ollama endpoint
- best fit for a simple offline CPU-based prototype on Pi 5

Adaptation conclusion:

- keep Ollama as the LLM runtime in phase one
- use the same `.env`-driven endpoint and model selection pattern

## 5. `openai/whisper`

Role in this project:

- local speech-to-text baseline

What matters:

- reference project supports local Whisper through an HTTP wrapper
- the wrapper pattern is more important than the exact implementation detail

Adaptation conclusion:

- preserve the local ASR boundary
- start with the simplest local HTTP-hosted Whisper path that matches the upstream build

## 6. `OHF-Voice/piper1-gpl`

Role in this project:

- local text-to-speech baseline

What matters:

- reference project already has a direct Piper adapter
- output is written to a wav file and then played back locally

Adaptation conclusion:

- keep Piper in phase one if local quality/performance on Pi 5 is acceptable
- document GPL implications carefully if code is copied or adapted

## Recommended phase-one replacement map

- Whisplay button events -> keyboard push-to-talk
- Whisplay LCD status -> terminal renderer
- Whisplay battery icon -> remove
- PiSugar power service -> remove
- WM8960-specific assumptions -> generic ALSA configuration

## Immediate engineering priority

The first implementation pass should preserve the upstream flow shape:

`input trigger -> record -> ASR -> LLM -> TTS -> playback -> idle`

That reduces unknowns and keeps debugging focused on hardware adaptation rather than application redesign.

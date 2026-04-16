# Phase 1 Build Plan

## Objective

Adapt the published `whisplay-ai-chatbot` offline stack into a generic Raspberry Pi 5 build for `SV Krishna` without changing the overall runtime flow.

## Phase-one scope

In scope:

- separate local codebase for the boat assistant
- Raspberry Pi 5 target
- offline `Ollama + Whisper + Piper`
- push-to-talk interaction
- terminal UI
- generic HDMI monitor
- generic microphone and speakers

Out of scope:

- wake word
- camera mode
- battery telemetry
- PiSugar integrations
- Whisplay LCD UI
- custom enclosure work

## Implementation strategy

### 1. Preserve the upstream runtime shape

Keep these ideas from the reference project:

- environment-driven configuration
- TypeScript entrypoint
- state-machine chat flow
- local adapters for ASR, LLM, and TTS
- shell scripts for install, build, and run

### 2. Replace only the hardware boundary

Replace these pieces first:

- `display.ts` with a terminal status module
- button callbacks with keyboard input handlers
- Python socket UI with a native terminal loop
- Whisplay battery integration with no-op behavior

### 3. Keep audio simple

Assume:

- default ALSA/PipeWire input device
- default ALSA/PipeWire output device
- manual tuning only after first boot succeeds

### 4. Keep the upstream tool choices unless blocked

Initial local stack:

- `LLM_SERVER=ollama`
- `ASR_SERVER=whisper-http` or equivalent local whisper mode from upstream
- `TTS_SERVER=piper`

### 5. Delay feature expansion

Do not add:

- boat data integrations
- NMEA integrations
- monitoring dashboards
- custom agents or tools

Phase one is successful if the assistant can:

1. wait in a terminal idle state
2. start recording on push-to-talk input
3. transcribe locally
4. answer using a local model
5. synthesize speech locally
6. play the response back

## Proposed repo shape

Expected near-term layout:

- `README.md`
- `docs/`
- `src/`
- `scripts/`
- `python/` only if the chosen ASR wrapper still needs it
- `.env.template`

## Risks

- Raspberry Pi 5 audio input/output naming may differ from assumptions in the upstream scripts
- CPU-only Whisper and Ollama performance may require smaller models than upstream defaults
- copied GPL code needs clear provenance
- the upstream repo has no meaningful automated test suite, so hardware verification will matter early

## First implementation tasks

1. scaffold the new app structure from the upstream TypeScript layout
2. switch default env values from cloud APIs to local runtimes
3. build a terminal display/input module
4. adapt `run_chatbot.sh` to generic Raspberry Pi audio
5. verify the local audio capture and playback loop before testing LLM integration

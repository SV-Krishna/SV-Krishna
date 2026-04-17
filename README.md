# SV Krishna Offline Voice Assistant

This repository is the codebase for a Raspberry Pi 5 offline voice assistant project intended for use on board `SV Krishna`.

Phase one intentionally follows the published `PiSugar/whisplay-ai-chatbot` build as closely as possible while removing the hardware dependencies on:

- PiSugar Whisplay HAT
- PiSugar battery hardware
- PiSugar enclosure parts

The target hardware for this adaptation is:

- Raspberry Pi 5 with 8GB RAM
- Standard HDMI monitor
- Generic microphone connected through the Pi's default audio input path
- Generic speaker output through the Pi's default audio output path

The interaction model for the first build is deliberately narrow:

- fully offline
- push-to-talk
- terminal UI
- lightweight local web UI
- local PDF drop-folder RAG

## Project goals

The first milestone is not a redesign. It is an adaptation exercise:

1. reproduce the known working local pipeline from the reference project
2. keep `Ollama + Whisper + Piper` as the baseline local stack
3. replace Whisplay-specific display and button handling with generic Raspberry Pi equivalents
4. keep the project easy to run, debug, and iterate on locally

## Reference baseline

Primary reference:

- `https://github.com/PiSugar/whisplay-ai-chatbot`

Supporting references:

- `https://github.com/PiSugar/Whisplay`
- `https://github.com/PiSugar/pisugar-power-manager-rs`
- `https://github.com/ollama/ollama`
- `https://github.com/openai/whisper`
- `https://github.com/OHF-Voice/piper1-gpl`

## What carries over from the reference project

The reference project already has a useful separation between:

- chat flow state machine
- local LLM / ASR / TTS adapters
- audio recording and playback helpers
- environment-based configuration

Those pieces are the baseline for this repo.

## What must change

The original project assumes:

- a Whisplay LCD and button device
- Python display/socket glue for the HAT
- PiSugar battery reporting
- WM8960 / Whisplay audio setup details

This project will replace those assumptions with:

- terminal-based status output
- keyboard-driven push-to-talk flow
- standard Raspberry Pi audio device configuration
- no battery-specific integrations in phase one

## Repo notes

- `docs/reference-review.md` records the architecture review of the upstream repositories
- `docs/phase1-build-plan.md` defines the adaptation boundary for the first implementation pass
- `docs/target-architecture.md` defines the concrete runtime layout for the Raspberry Pi deployment
- `docs/rag-drop-folder.md` explains how to feed local PDFs into the offline RAG store
- `docs/rag-evaluation-report.md` summarizes the RAG extraction/retrieval experiments and the recommended "build machine -> Pi" workflow
- `docs/speech-pipeline.md` describes the speech-to-text (Whisper) and text-to-speech (Piper) pipeline and configuration
- `docs/deploy-local-to-pi.md` describes how we deploy builds from the local machine to the Raspberry Pi
- `docs/web-ui-review.md` records the web UI review and why this repo uses a thin built-in UI
- `docs/profile-readme-archive.md` preserves the original GitHub profile README content from this repository before repurposing it into a codebase

## License note

The upstream `PiSugar/whisplay-ai-chatbot` and `OHF-Voice/piper1-gpl` repositories are GPL-3.0 licensed. If this repository incorporates copied or adapted code from those projects, it should be treated accordingly. During the adaptation work, copied code and original code should be clearly distinguishable in commit history and documentation.

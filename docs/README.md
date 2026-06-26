# Docs Index

This folder holds the working documentation for the `SV Krishna` offline voice assistant project.

The documentation is operational rather than promotional. It is intended to help another engineer or agent:

- understand the current system shape
- deploy safely to the Test Pi
- recover from known faults
- trace why major implementation choices were made

## Current-State Notes

- [agent-handover-2026-06-25-leds-and-wakeword.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-2026-06-25-leds-and-wakeword.md)  
  Current handover for ReSpeaker XVF3800 integration, LED status mapping, XVF routing validation, wake-word timing changes, `Hey Krishna` deployment, transcribing cue behavior, Test Pi deployment status, and remaining issues.

- [agent-handover-2026-06-05.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-2026-06-05.md)  
  Earlier general handover snapshot.

- [agent-handover-rasa-only-2026-06-05.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-rasa-only-2026-06-05.md)  
  Rasa-focused handover.

- [agent-handover-harness-eval-2026-06-05.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-harness-eval-2026-06-05.md)  
  Handover for harness evaluation work.

## Deployment And Operations

- [deploy-local-to-pi.md](/home/antony-slack/Documents/SV-Krishna/docs/deploy-local-to-pi.md)  
  Main local-to-Pi deployment workflow.

- [pi-boot.md](/home/antony-slack/Documents/SV-Krishna/docs/pi-boot.md)  
  Pi boot and startup notes.

- [signalk-upgrade-backup-runbook.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-upgrade-backup-runbook.md)  
  Backup and rollback process before SignalK upgrades.

- [signalk-plugin-workaround-runbook.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-plugin-workaround-runbook.md)  
  Hands-on workaround notes for the current IMU bridge path.

## Voice, Audio, And UI

- [speech-pipeline.md](/home/antony-slack/Documents/SV-Krishna/docs/speech-pipeline.md)  
  Whisper and Piper pipeline notes, including XVF routing, wake-word runtime, and transcribing cue behavior.

- [openwakeword-okay-krishna-plan-2026-06-25.md](/home/antony-slack/Documents/SV-Krishna/docs/openwakeword-okay-krishna-plan-2026-06-25.md)  
  Wake-word training, evaluation, and deployment notes, updated to the current `Hey Krishna` model decision.

- [web-ui-review.md](/home/antony-slack/Documents/SV-Krishna/docs/web-ui-review.md)  
  Why the repo uses a thin built-in UI.

- [relay-control.md](/home/antony-slack/Documents/SV-Krishna/docs/relay-control.md)  
  Relay control behavior and assumptions.

- [imu-bridge.md](/home/antony-slack/Documents/SV-Krishna/docs/imu-bridge.md)  
  IMU bridge behavior and notes.

## Retrieval, LLM, And Evaluation

- [rag-drop-folder.md](/home/antony-slack/Documents/SV-Krishna/docs/rag-drop-folder.md)  
  How local PDFs are ingested for RAG.

- [rag-evaluation-report.md](/home/antony-slack/Documents/SV-Krishna/docs/rag-evaluation-report.md)  
  RAG extraction and retrieval evaluation.

- [marine-llm-toolcalling-performance-report-2026-04-29.md](/home/antony-slack/Documents/SV-Krishna/docs/marine-llm-toolcalling-performance-report-2026-04-29.md)  
  Marine LLM / tool-calling performance report.

- [harness-eval-results-2026-06-05.md](/home/antony-slack/Documents/SV-Krishna/docs/harness-eval-results-2026-06-05.md)  
  Harness evaluation results.

## Architecture And Historical Context

- [reference-review.md](/home/antony-slack/Documents/SV-Krishna/docs/reference-review.md)  
  Review of upstream/reference projects.

- [phase1-build-plan.md](/home/antony-slack/Documents/SV-Krishna/docs/phase1-build-plan.md)  
  Early implementation boundary and build plan.

- [target-architecture.md](/home/antony-slack/Documents/SV-Krishna/docs/target-architecture.md)  
  Runtime layout for Raspberry Pi deployment.

- [profile-readme-archive.md](/home/antony-slack/Documents/SV-Krishna/docs/profile-readme-archive.md)  
  Archived original README/profile content from before repo repurposing.

## SignalK And Platform Ops History

- [rasa-signalk-ops-log-2026-05-18.md](/home/antony-slack/Documents/SV-Krishna/docs/rasa-signalk-ops-log-2026-05-18.md)
- [signalk-usb-instability-ops-log-2026-05-26.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-usb-instability-ops-log-2026-05-26.md)
- [signalk-influx-mcp-poc.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-influx-mcp-poc.md)

These documents capture earlier platform troubleshooting and marine telemetry experiments that still affect present-day runtime assumptions.

## Working Conventions

- [log.md](/home/antony-slack/Documents/SV-Krishna/docs/log.md)  
  Ongoing change diary and execution log for meaningful implementation, deployment, and documentation changes.

## Current Baseline

At the time this index was added:

- the active development repo is this workstation copy
- the main deployment target for testing is the Test Pi at `192.168.68.203`
- the current live handover is `agent-handover-2026-06-25-leds-and-wakeword.md`
- ReSpeaker XVF3800 LED status integration and XVF-aware audio routing are deployed to the Test Pi
- the current wake-word baseline is `Hey Krishna` using `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`
- wake-word detection now triggers visual feedback earlier via a two-stage detector event flow
- a short `Got it` cue now runs during `transcribing`
- AEC remains deferred while the playback device stays unchanged

When adding a new handover, runbook, or design note, update this index so the next agent can find the current path quickly.

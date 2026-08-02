# Docs Index

This folder holds the working documentation for the `SV Krishna` offline voice assistant project.

The documentation is operational rather than promotional. It is intended to help another engineer or agent:

- understand the current system shape
- deploy safely to the Test Pi
- recover from known faults
- trace why major implementation choices were made

## Current-State Notes

- [Waveshare LD2410C presence and display-power handover](/home/antony-slack/Documents/repos/SV-Krishna/docs/agent-handover-2026-08-02-waveshare-presence.md)
  Current deployed firmware, solder-free wiring, sensor commissioning,
  validation, recovery, remaining work, and exact restart prompt.

- [Waveshare LVGL Overview and Anchor Watch handover](/home/antony-slack/Documents/repos/SV-Krishna/docs/agent-handover-2026-07-31-waveshare-lvgl-anchor-watch.md)
  Locked Overview baseline, attached-device state, recovery points, read-only
  Anchor Watch boundary, exact next action, and restart prompt.

- [agent-handover-2026-06-26-signalk-notifications.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-2026-06-26-signalk-notifications.md)
  Current handover for Signal K notification toggle work, Rasa phrasing updates, Pi deployment status, and the issues that blocked fully clean end-to-end API verification.

- [agent-handover-2026-06-25-leds-and-wakeword.md](/home/antony-slack/Documents/SV-Krishna/docs/agent-handover-2026-06-25-leds-and-wakeword.md)
  Prior handover for ReSpeaker XVF3800 integration, LED status mapping, XVF routing validation, wake-word timing changes, `Hey Krishna` deployment, transcribing cue behavior, Test Pi deployment status, and remaining issues.

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

- [Waveshare native LVGL Overview firmware](/home/antony-slack/Documents/repos/SV-Krishna/firmware/waveshare-lvgl-overview/README.md)
  Build, deployment, recovery, hardware baseline, current screen scope,
  LD2410C wiring, and presence-controlled backlight behaviour.

- [Waveshare LD2410C UART2 and backlight deployment evidence](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-ld2410c-uart2-poc-2026-08-02.md)
  Solder-free GPIO44 wiring decision, native-USB correction, presence cycles,
  backlight acceptance, recovery point, and startup-stack validation.

- [Waveshare LVGL Overview deployment evidence](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-overview-deployment-2026-07-30.md)
  Full-flash recovery checkpoint, pinned toolchain and dependencies, exact
  build/flash checks, serial read-back, and remaining physical acceptance.

- [Waveshare LVGL Signal K and SD deployment evidence](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-signalk-sd-deployment-2026-07-30.md)
  Live gauge binding, microSD capacity/write verification, portable endpoint
  configuration, host tests, recovery boundary, and remaining acceptance.

- [Waveshare LVGL clock, wind, and batteries deployment](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-clock-wind-batteries-2026-07-30.md)
  Signal K timestamp clock, reversible synthetic wind/House/Start fixture,
  ESP32 deployment, API read-back, serial acceptance, and rollback.

- [Waveshare LVGL status strength, GPS, and anchor wind deployment](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-status-strength-gps-2026-07-30.md)
  Wi-Fi RSSI tiers, Signal K/GPS freshness states, dynamic apparent wind,
  test-fixture read-back, firmware validation, and remaining visual acceptance.

- [Waveshare LVGL Vessel Stores and head-up plot deployment](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-stores-head-up-2026-07-31.md)
  Standard water/solar/heading paths, icon-only Wi-Fi strength, head-up boat
  and north marker, AIS coordinate rule, device validation, and rollback.

- [Waveshare LVGL AIS traffic and visual polish deployment](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-ais-traffic-polish-2026-07-31.md)
  Moving-target 10/20 NM traffic view, centred boat, curved measured-RSSI icon,
  solar formatting, boot-loop correction, device validation, and boundaries.

- [Waveshare LVGL 50 W solar layout deployment](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/waveshare-lvgl-50w-solar-layout-2026-07-31.md)
  Full solar bar, 50 W scaling, compact Essential Systems card, exact boat
  centring, test-server recovery point, and device validation.

- [kip-anchor-widget-wp3-review-checklist-2026-07-25.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-anchor-widget-wp3-review-checklist-2026-07-25.md)
  Independent WP3 review checklist, exact geometry/status/trail test vectors,
  Host2 assertions and confirmed Angular/Vitest test commands.

- [kip-anchor-widget-implementation-patterns-2026-07-25.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-anchor-widget-implementation-patterns-2026-07-25.md)
  Exact KIP Host2, rendering, configuration, registration and test patterns
  for implementing the offline Krishna Anchor Situation widget.

- [kip-krishna-anchor-situation-widget-design.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-krishna-anchor-situation-widget-design.md)
  Host2 paths, pure geometry/state model, SVG boundary, file plan and
  acceptance tests for the offline anchor widget.

- [KIP Krishna LVGL stock prototype](/home/antony-slack/Documents/repos/SV-Krishna/config/kip/README.md)
  Separate, validation-backed KIP `4.8.0` profile artifact containing the
  read-only Overview, Anchor Watch and Systems composition.

- [KIP WP3 anchor-widget evidence](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/kip-wp3-anchor-widget-2026-07-25.md)
  Implementation, review, tests, visual checks, release artifact checksum and
  remaining gates for `Krishna Anchor Situation`.

- [KIP WP3 boat deployment evidence](/home/antony-slack/Documents/repos/SV-Krishna/execution-logs/kip-wp3-boat-deployment-2026-07-25.md)
  Backup, exact local-package installation, profile activation, live health
  checks and rollback boundary for KIP `4.8.0-krishna.1`.

- [kip-custom-development-and-deployment-baseline.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-custom-development-and-deployment-baseline.md)
  Source layout, KIP `v4.8.0` pin, packaging, staged installation, rollback,
  and transition from the stock-profile prototype to custom Host2 widgets.

- [kip-lvgl-dashboard-implementation-plan.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-lvgl-dashboard-implementation-plan.md)
  Work packages, design boundary, live-data baseline, safety gates, and
  rollback plan for reproducing the LVGL marine dashboard in KIP.

- [kip-lvgl-live-data-contract-2026-07-25.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-lvgl-live-data-contract-2026-07-25.md)
  Live Signal K paths, units, sources, cadence, stale thresholds and
  availability classification for the KIP/LVGL dashboard.

- [kip-anchor-situation-data-contract-2026-07-25.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/kip-anchor-situation-data-contract-2026-07-25.md)
  Installed anchor-alarm paths, read endpoint, inactive/live distinction,
  control boundary, timing rules and blockers for the Anchor Situation widget.

- [lvgl-marine-dashboard-specification.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/lvgl-marine-dashboard-specification.md)
  Detailed `800 x 480` dashboard UX, visual, interaction, data-quality, and
  acceptance specification.

- [Boat_Information_Media_Control_Panel_System_Design_v1.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/Boat_Information_Media_Control_Panel_System_Design_v1.md)
  Working system design for the Waveshare information and media panel.

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

- [quark-a026-wifi-signalk-cutover-2026-07-25.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/quark-a026-wifi-signalk-cutover-2026-07-25.md)
- [signalk-polar-recorder-ops-log-2026-07-04.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-polar-recorder-ops-log-2026-07-04.md)
- [signalk-usb-instability-ops-log-2026-05-26.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-usb-instability-ops-log-2026-05-26.md)
- [rasa-signalk-ops-log-2026-05-18.md](/home/antony-slack/Documents/SV-Krishna/docs/rasa-signalk-ops-log-2026-05-18.md)
- [signalk-influx-mcp-poc.md](/home/antony-slack/Documents/SV-Krishna/docs/signalk-influx-mcp-poc.md)

These documents capture earlier platform troubleshooting and marine telemetry experiments that still affect present-day runtime assumptions.

## Working Conventions

- [todo.md](/home/antony-slack/Documents/repos/SV-Krishna/docs/todo.md)
  Deferred operational work that requires specific boat conditions or
  hardware access.

- [log.md](/home/antony-slack/Documents/SV-Krishna/docs/log.md)
  Ongoing change diary and execution log for meaningful implementation, deployment, and documentation changes.

## Current Baseline

At the time this index was added:

- the active development repo is this workstation copy
- the main deployment target for testing is the Test Pi at `192.168.68.203`
- the current live handover is `agent-handover-2026-06-26-signalk-notifications.md`
- ReSpeaker XVF3800 LED status integration and XVF-aware audio routing are already deployed to the Test Pi
- the current wake-word baseline is `Hey Krishna` using `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`
- wake-word detection now triggers visual feedback earlier via a two-stage detector event flow
- a short `I'm on it` cue now runs during `transcribing`
- Signal K notification toggling and shortened notification phrasing have been added in code and Rasa
- full Pi app API re-verification for the notification toggle remains pending because the expected app listener was not cleanly reachable during the latest session

When adding a new handover, runbook, or design note, update this index so the next agent can find the current path quickly.

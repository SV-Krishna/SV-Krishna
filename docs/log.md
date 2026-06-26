# Project Log

This file is the running project diary for meaningful implementation, deployment, and documentation changes.

Use it to capture:

- intent
- files changed
- whether recovery / rollback action was needed
- whether work was executed or documentation-only
- follow-up actions

Entries should be appended in reverse chronological order unless a different ordering becomes more practical.

---

## 2026-06-26 - XVF routing validated, Hey Krishna deployed, and transcribing cue documented

### Intent

- document the final ReSpeaker XVF3800 routing decision after probe-based validation
- record the move from `Okay Krishna` planning to the deployed `Hey Krishna` wake-word model
- capture the transcribing-stage `I'm on it` cue behavior and its device constraints
- align the handover and operational docs with the Test Pi runtime that has already passed smoke

### Files Added Or Changed

- `README.md`
- `docs/README.md`
- `docs/deploy-local-to-pi.md`
- `docs/pi-boot.md`
- `docs/speech-pipeline.md`
- `docs/openwakeword-okay-krishna-plan-2026-06-25.md`
- `docs/agent-handover-2026-06-25-leds-and-wakeword.md`
- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- No additional Pi recovery work was required for this documentation pass.

### Execution Status

- Documentation-only on the workstation.
- Reflects already executed deployment and smoke results from the Test Pi.

### Evidence

- XVF routing probe established `right` as the preferred ASR channel on the Test Pi
- `Hey Krishna` ONNX model deployed to `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`
- `GET /api/wake-word` on the Test Pi reported `enabled: true`, `phrase: "Hey Krishna"`, `running: true`
- typed smoke on the Test Pi returned a valid depth response after deployment

### Notes

- the output device remains `plughw:CARD=UACDemoV10_1,DEV=0`
- AEC remains deferred because the playback device must remain unchanged for now
- the transcribing cue is intentionally best-effort because the output device does not support mixed concurrent playback

### Follow-Up Actions

- run live spoken validation for `Hey Krishna` across normal and off-axis positions
- tune the wake-word threshold if false accepts or false rejects appear in real use
- revisit AEC only after the playback-device constraint is allowed to change

## 2026-06-25 - ReSpeaker LEDs, wake-word timing, and docs baseline

### Intent

- integrate and verify ReSpeaker XVF3800 LED state feedback on the Test Pi
- improve wake-word feedback timing so the listening indicator appears when the wake word is heard rather than after the full post-wake capture window
- debug the flashing-green Test Pi state reported during validation
- establish missing baseline repo-operating docs (`Agents.md`, `docs/README.md`, `docs/log.md`)

### Files Added Or Changed

- `Agents.md`
- `docs/README.md`
- `docs/log.md`
- `docs/agent-handover-2026-06-25-leds-and-wakeword.md`
- `python/wakeword_detector.py`
- `src/config.ts`
- `src/controller.ts`
- `src/services/reSpeakerLedService.ts`
- `src/services/wakeWordService.ts`
- `src/test/config.test.ts`
- `src/test/controllerTelemetry.test.ts`
- `src/test/reSpeakerLedService.test.ts`
- `src/test/wakeWordService.test.ts`
- `src/types.ts`

### Sandbox Recovery Step

- No sandbox recovery step was required on the workstation.
- On the Test Pi, service restarts were used to return the runtime to a known state after deployment and after LED-state debugging.

### Execution Status

- Executed locally and on the Test Pi.
- Local test suite was run and finished green.
- Updated `dist/` and `python/wakeword_detector.py` were deployed to the Test Pi.
- `svkrishna.service` was restarted and smoke tested.

### Evidence

- local tests green at the end of the session: `34 pass, 0 fail`
- Test Pi service verified `active`
- typed command smoke through `http://127.0.0.1:8080/api/command` returned successful depth responses
- ReSpeaker idle state verified after final restart:
  - `LED_EFFECT 4`
  - `LED_DOA_COLOR 4144 65535`

### Notes

- Wake-word flow now emits two detector events:
  - `wake-detected`
  - `wake-captured`
- This allows the LED `listening` state to appear earlier while the user is still speaking.
- A stale flashing-green LED state was traced to a wake-triggered failure path that left the controller in `speaking`.
- That error path now restores `idle`.

### Follow-Up Actions

- investigate Test Pi playback contention:
  - `aplay: audio open error: Device or resource busy`
- investigate the still-failing relay-device preflight:
  - `Relay device timed out for /getData.`
- continue to keep the current-state handover aligned with the actual Test Pi runtime state

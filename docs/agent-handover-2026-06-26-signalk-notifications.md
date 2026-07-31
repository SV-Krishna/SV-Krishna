# Agent Handover - 2026-06-26

## Scope

This handover covers the Signal K notification toggle work completed on 2026-06-26:

- runtime enable/disable support for the Signal K alert monitor
- Rasa intent support for Signal K notification commands
- shortened phrasing support such as `disable notifications`
- deployment and verification work on the test Pi
- issues that prevented a fully clean end-to-end validation path

## Repo and target

- Repo root: `/home/antony-slack/Documents/SV-Krishna`
- Test Pi: `admin@192.168.68.203`
- Pi hostname observed: `cluster03`
- App path on Pi: `/opt/svkrishna/app`
- Main service: `svkrishna.service`
- Rasa project on Pi: `/home/admin/rasa-test`
- Rasa service: `rasa-test.service`

## What was changed

### Signal K alert monitor runtime toggle

The app no longer relies only on a startup-time env flag for Signal K alert monitoring.

Implemented:

- persisted settings store:
  - `src/services/signalkAlertMonitorStore.ts`
- runtime toggle methods on the monitor:
  - `src/services/signalkAlertMonitor.ts`
- controller wiring for:
  - enable
  - disable
  - status
  - persisted startup restore
- web API routes for monitor status/update:
  - `src/web/webServer.ts`
  - `src/index.ts`

### Voice / NLU command support

Added Signal K notification command handling in:

- `src/controller.ts`

Rasa intent mapping supports:

- `signalk_notifications_on`
- `signalk_notifications_off`
- `signalk_notifications_status`

Shortened phrasing is now accepted in addition to explicit Signal K phrasing. Examples:

- `enable notifications`
- `disable notifications`
- `what is the notification status`

### Tests

Updated tests cover:

- runtime toggle behavior
- Rasa intent mapping
- generic notification phrasing

Files:

- `src/test/controllerTelemetry.test.ts`
- `src/test/config.test.ts`

Local status:

- `npm test` passed

## Pi-side Rasa changes

Updated on the test Pi:

- `/home/admin/rasa-test/data/nlu.yml`
- `/home/admin/rasa-test/domain.yml`

New trained model produced:

- `models/nlu-20260626-113835-boolean-category.tar.gz`

Because `rasa-test.service` is pinned to a fixed model filename, the trained model had to be copied over:

- `models/20260518-132105-paper-equalizer.tar.gz`

## What was verified

### Signal K metadata / alarm behavior

Earlier verification on the test Pi confirmed:

- Signal K is running in Docker
- metadata alarm zones exist in `baseDeltas.json`
- depth notification state was visible through the live Signal K API
- the configured notification message was surfaced by Signal K

Important constraint:

- no dedicated Signal K push/email/web-push notification plugin was present on the test Pi during this work

### Rasa classification on the Pi

Verified against the live Pi Rasa server after retraining:

- `disable notifications` -> `signalk_notifications_off` with confidence `0.9656`
- `enable notifications` -> `signalk_notifications_on` with confidence `0.9920`
- `what is the notification status` -> `signalk_notifications_status` with confidence `0.9794`

## Issues encountered during completion

### 1. Pi deployment sync hit runtime-state permission errors

Initial `rsync --delete` to `/opt/svkrishna/app` produced many permission errors under:

- `/opt/svkrishna/app/local/`

Cause:

- that tree contains runtime-owned data and files not writable by the deploy user

Workaround used:

- reran `rsync` excluding `local/`

Impact:

- code deployment succeeded
- runtime-state folders were left untouched, which was the correct choice

### 2. Rasa was not on the default shell PATH

Running:

- `rasa train nlu`

failed on the Pi with shell error `rasa: command not found`.

Cause:

- Rasa is installed in the project venv, not globally

Workaround used:

- trained with `/home/admin/rasa-test/.venv/bin/rasa`

Impact:

- no functional blocker after the correct venv path was used

### 3. Rasa service is pinned to a stale fixed model filename

`rasa-test.service` currently starts Rasa with:

- `models/20260518-132105-paper-equalizer.tar.gz`

Issue:

- training produces new timestamped model files, but the service does not load them automatically

Workaround used:

- copied the newly trained model over the pinned filename before restarting `rasa-test.service`

Impact:

- retraining works
- deployment is fragile and easy to forget

Recommended follow-up:

- change the service to load the latest intended model path explicitly, or add a controlled promotion step/script

### 4. Expected SV-Krishna API endpoint could not be cleanly re-verified on the Pi

The final goal was to re-check the full live command path through the app API after adding the shorter phrasing.

Expected from earlier work:

- SV-Krishna web/API listener reachable on its own app port

What was found during this session:

- `svkrishna.service` was active
- port `3001` on the Pi was serving an unrelated AnythingLLM HTML app
- requests sent there returned the AnythingLLM page, not the SV-Krishna JSON API
- `127.0.0.1:3000` refused connections

Impact:

- full end-to-end API verification for the new phrasing could not be completed cleanly in this session
- the deployed app code was still built and running
- the Pi Rasa model was verified directly, and local app tests passed

Recommended follow-up:

- confirm the intended SV-Krishna web/API bind port on the Pi
- check whether the built-in web server is disabled, rebound, or masked by another service
- once the correct port is confirmed, re-run:
  - `enable notifications`
  - `disable notifications`
  - `what is the notification status`

### 5. Runtime config path on the Pi is not where it was expected

During earlier verification, the persisted Signal K monitor state file was found at:

- `/opt/svkrishna/app/local/svkrishna/config/signalk-alert-monitor.json`

not under:

- `/opt/svkrishna/config/`

Impact:

- persistence is working
- the runtime storage location is not obvious and may surprise the next deploy/debug pass

Recommended follow-up:

- confirm the intended config root for Pi runtime state
- align docs and env config so persisted files land in one predictable location

## Current best-known status

- local code changes are in place
- local tests passed
- Pi app was rebuilt and `svkrishna.service` restarted successfully
- Pi Rasa NLU was updated, retrained, and restarted successfully
- shortened phrasing is confirmed at the NLU layer
- full Pi app API verification remains incomplete because the expected API listener path/port was not cleanly reachable during this session

## Files touched in this work

- `src/config.ts`
- `src/controller.ts`
- `src/index.ts`
- `src/services/signalkAlertMonitor.ts`
- `src/services/signalkAlertMonitorStore.ts`
- `src/test/config.test.ts`
- `src/test/controllerTelemetry.test.ts`
- `src/types.ts`
- `src/web/webServer.ts`

## Useful follow-up checks

### Local tests

```bash
cd /home/antony-slack/Documents/SV-Krishna
npm test
```

### Pi app service

```bash
ssh admin@192.168.68.203 'sudo systemctl status svkrishna.service --no-pager -l'
```

### Pi Rasa service

```bash
ssh admin@192.168.68.203 'sudo systemctl status rasa-test.service --no-pager -l'
```

### Pi Rasa intent parse checks

```bash
ssh admin@192.168.68.203 "curl -s -X POST http://127.0.0.1:5005/model/parse -H 'Content-Type: application/json' -d '{\"text\":\"disable notifications\"}'"
ssh admin@192.168.68.203 "curl -s -X POST http://127.0.0.1:5005/model/parse -H 'Content-Type: application/json' -d '{\"text\":\"enable notifications\"}'"
ssh admin@192.168.68.203 "curl -s -X POST http://127.0.0.1:5005/model/parse -H 'Content-Type: application/json' -d '{\"text\":\"what is the notification status\"}'"
```

# RASA + SignalK Operations Log (2026-05-18)

This document is a detailed handover log of the work completed across:

- test Pi: `192.168.68.203`
- live Pi: `192.168.195.206`

Focus areas:

- RASA setup, training, deployment, and runtime behavior
- voice pipeline wiring to RASA and web UI behavior
- SignalK anchor alarm behavior on test/live
- test-instance workarounds required for missing marine telemetry fields

## 1) Environment and topology

## 1.1 Test Pi (`203`)

- Host: `admin@192.168.68.203`
- SignalK runtime: Docker container `svkrishna-signalk`
- SignalK node runtime (in container): `v24.14.1`
- Anchor alarm plugin version: `signalk-anchoralarm-plugin@1.17.3`
- RASA service:
  - systemd unit: `/etc/systemd/system/rasa-test.service`
  - working dir: `/home/admin/rasa-test`
  - command:
    - `rasa run --enable-api --cors * --port 5005 --model /home/admin/rasa-test/models/20260517-174056-weighted-sprite.tar.gz`

## 1.2 Live Pi (`206`)

- Host: `pi@192.168.195.206`
- SignalK runtime: `signalk.service` (systemd, non-Docker)
- SignalK node runtime: `v18.17.0`
- Anchor alarm plugin version: `signalk-anchoralarm-plugin@1.17.3`

## 1.3 SignalK, app UI, and RASA ports

- SignalK API/UI: `:3000` on both Pis
- SV-Krishna app Web UI (test Pi `203`): `http://192.168.68.203:8080/` (`WEB_UI_HOST=0.0.0.0`, `WEB_UI_PORT=8080`)
- RASA API (`/model/parse`): `:5005` on test Pi (`203`)

## 2) Voice + UI behavior implemented

- Web UI listen button label changed from `Listen` to `Speak`.
- Voice flow in UI/controller was adjusted to show parsed spoken query earlier in flow (instead of only final canonical text).
- UI behavior updated to show question once parsed and then continue request dispatch.

Related app code paths:

- `src/web/webServer.ts`
- `src/controller.ts`
- `src/services/rasaClient.ts`

## 3) RASA implementation status on test Pi (`203`)

## 3.1 RASA installation and runtime

- RASA runs in dedicated virtualenv:
  - `/home/admin/rasa-test/.venv`
- Verified versions:
  - Rasa `3.6.20`
  - Rasa SDK `3.6.2`
  - Python `3.10.14`
- Service is managed by systemd (`rasa-test.service`) and enabled at boot.

## 3.2 RASA project files in use

- Config: `/home/admin/rasa-test/config.yml`
- Domain: `/home/admin/rasa-test/domain.yml`
- NLU data: `/home/admin/rasa-test/data/nlu.yml`
- Rules: `/home/admin/rasa-test/data/rules.yml`
- Stories: `/home/admin/rasa-test/data/stories.yml`
- Models:
  - `/home/admin/rasa-test/models/20260517-110243-jet-cume.tar.gz`
  - `/home/admin/rasa-test/models/20260517-110431-salty-graph.tar.gz`
  - `/home/admin/rasa-test/models/20260517-173924-basic-sriracha.tar.gz`
  - `/home/admin/rasa-test/models/20260517-174056-weighted-sprite.tar.gz` (active)

## 3.3 Intents currently trained in `nlu.yml`

Marine/command intents present:

- `depth_query`
- `speed_query`
- `wind_speed_query`
- `battery_voltage_query`
- `cabin_temperature_query`
- `relay_on`
- `relay_off`
- `relay_all_on`
- `relay_all_off`
- `relay_status`

Chit-chat/demo intents also present:

- `greet`, `goodbye`, `affirm`, `deny`, `mood_great`, `mood_unhappy`, `bot_challenge`

## 3.4 Validation and warnings

`rasa data validate` was run and completed, with warnings that several marine intents are not referenced in stories/rules. This is expected in this architecture because the app consumes `/model/parse` intent classification directly and does not depend on story-policy action execution for marine commands.

## 3.5 Training/deploy workflow used

Within `/home/admin/rasa-test`:

```bash
source .venv/bin/activate
rasa train
sudo systemctl restart rasa-test.service
```

Runtime checks:

```bash
systemctl status rasa-test.service --no-pager
journalctl -u rasa-test.service -n 120 --no-pager
sudo ss -ltnp | grep 5005
```

## 3.6 Critical operational pitfall (observed)

Observed failure mode:

- manual `rasa run` process and `rasa-test.service` can both contend for `:5005`.
- journal showed repeated `OSError: [Errno 98] address already in use`.

Required guardrail:

- only one RASA process must bind to `:5005`.
- keep systemd service as source of truth and kill stray manual processes.

Check/fix:

```bash
ps -ef | grep "rasa run" | grep -v grep
sudo ss -ltnp | grep 5005
```

## 4) SignalK test-instance data workarounds (`203`)

## 4.1 Problem context

Anchor alarm logic depends on depth and anchor-related navigation fields. Test instance initially lacked some required fields consistently.

## 4.2 Data injection approach used

Two mechanisms are used together:

1. `baseDeltas.json` defaults (`/home/node/.signalk/baseDeltas.json`)
2. Signal K delta simulator plugin config (`/home/node/.signalk/plugin-config-data/simulator.json`)

Verified injected values:

- `navigation.position` set to:
  - `{"longitude": -3.4112001666666667, "latitude": 55.995147}`
- `design.draft.maximum` available (simulated at `1.5`)
- `environment.depth.belowTransducer` provided by simulator

`belowSurface` is still not present on test instance by default.

## 4.3 Fallback depth logic implemented in app

App-side fallback implemented for anchor logic:

- prefer `environment.depth.belowSurface`
- fallback to `environment.depth.belowTransducer + design.draft.maximum`

Code path:

- `src/services/anchorAlarmService.ts`

This directly matches the agreed behavior for missing `belowSurface`.

## 5) Anchor alarm status and fixes

## 5.1 Live Pi (`206`) status

Live logs showed successful endpoint operations (`200`):

- `POST /plugins/anchoralarm/raiseAnchor`
- `POST /plugins/anchoralarm/dropAnchor`
- `POST /plugins/anchoralarm/setRadius`

## 5.2 Test Pi (`203`) issue progression

Main observed failures during troubleshooting:

1. plugin/runtime mismatch across environments (203 was previously on `2.0.1`)
2. `TypeError` paths in plugin code (`configuration`/`state` assumptions)
3. state persistence/config-save failures:
   - `ERR_INVALID_ARG_TYPE` on `fs.writeFileSync` due undefined `statePath`
   - endpoint replies `500 {"message":"can't save config"}`

## 5.3 Fixes applied on `203`

Plugin on `203` was pinned to `1.17.3` and then hardened in-place in:

- `/home/node/.signalk/node_modules/signalk-anchoralarm-plugin/index.js`

Hardenings added:

- safe defaults for `state`/`configuration`
- defensive checks around optional config properties
- robust `statePath` fallback directory initialization
- safer `savePluginOptions` invocation with null-safe configuration

Result after fixes (direct token-auth test):

- `raiseAnchor`: `200 COMPLETED`
- `dropAnchor`: `200 COMPLETED`
- `setRadius`: `200 COMPLETED`

## 5.4 Important persistence note

The anchor alarm hardening on `203` is a local patch inside container-mounted plugin files. Reinstalling/upgrading the plugin may overwrite these edits.

Backups currently present beside plugin file:

- `index.js.bak.*` files in plugin directory

If plugin is updated, re-apply patch set or move to a maintained fork/patch script.

## 6) Current app-side anchor command wiring

Anchor commands are handled by app service endpoints (not only by SignalK UI):

- service: `src/services/anchorAlarmService.ts`
- controller routing: `src/controller.ts`
- web entry path includes anchor command handling in `src/web/webServer.ts`

Behavior implemented:

- switch on anchor alarm:
  - can use provided rode length
  - auto-computes radius using geometry when needed
  - sets anchor position/radius through plugin endpoints
- switch off anchor alarm:
  - calls plugin raise endpoint

## 7) Commands used for direct verification

## 7.1 SignalK anchor endpoints (`203`) with token auth

```bash
TOK=$(curl -sS -H "Content-Type: application/json" \
  -d '{"username":"Codex","password":"ChangeThis"}' \
  http://127.0.0.1:3000/signalk/v1/auth/login | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -sS -H "Authorization: Bearer $TOK" -X POST \
  http://127.0.0.1:3000/plugins/anchoralarm/raiseAnchor

curl -sS -H "Authorization: Bearer $TOK" -X POST \
  http://127.0.0.1:3000/plugins/anchoralarm/dropAnchor

curl -sS -H "Authorization: Bearer $TOK" -X POST -d "radius=25" \
  http://127.0.0.1:3000/plugins/anchoralarm/setRadius
```

## 7.2 RASA runtime checks (`203`)

## 8) Telemetry verification addendum (2026-05-19, live Pi `206`)

Follow-up checks were run on `pi@192.168.195.206` to verify AIS, NMEA2000 PGN ingress, and NMEA0183 `nmeaout`.

### 8.1 AIS reception status

- SignalK service was active during checks.
- AIS targets were present in `/signalk/v1/api/vessels/` with `nmeain.AI` (`VDM`) updates.
- A live sample showed 13 AIS targets at that point in time.

### 8.2 NMEA2000 PGN ingress status

- `/signalk/v1/api/sources` confirmed source `nmea2000` with active PGNs.
- Observed PGNs included:
  - `60928`
  - `126993`
  - `126996`
  - `126998`
  - `128259`
  - `128267`
- Key interpretation:
  - Earlier snapshots can look stale.
  - Confirm live status by checking whether PGN timestamps are advancing at query time.

### 8.3 `nmeaout` sentence routing and verification

Configured output path on live Pi:

- `settings.json` defines output provider `id: nmeaout` on `/dev/ttyOP_nmeaout`, event `sentenceEvent: "nmeaout"`.
- `nmea0183-to-nmea0183` routes `nmea0183out -> nmeaout` and filters sentence types.

Configured allowed sentence types in that route included:

- `APA`, `APB`, `BEC`, `BOD`, `BWC`, `BWR`, `MWD`, `MWV`, `RMB`, `VHW`, `VWR`, `VWT`, `WCV`, `WDC`, `WDR`.

Verification result:

- Direct serial tap from the same host (`timeout 20s cat /dev/ttyOP_nmeaout`) returned zero lines.
- This was treated as a TX-only readback limitation, not proof of no output.
- SignalK raw log (`~/.signalk/skserver-raw_2026-05-19T20.log`) showed emitted outbound lines such as:
  - `$WIMWV,...`

Operational note:

- For this hardware wiring, trust source timestamps + raw SignalK NMEA output logs for outbound confirmation.
- Do not rely on same-port local readback unless a loopback path is intentionally provided.

```bash
systemctl status rasa-test.service --no-pager
journalctl -u rasa-test.service -n 120 --no-pager
sudo ss -ltnp | grep 5005
```

## 8) Known limitations / follow-up items

1. Anchor alarm plugin hardening on `203` is local and should be formalized (fork/patch automation) to survive plugin reinstall.
2. `belowSurface` is still absent on test instance; current behavior relies on app fallback (`belowTransducer + design.draft.maximum`).
3. Authentication scopes differ between SSH and SignalK users; operational docs must keep both credential contexts separate.
4. RASA intent names and app-side mappings must stay aligned whenever new labels are added, or deterministic telemetry routing will miss and fall back to LLM.

## 9) IMU plugin workaround runbook

For the dedicated SignalK IMU plugin workaround (direct REST write limitations, plugin discovery requirements, auth/token flow, calibration and publish verification, and 2 Hz live sender requirements), use:

- `docs/signalk-plugin-workaround-runbook.md`

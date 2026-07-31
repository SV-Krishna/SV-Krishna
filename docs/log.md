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

## 2026-07-31 - Waveshare LVGL work parked for Anchor Watch handover

- Added `docs/agent-handover-2026-07-31-waveshare-lvgl-anchor-watch.md` with
  the accepted Overview state, attached-device and Signal K details, recovery
  checksums, dirty-worktree boundary, Anchor Watch data/safety contract, next
  action and paste-ready restart prompt.
- Updated `docs/README.md` and this project diary.
- No application or firmware code changed in the parking step. No commit,
  push, device flash, Signal K mutation, or boat environment change occurred.
- The Overview remains deployed and design-locked. Anchor Watch implementation
  has not started and is intentionally parked at telemetry-model extension.
- GitHub Issues are disabled for this repository, so created central Project
  draft `Build native LVGL Anchor Watch screen` instead, item ID
  `PVTI_lAHOCK3W884BereBzg0zXeI`. Read-back verified `Parked`, Date Parked
  `2026-07-31`, Medium priority, Development type, the repository/path/branch,
  next action and waiting-on text. Resume Date remains unset.

## 2026-07-31 - Overview design locked; Anchor Watch development opened

- Recorded the accepted physical Overview as the locked visual baseline.
- Future Anchor Watch work will use a separate LVGL screen and preserve the
  accepted Overview layout.
- Selected a read-only first Anchor Watch milestone from the existing design
  and Signal K contract. Consequential anchor/radius/alarm writes remain out
  of scope pending authenticated contracts, confirmation UX and controlled
  physical testing.
- Changed documentation only in this step; no firmware, Signal K, device, or
  boat environment was changed.

## 2026-07-31 - AIS range labels moved inside rings

- Centred the 10 NM and 20 NM captions horizontally and moved each farther
  inside its corresponding circle.
- Changed only the ESP32 LVGL firmware and existing execution record; no
  Signal K or boat configuration changed.
- ESP-IDF build, flash/hash verification, SD/Wi-Fi/Signal K readiness and
  post-readiness stability passed.
- Status: deployed and serial-validated; visual acceptance remains with the
  physical screen inspection.

## 2026-07-31 - Fixed-radius North marker and visible 20 NM label deployed

### Intent

- make the North indicator follow a constant radius just beyond the outer AIS
  range band
- ensure the 20 NM range label remains visible

### Files Added Or Changed

- `firmware/waveshare-lvgl-overview/`
- `execution-logs/waveshare-lvgl-50w-solar-layout-2026-07-31.md`
- `docs/log.md`

### Execution And Validation

- Reparented North to the Anchor Watch panel and positioned the rendered glyph
  centre on a fixed 125 px radius from the plot centre.
- Moved the 20 NM label inward and increased its contrast.
- ESP-IDF build and flash/hash verification passed.
- Serial confirmed SD mount, Wi-Fi, Signal K subscription, and complete
  dashboard telemetry readiness; no panic or reset followed.
- No shared Signal K, simulator, or boat configuration changed. The existing
  full-flash recovery image remains applicable.
- Status: deployed and serial-validated; final pixel placement awaits physical
  screen inspection.

## 2026-07-31 - Full 50 W solar gauge and exact boat centring deployed

### Intent

- display a complete solar bar scaled to the vessel's 50 W maximum input
- reclaim space by removing the redundant Essential Systems caption
- centre the boat from the plot's exact geometric centre

### Files Added Or Changed

- `config/signalk/lvgl-test-simulator.json`
- `config/signalk/README.md`
- `firmware/waveshare-lvgl-overview/`
- `execution-logs/waveshare-lvgl-50w-solar-layout-2026-07-31.md`
- `docs/README.md`
- `docs/log.md`

### Configuration, Recovery, And Environments

- Backed up the running workstation simulator to
  `backups/signalk-test/2026-07-31-pre-50w-solar/simulator.json`; SHA-256
  `729b2bf985471a2dbd01132ece06ff07f2c48d7424f6af2817161702dcfd85c7`.
- Changed synthetic solar from 80–420 W to 8–48 W and restarted only the
  workstation Signal K test container.
- No boat environment was changed. The existing ESP32 full-flash recovery
  image remains applicable.

### Execution And Validation

- Added the 0–50 W solar bar, increased Vessel Stores height, compacted
  Essential Systems, and centred the explicitly sized boat object.
- Both host tests passed with warnings treated as errors.
- Signal K API read-back returned 46.2 W within the corrected range.
- ESP-IDF build and flash/hash verification passed.
- Device serial confirmed SD, Wi-Fi, Signal K, and complete telemetry readiness;
  no panic or reset occurred during the post-readiness observation.
- Status: deployed and serial-validated; exact pixel placement awaits user or
  photographic inspection.

## 2026-07-31 - LVGL AIS traffic view and visual polish deployed

### Intent

- apply the agreed physical-UI review changes
- retain a useful moving-AIS traffic view when Anchor Watch is inactive
- centre the own-vessel symbol and confirm the Wi-Fi indication is measured

### Files Added Or Changed

- `firmware/waveshare-lvgl-overview/`
- `docs/lvgl-marine-dashboard-specification.md`
- `execution-logs/waveshare-lvgl-ais-traffic-polish-2026-07-31.md`
- `docs/README.md`
- `docs/log.md`

### Configuration, Recovery, And Environments

- Used the existing checksum-recorded full-flash backup as the ESP32 recovery
  point; no new backup was required because the same controlled device and
  recovery image remained in scope.
- No Signal K fixture, boat Pi, or boat environment was changed.
- Reflashed the attached ESP32 after an intermediate test image entered a boot
  loop due to task stack exhaustion.

### Execution And Validation

- Added self/target Signal K context separation and filtered, head-up moving
  AIS rendering with 10/20 NM inactive bands.
- Added the centred boat, curved measured-RSSI Wi-Fi icon, integer solar output,
  and disabled the development FPS/CPU overlay.
- Both host test executables passed with warnings treated as errors.
- ESP-IDF build and flash/hash verification passed.
- Device serial confirmed 30,436 MiB SD mount/write, Wi-Fi at
  `192.168.68.64`, measured RSSI `-31 dBm`, Signal K connection, and complete
  dashboard telemetry readiness.
- No panic or reset occurred during the post-readiness observation.
- Status: deployed and serial-validated. Live AIS target rendering remains
  host-tested rather than end-to-end accepted because the test feed has no AIS
  target contexts; final camera/pixel acceptance was not run.

## 2026-07-31 - LVGL Vessel Stores and head-up plot deployed

### Intent

- replace the Wi-Fi `4/4` suffix with strength shown by the icon bars
- bind standard Signal K fresh-water and solar paths
- label apparent wind clearly and establish a head-up boat/compass plot

### Files Added Or Changed

- `config/signalk/lvgl-test-simulator.json`
- `config/signalk/README.md`
- `firmware/waveshare-lvgl-overview/`
- `docs/lvgl-marine-dashboard-specification.md`
- `execution-logs/waveshare-lvgl-stores-head-up-2026-07-31.md`
- `docs/README.md`
- `docs/log.md`

### Configuration And Environments

- Confirmed the water, solar, and true-heading contracts from the installed
  Signal K schema.
- Extended only the reversible workstation test simulator fixture.
- No boat Pi or boat Signal K environment was changed.

### Execution And Validation

- API read-back of heading, water, and solar: pass.
- Host telemetry/delta tests: pass.
- ESP-IDF build, device flash, and hash verification: pass.
- Device serial confirmed SD, Wi-Fi, WebSocket, stores, GPS, and heading.
- No panic or reset loop was observed.
- Status: deployed and serial-validated on the attached test device; physical
  camera/pixel acceptance not run.

### Design Boundary

- The plot is head-up: the boat remains upright and north rotates relative to
  true heading.
- AIS targets are not yet rendered. When added, their bearings must be
  transformed into the same relative head-up coordinate frame.

## 2026-07-30 - LVGL Wi-Fi, Signal K, GPS status and anchor wind deployed

### Intent

- make the top-row network indicators reflect useful strength/freshness state
- add a GPS live/stale/unavailable status in place of the test title
- replace the fixed Anchor Watch wind value with apparent wind telemetry

### Files Added Or Changed

- `config/signalk/lvgl-test-simulator.json`
- `config/signalk/README.md`
- `firmware/waveshare-lvgl-overview/`
- `execution-logs/waveshare-lvgl-status-strength-gps-2026-07-30.md`
- `docs/README.md`
- `docs/log.md`

### Configuration And Environments

- Extended the reversible workstation test simulator fixture with synthetic
  GNSS method quality.
- The existing checksum-recorded pre-synthetic simulator backup remains the
  recovery point.
- No boat Pi or boat Signal K environment was changed.

### Execution And Validation

- Signal K API GNSS read-back: pass.
- Telemetry state and Signal K delta/GPS tests: pass.
- ESP-IDF build, flash, and hash verification: pass.
- Device serial confirmed SD, Wi-Fi, WebSocket, clock, wind, both batteries,
  GPS, and a measured Wi-Fi RSSI of -17 dBm.
- No panic or reset loop was observed.
- Status: deployed and serial-validated on the attached test device; physical
  pixel/layout acceptance was not independently camera-tested.

## 2026-07-30 - Signal K clock, wind and dual batteries deployed to LVGL

### Intent

- drive the LVGL time field from Signal K server-stamped updates
- add synthetic wind, House battery, and Start battery values to the
  workstation test instance
- deploy and verify both battery rows and the wind gauge on the attached ESP32

### Files Added Or Changed

- `config/signalk/lvgl-test-simulator.json`
- `config/signalk/README.md`
- `firmware/waveshare-lvgl-overview/`
- `execution-logs/waveshare-lvgl-clock-wind-batteries-2026-07-30.md`
- `docs/README.md`
- `docs/log.md`

### Configuration And Environments

- Backed up and checksum-recorded the existing test Signal K simulator
  configuration before changing it.
- Installed a synthetic-only fixture and restarted the workstation
  `svkrishna-signalk` container.
- No boat Pi or boat Signal K configuration was changed.
- The ESP32 timezone defaults to Europe/London and is configurable through
  ESP-IDF Kconfig.

### Execution And Validation

- Signal K API read-back confirmed synthetic true/apparent wind and standard
  `house` and `start` battery paths.
- Host telemetry and Signal K timestamp/delta tests passed.
- ESP-IDF build, device flash, and flash hash verification passed.
- Serial read-back confirmed SD mount/write, Wi-Fi, WebSocket subscription,
  first delta, and complete clock/wind/House/Start readiness.
- No panic or reset loop was observed.
- Status: deployed to the attached test ESP32 and test Signal K instance; not
  deployed to or accepted on the boat.

### Remaining Risk

- Values are synthetic and must not be mistaken for boat sensor values.
- Physical display values were observed by deployment context but not asserted
  through an independent camera/image test.
- WebSocket fragmentation and long reconnect/soak testing remain outstanding.

## 2026-07-30 - Native LVGL telemetry and microSD deployed

### Intent

- bind the native Waveshare LVGL gauges to available Signal K telemetry
- keep the endpoint portable from the workstation test instance to the boat Pi
- use the attached 32 GB microSD for non-secret runtime configuration and a
  boot-status record

### Files Added Or Changed

- `.gitignore`
- `firmware/waveshare-lvgl-overview/`
- `execution-logs/waveshare-lvgl-signalk-sd-deployment-2026-07-30.md`
- `docs/README.md`
- `docs/log.md`

### Configuration And Environments

- The ignored local ESP-IDF configuration contains the Wi-Fi credential and
  fallback Signal K endpoint; no secret was added to tracked files or logs.
- The ESP32 now reads `/krishna/config.json` from microSD for a non-secret
  Signal K host/port override and writes `/krishna/boot.txt`.
- The deployed device used the workstation test Signal K at
  `192.168.68.134:3300`. The reachable host `192.168.68.203` had no active
  Signal K endpoint. The boat Pi was not changed.

### Recovery And Execution Status

- Used the existing full 16 MB pre-LVGL recovery capture and captured an
  immediate pre-telemetry boot/partition/application rollback boundary.
- Built and flashed the exact ESP-IDF image to the attached device with hash
  verification.
- Status: deployed and boot-validated; not end-to-end accepted for boat use.

### Validation

- host telemetry state/quality tests: pass
- host Signal K delta valid/null/unknown/missing/malformed tests: pass
- ESP-IDF build and flash verification: pass
- serial read-back: 30,436 MiB SD mount, boot-status write, Wi-Fi connection,
  Signal K subscription, and first delta application: pass
- no panic or reset loop observed in the validation window
- long soak, reconnect, fragmented WebSocket, SD removal/power-loss, live wind,
  live battery, and active-anchor acceptance: not run

### Follow-Up Actions

- place a boat-specific `config.json` on the SD card and validate the override
  against a controlled Pi test endpoint
- add fragmented WebSocket payload assembly and reconnect/soak coverage
- add bounded SD telemetry caching and offline assets only after retention and
  power-loss behaviour are specified

## 2026-07-30 - Native Waveshare LVGL Overview built and deployed

### Intent

- move beyond the HTML/KIP proof of concept and begin the native ESP32-S3
  implementation from the approved LVGL marine-dashboard specification
- build and deploy the first static Overview screen to the attached Waveshare
  ESP32-S3-Touch-LCD-7 without implying that representative values are live

### Files Added Or Changed

- `.gitignore`
- `firmware/waveshare-lvgl-overview/`
- `docs/README.md`
- `docs/log.md`
- `execution-logs/waveshare-lvgl-overview-deployment-2026-07-30.md`
- local, ignored full-flash recovery capture under
  `backups/waveshare-esp32-s3-touch-lcd-7/2026-07-30-pre-lvgl-overview/`

### Configuration, Integrations, And Environments

- installed a local, ignored ESP-IDF `v5.5.5` toolchain
- pinned LVGL `8.4.0`, LCD touch `1.1.2`, and GT911 `1.1.1~1` through the
  ESP-IDF component lock
- deployed to the locally attached ESP32-S3 at the stable USB serial path
  `usb-1a86_USB_Single_Serial_5958027113-if00`
- did not change Signal K, KIP, Raspberry Pi services, Wi-Fi configuration,
  credentials, relay mappings, or any live vessel integration

### Recovery Preparation

- `esptool flash-id` confirmed a 16 MB flash device before deployment.
- Captured the complete `0x00000000` to `0x01000000` flash range before the
  first write.
- Local backup SHA-256:
  `dc5bb9e7b4eb30ee9a920aeeac05b6b541bfc458ab7d1ec7eef369a7676d6ed1`.
- The backup is ignored because a whole-device image may contain private
  runtime configuration. The exact recovery command is in the firmware README
  and execution evidence.

### Execution And Verification

- Status: deployed, with physical visual/touch acceptance still pending.
- Built the native LVGL application with ESP-IDF `v5.5.5`.
- The UI uses native LVGL objects at `800 x 480`, with no HTML or full-screen
  bitmap. It includes the top status bar, four metric cards, central anchor
  situation, power/stores/systems summaries, and persistent three-item
  navigation.
- Representative values are marked `STATIC DESIGN DATA`; there is no Wi-Fi or
  Signal K data path in this milestone.
- `idf.py build` passed. The application occupied approximately 607 KiB and
  retained 41% of the one-megabyte factory app partition.
- `idf.py flash` completed and esptool verified every written image hash.
- Serial read-back confirmed ESP-IDF boot, 16 MB flash, 8 MB PSRAM and memory
  test, RGB panel initialization, LVGL task creation, GT911 ID `0x39,0x31,0x31`
  and config version `88`, and return from `app_main()` without reset or panic.
- The GT911 component emitted an initial address-probe warning before
  successfully identifying the controller. This remains a known upstream-port
  warning to observe during touch acceptance.
- The workstation cameras did not provide a usable view of the display, so
  actual panel appearance and touch response were not falsely recorded as
  observed.
- No separate LVGL host unit-test harness exists in this repository. Adding a
  simulator/test framework was out of scope for this first hardware milestone;
  compile-time API checking and device startup validation were performed, but
  rendering and interaction regression tests remain a risk.

### Follow-Up Actions

- physically inspect the Overview for clipping, density, contrast, and font
  rendering and adjust the layout against the real panel
- tap the future Anchor Watch and Systems controls while monitoring serial and
  visible feedback to accept GT911 interaction end to end
- run a prolonged render/idle soak and reduced-brightness review
- add a normalised state model and Signal K connection without moving transport
  parsing into LVGL widgets

## 2026-07-29 - Waveshare CAD documentation governance aligned

### Intent

- align the Waveshare panel CAD workspace with the shared documentation,
  validation, recovery, and parked-work governance baseline
- preserve its existing evidence classifications, physical-print safeguards,
  and focused Git completion requirement

### Files Added Or Changed

- `cad/waveshare-panel/AGENTS.md`
- `docs/log.md`

### Recovery Preparation

- Documentation-only change; the pre-change instructions remain available in
  Git history.
- No CAD, profile, slicer, printer, generated model, or live system state was
  changed.

### Execution Status

- Status: documented.
- Added a mandatory concise project-log entry for meaningful CAD, profile,
  slicing, prototype, and related operational changes.
- Added explicit rendered, slice-verified, printed, fit-observed, and
  operationally-accepted completion stages.
- Added profile recovery/read-back rules, documentation close-out checks, and
  required use of `park-work` when the user intentionally pauses the work.
- No render, slice, physical print, fit check, or operational test was required
  for this documentation-only governance change.

### Follow-Up Actions

- apply the agreed governance baseline to the remaining workspaces one at a
  time

## 2026-07-04 - Live Pi IMU zero calibration applied at dock

### Intent

- zero the live IMU bridge roll and pitch outputs against the boat's present dockside attitude
- bring `navigation.attitude` closer to an approximate even-keel baseline

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.

### Execution Status

- Executed against the live Pi `206` over SSH.
- Read current IMU bridge calibration and latest raw input from `http://127.0.0.1:8091/`.
- Applied `POST /calibration/zero` using the current live `rollDeg`, `pitchDeg`, and `headingDeg`, with `targetHeadingDeg` set to the current heading so yaw alignment was preserved.
- Re-checked live `navigation.attitude` values from SignalK after calibration.

### Evidence

- pre-calibration bridge offsets:
  - `rollOffsetDeg = -171.067`
  - `pitchOffsetDeg = -2.809`
  - `headingOffsetDeg = 0`
- pre-calibration live attitude was approximately:
  - roll `+2.5°`
  - pitch `+2.7°`
- post-calibration bridge offsets:
  - `rollOffsetDeg = -172.4`
  - `pitchOffsetDeg = -6.809`
  - `headingOffsetDeg = 0`
- post-calibration live attitude samples settled to approximately:
  - roll between `-0.4°` and `+0.5°`
  - pitch between `-2.6°` and `-0.8°`

### Notes

- the IMU bridge is compensating a wrapped raw roll orientation rather than a small-angle raw sensor frame, so the stored roll offset is expected to look large in degrees
- dockside zeroing materially improved the live roll baseline and reduced the pitch bias, though pitch still shows a small residual negative offset

### Follow-Up Actions

- when conditions are very calm and the boat is known to be sitting in the desired reference attitude, consider a second fine zero if the residual pitch bias remains operationally annoying
- if another agent investigates attitude calibration later, inspect both the bridge calibration and the physical mounting assumptions before changing offsets again

## 2026-07-04 - SignalK polar recorder dockside investigation written up

### Intent

- investigate why polar recording was not updating on live Pi `206` while docked
- determine whether the blocker was recorder logic, source configuration, or UI behavior
- restore the live Pi to a non-test state after verification
- capture the findings in repo documentation

### Files Added Or Changed

- `docs/log.md`
- `docs/README.md`
- `docs/signalk-polar-recorder-ops-log-2026-07-04.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.

### Execution Status

- Executed against the live Pi `206` over SSH.
- Inspected SignalK plugin configuration and live vessel paths.
- Temporarily enabled a simulator-based STW/SOG harness to prove recorder behavior while stationary.
- Corrected the live `polar-recorder` frontend timing bug in the installed plugin assets on the Pi.
- Rolled back the simulator harness and restored live plugin sources after verification.
- Added repo documentation for the investigation and restored-state summary.

### Evidence

- live plugin set on Pi `206` included `polar-recorder 1.1.2` and `signalk-polar-performance-plugin 0.0.59`
- while docked, `navigation.speedThroughWater` from `nmea2000.32` was `0`, and `polar-recorder` logs repeatedly reported `Invalid data due to: STW too low`
- with temporary simulated STW, `/signalk/v1/api/polar-recorder/live-data` returned valid values and `polar-test-206.json` resumed updating
- the `polar-recorder` UI bug was traced to `public/scripts/main.js` not recomputing `Δ STW` after polar data loaded
- post-rollback live state confirmed:
  - `simulator` disabled
  - `navigation.speedThroughWater` sourced from `nmea2000.32`
  - `navigation.speedOverGround` sourced from `nmeain.GP`
  - `environment.wind.speedApparent` sourced from `windin.WI`
  - `environment.wind.speedTrue` sourced from `derived-data`

### Notes

- the recorder failure was not a general plugin failure; it was an expected dockside consequence of zero live STW
- the frontend timing issue on the `polar-recorder` page was a separate real bug and was fixed on the live Pi
- wind ultimately enters through the dedicated `windin` NMEA0183 connection, then `derived-data` produces the true-wind values consumed by the polar tooling

### Follow-Up Actions

- during the next sailing session, verify that real STW from `nmea2000.32` clears the recorder threshold and records without simulator assistance
- if the `polar-recorder` package is updated or reinstalled on the Pi, re-apply or upstream the local frontend fix
- if needed later, consider documenting the exact one-line frontend patch separately as a small runbook or upstream patch note

## 2026-07-04 - Live Pi crash review and USB watchdog follow-up captured

### Intent

- review the latest live Pi `206` crash / SSH-loss event while on the boat
- capture the current evidence in repo docs and preserve follow-up work on the watchdog script

### Files Added Or Changed

- `docs/log.md`
- `docs/signalk-usb-instability-ops-log-2026-05-26.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.

### Execution Status

- Executed against the live Pi `206` over SSH.
- Reviewed boot history, kernel logs, SignalK logs, watchdog behavior, USB topology, storage health, and persistent crash-trace locations.
- Documentation was updated; no Pi-side file changes were made in this session.

### Evidence

- `last -x` showed repeated crash-style terminations rather than orderly shutdowns.
- `journalctl` did not show a matching kernel panic, OOM, or root-filesystem I/O failure immediately before the latest abrupt stop.
- `vcgencmd get_throttled` returned `0x0` at inspection time.
- `/sys/fs/pstore` was empty.
- active serial topology was confirmed as:
  - `ttyOP_windin -> ttyUSB0` Prolific `067b:23a3`
  - `ttyOP_nmeaout -> ttyUSB1` FTDI `0403:6001`
  - `ttyOP_nmea2000 -> ttyUSB2` CH341 `1a86:7523`
  - `ttyOP_nmeain -> ttyACM0` STM32 `0483:5740`, serial `00000000003A`

### Notes

- Current evidence still favors a host-level USB/power instability over a normal SignalK software crash.
- The live USB topology remains dependent on a cascaded hub chain, which matches the earlier operational risk already documented for Pi `206`.
- During inspection, `/home/pi/svkrishna/bin/usb_serial_watchdog.sh` was found to have a state-file bug: it writes `last_action=<epoch>n` and its `awk` parse of the saved value is malformed.

### Follow-Up Actions

- fix the watchdog state-file read/write logic before relying on cooldown timing during future serial-loss events
- when back at a suitable maintenance point, deploy the watchdog fix to the live Pi and verify it under a controlled missing-device simulation
- continue prioritising physical USB/hub/cable simplification on the boat, since current crash evidence still aligns with low-level transport instability
- if a future crash reproduces while access is available, run `journalctl -k -f` live and correlate any USB reset/disconnect events with loss of SignalK providers and SSH
- when physical access to the boat router is available, install OpenWrt on the `TP-Link TL-MR6400 v5.3` using the supported TFTP recovery path rather than the OEM web UI, then restore boat LAN settings and add a stable DHCP reservation for the relay

## 2026-07-01 - Relay CH6 Pi power-cycle endpoint added, flashed, and bench-verified

### Intent

- add a deterministic relay endpoint for Pi power-cycling instead of relying on a raw `CH6` toggle
- preserve a practical remote-recovery path that can later be triggered from an OpenWrt-managed router on the boat LAN

### Files Added Or Changed

- `docs/log.md`
- `docs/relay-control.md`
- `firmware/esp32-s3-relay6ch-provisioning/README.md`
- `firmware/esp32-s3-relay6ch-provisioning/WS_GPIO.cpp`
- `firmware/esp32-s3-relay6ch-provisioning/esp32-s3-relay6ch-provisioning.ino`
- `src/controller.ts`
- `src/services/chatService.ts`
- `src/services/relayService.ts`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.

### Execution Status

- Executed locally on the workstation with the relay temporarily attached over USB.
- Added `GET /PowerCyclePi` to the relay firmware so `CH6` is asserted for 5 seconds and then restored to `off`.
- Added app-side command support for `power cycle the pi` / `restart the pi` / `reboot the pi`.
- Flashed the updated firmware to the attached relay on `/dev/ttyACM0`.
- Rejoined the relay to the `Maison de papa elton` WLAN and re-verified its HTTP endpoint in STA mode.

### Evidence

- local `npm run build` passed
- relay firmware compiled successfully with the repo-local `arduino-cli`
- relay upload to `/dev/ttyACM0` succeeded
- verified relay STA hostname and address:
  - `svk-relay-6ch-551b18.local`
  - `192.168.68.81`
- initial `GET /getData` returned `[0,0,0,0,0,0]`
- `GET http://192.168.68.81/PowerCyclePi` returned `OK`
- post-pulse `GET /getData` returned `[0,0,0,0,0,0]`
- the `PowerCyclePi` test was executed twice successfully during the bench session

### Notes

- The relay was not initially running the updated firmware; the first `GET /PowerCyclePi` returned `Not found`.
- `WS_GPIO.cpp` also needed a compatibility fix from `ledcAttachChannel(...)` to `ledcSetup(...)` plus `ledcAttachPin(...)` for the local ESP32 core (`esp32:esp32 2.0.12`).
- The intended router-side operational model is:
  - SSH to OpenWrt router
  - run `wget -O - http://192.168.68.81/PowerCyclePi` or equivalent
  - relay pulses `CH6`
  - Pi power path cycles if wiring polarity matches the firmware assumption

### Follow-Up Actions

- confirm the final `CH6` wiring polarity before relying on the remote recovery path on the live boat install
- reserve a stable DHCP lease for the relay on the future router so the recovery URL does not drift
- when OpenWrt is in place, add a small router-side recovery script or alias for the relay power-cycle call
- consider adding an auth or shared-secret check on `/PowerCyclePi` if the relay will stay exposed on a larger trusted LAN

## 2026-06-26 - SignalK notification cooldown and snooze support

### Intent

- stop repeated shallow-depth or similar SignalK warnings from re-speaking more often than intended when only the message details change
- add a deterministic `snooze that notification` command that suppresses currently active warning types without muting different new alerts

### Files Added Or Changed

- `docs/log.md`
- `src/config.ts`
- `src/controller.ts`
- `src/services/signalkAlertMonitor.ts`
- `src/test/config.test.ts`
- `src/test/controllerTelemetry.test.ts`
- `src/test/signalkAlertMonitor.test.ts`
- `src/types.ts`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.

### Execution Status

- Executed locally and on the Test Pi.
- Local build and test suite passed before deployment.
- Updated `dist/` was synced to the Test Pi and `svkrishna.service` was restarted to load the new alert-monitor runtime.

### Notes

- Alert repeat suppression now keys off the warning type/path rather than the exact spoken message text, so changing depth values do not create a fresh spoken warning every poll cycle.
- The new snooze behavior only applies to warning types that are active at the moment the user says `snooze that notification`.
- Different warning types that appear during the snooze window are still eligible to speak.
- If an active notification escalates to a higher Signal K severity state, that escalation now overrides both the current snooze and any remaining cooldown for that notification path.
- Current default snooze duration is `300` seconds via `SIGNALK_ALERT_SNOOZE_SECONDS`.

### Evidence

- local `npm test` passed with `45` tests green
- before restart, Test Pi logs showed repeated depth warnings every ~2 seconds, for example `13:15:54`, `13:15:56`, `13:15:58`
- after restart onto the new build, Test Pi logs showed the same warning at `13:17:15` and then `13:17:47`, confirming the 30-second cooldown behavior
- `POST http://127.0.0.1:8080/api/command` with `snooze that notification` returned `Snoozed that Signal K notification for 5 minutes.`
- no further `environment.depth.belowTransducer` alert logs appeared after the `13:18:08` snooze during the subsequent validation window

### Follow-Up Actions

- validate the "different new alert types still speak during a depth-warning snooze" rule against a live multi-alert scenario if that becomes operationally important

## 2026-06-26 - Pi Rasa snooze intent added and deployed

### Intent

- stop Rasa from misclassifying spoken snooze-notification phrases as notification enable commands
- add an explicit Signal K notification snooze intent to the live Pi NLU model

### Files Added Or Changed

- `docs/log.md`
- `src/controller.ts`
- `src/test/controllerTelemetry.test.ts`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, `/home/admin/rasa-test/data/nlu.yml` and `/home/admin/rasa-test/domain.yml` were backed up before editing.

### Execution Status

- Executed locally and on the Test Pi.
- Added app-side intent mapping for `signalk_notifications_snooze` and kept the deterministic snooze guard in place.
- Added the new intent plus training examples in the live Pi Rasa project, retrained the Pi model, promoted it into the service-pinned filename, and restarted `rasa-test.service`.
- Synced the rebuilt app `dist/` to the Test Pi and restarted `svkrishna.service`.

### Evidence

- before retraining, live Pi Rasa classified:
  - `snooze notifications` as `signalk_notifications_on` with confidence `0.8955`
  - `snooze active notifications` as `signalk_notifications_on` with confidence `0.8837`
- after retraining, live Pi Rasa classified:
  - `snooze notifications` as `signalk_notifications_snooze` with confidence `0.9883`
  - `snooze active notifications` as `signalk_notifications_snooze` with confidence `0.9864`
  - `snooze all notifications` as `signalk_notifications_snooze` with confidence `0.9874`
  - `turn on notifications` remained `signalk_notifications_on` with confidence `0.9741`
  - `disable notifications` remained `signalk_notifications_off` with confidence `0.9870`
- after app redeploy, `POST http://127.0.0.1:8080/api/command` returned:
  - `snooze notifications` -> `Snoozed that Signal K notification for 5 minutes.`
  - `snooze active notifications` -> `Snoozed that Signal K notification for 5 minutes.`
- local `npm test` passed with `48` tests green

### Notes

- The root failure was real Rasa overmatching, not a wake-word detector failure.
- The deterministic app-side snooze guard remains intentionally in place as a backstop against future NLU drift.

### Follow-Up Actions

- consider bringing the Pi Rasa project into the main repo or creating a repeatable sync path so future NLU fixes are versioned alongside app code

## 2026-06-26 - Test Pi SignalK telemetry auth restored

### Intent

- restore the failing deterministic marine telemetry path after live tests showed notification commands passing while `current depth` returned an operational fallback

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, both SignalK `security.json` and `/opt/svkrishna/app/.env` were backed up before auth changes.

### Execution Status

- Executed on the Test Pi.
- Confirmed the `current depth` failure was caused by `SIGNALK_TOKEN` being blank in `/opt/svkrishna/app/.env`.
- Verified the live SignalK container on `http://127.0.0.1:3300` was returning `401 Unauthorized` without a bearer token.
- Reset the dedicated `Codex` SignalK user password, minted a fresh JWT from the live auth endpoint, wrote it to `SIGNALK_TOKEN`, and restarted `svkrishna.service`.

### Evidence

- before repair:
  - `POST /api/command` with `what is our current depth` returned the generic fallback
  - `svkrishna.service` logged `SignalK telemetry query failed: HTTP 401`
  - startup preflight reported `SignalK API requires auth. Set SIGNALK_TOKEN.`
- after repair:
  - authenticated `GET http://127.0.0.1:3300/signalk/v1/api/vessels/self` returned vessel JSON
  - startup preflight reported `OK  marine:signalk-api: http://127.0.0.1:3300 reachable`
  - `POST /api/command` with `what is our current depth` returned `Depth is 4.5 meters.`

### Notes

- The notification-toggle path was unaffected because it does not require the same SignalK telemetry read path.
- The regression was another Pi runtime secret-loss issue rather than a repo code regression.

### Follow-Up Actions

- preserve the renewed SignalK automation credential flow in an ops note if this `Codex` user is intended to remain the app-facing integration account
- continue investigating the remaining InfluxDB `401` separately, since it does not block `current depth` after SignalK auth recovery

## 2026-06-26 - Test Pi LED and transcribing-cue runtime restored

### Intent

- recover the documented ReSpeaker LED state signaling and Piper-backed transcribing cue on the Test Pi
- verify whether those regressions came from missing code or missing runtime configuration

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, `/opt/svkrishna/app/.env` was backed up again before restoring LED and Piper settings.

### Execution Status

- Executed on the Test Pi.
- Compared repo documentation and local git state with the live Pi runtime.
- Confirmed the LED and audio-cue code paths still exist locally and had not been removed from the repo.
- Restored missing LED and Piper config entries in `/opt/svkrishna/app/.env`.
- Restarted `svkrishna.service` and re-verified startup preflight.

### Evidence

- repo docs still describe the intended behavior:
  - `RESPEAKER_LED_ENABLED=true`
  - `RESPEAKER_LED_HOST_PATH=/opt/svkrishna/tools/respeaker-xvf3800/xvf_host`
  - transcribing cue text `I'm on it`
- local git changes did not remove `src/services/reSpeakerLedService.ts` or `src/services/audioCueService.ts`
- before restore, Pi startup preflight showed:
  - `NO  piper-binary: binary not found: piper`
  - `NO  piper-model: set PIPER_MODEL_PATH to a real Piper voice model`
- after restore, Pi startup preflight showed:
  - `OK  piper-binary: /opt/svkrishna/venvs/piper/bin/piper`
  - `OK  piper-model: /opt/svkrishna/models/piper/en_GB-alba-medium.onnx`
  - `OK  piper-model-file: /opt/svkrishna/models/piper/en_GB-alba-medium.onnx`
  - `OK  respeaker-led-host: reSpeaker LED host reachable`
- restored Pi `.env` entries now include:
  - `RESPEAKER_LED_ENABLED=true`
  - `RESPEAKER_LED_HOST_PATH=/opt/svkrishna/tools/respeaker-xvf3800/xvf_host`
  - `PIPER_BINARY_PATH=/opt/svkrishna/venvs/piper/bin/piper`
  - `PIPER_MODEL_PATH=/opt/svkrishna/models/piper/en_GB-alba-medium.onnx`
  - `ENABLE_TRANSCRIBING_CUE=true`
  - `TRANSCRIBING_CUE_TEXT=I'm on it`
- the cached cue file remains present at:
  - `/opt/svkrishna/app/local/svkrishna/audio/cues/transcribing-i-m-on-it.wav`

### Notes

- The regressions were caused by runtime config drift on the Pi, not by code removal in the repo.
- Documentation does not name the exact prior Piper voice model; the restored runtime uses the installed `en_GB-alba-medium.onnx` voice because it is present locally and passes startup preflight.
- Wake-word detection is currently functioning again, but recent live traces still show command loss after detection; that remains a separate follow-up from the LED/Piper recovery.

### Follow-Up Actions

- run a live spoken wake-word test and visually confirm the LED transitions `idle -> listening -> transcribing -> thinking/speaking -> idle`
- audibly confirm the `I'm on it` cue and spoken replies use the expected Piper voice; change `PIPER_MODEL_PATH` if a different installed voice is preferred

## 2026-06-26 - Test Pi wake-word and ReSpeaker XVF runtime restored

### Intent

- restore the documented `Hey Krishna` wake-word and ReSpeaker XVF capture settings on the Test Pi
- validate whether the apparent wake-word regression was caused by hardware loss or runtime config drift

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, `/opt/svkrishna/app/.env` was backed up again before restoring the wake-word/XVF block.

### Execution Status

- Executed on the Test Pi.
- Compared `/opt/svkrishna/app/.env` with the available `.env` backup taken before the recent working-tree cleanup.
- Restored explicit wake-word, capture-channel, and ReSpeaker XVF settings in `/opt/svkrishna/app/.env`.
- Restarted `svkrishna.service` and re-verified the live wake-word API state.

### Evidence

- the available `.env` backup was already missing the wake-word and ReSpeaker XVF settings, so it could not be used as a known-good source
- `GET /api/wake-word` after restart returned:
  - `enabled: true`
  - `phrase: "Hey Krishna"`
  - `running: true`
- `GET /api/voice/status` after restart returned:
  - `wakeWordEnabled: true`
  - `wakeWordPhrase: "Hey Krishna"`
- service startup launched:
  - `/opt/svkrishna/venvs/wakeword/bin/python /opt/svkrishna/app/python/wakeword_detector.py`
  - `--model-path /opt/svkrishna/models/openwakeword/hey-krishna.onnx`
  - `--input-device plughw:CARD=Array,DEV=0`
  - `--input-channels 2`
  - `--channel-select right`
- `journalctl -u svkrishna.service` reported:
  - `ReSpeaker XVF configured`
  - `Wake word listener starting for "Hey Krishna".`
- ALSA and USB checks still showed the SeedStudio/ReSpeaker device present as `2886:001a` and capture device `plughw:CARD=Array,DEV=0`

### Notes

- The runtime regression was configuration drift, not hardware disappearance.
- The app had fallen back to an older local persisted file at `/opt/svkrishna/app/local/svkrishna/config/wake-word.json`, which still contained `enabled: false` and `phrase: "Okay Krishna"`.
- The intended persisted file at `/opt/svkrishna/config/wake-word.json` still contained the correct `Hey Krishna` settings.
- The wake-word API still reports a benign ONNX Runtime warning about unavailable CUDA providers while `running: true`; current evidence suggests the detector is operating on CPU despite that warning.

### Follow-Up Actions

- run live spoken wake-word tests on the Test Pi to confirm whether detection quality returns after restoring the correct runtime settings
- decide whether to delete or archive the stale `/opt/svkrishna/app/local/svkrishna/config/wake-word.json` file to prevent future confusion if env config drifts again

## 2026-06-26 - Test Pi web UI re-enabled

### Intent

- restore the built-in SV-Krishna web UI/API listener on the Test Pi after confirming it was disabled in runtime config

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, `/opt/svkrishna/app/.env` was backed up before editing.

### Execution Status

- Executed on the Test Pi.
- `ENABLE_WEB_UI` was changed from `false` to `true` in `/opt/svkrishna/app/.env`.
- `svkrishna.service` was restarted after the config update.

### Evidence

- `svkrishna.service` restarted successfully and remained `active`
- service journal reported `Web UI listening at http://0.0.0.0:8080`
- `sudo ss -ltnp` showed the app listening on `0.0.0.0:8080`
- `curl http://127.0.0.1:8080/api/voice/status` returned a valid JSON status payload

### Notes

- The earlier API verification confusion was caused by the built-in web UI being disabled on the Pi, not by a Rasa failure.

### Follow-Up Actions

- re-run the Signal K notification toggle end-to-end through the restored `:8080` API path if further validation is needed

## 2026-06-26 - SignalK notification toggle, Rasa phrasing update, and Test Pi deployment follow-up

### Intent

- add runtime enable/disable control for the Signal K alert monitor
- persist the alert-monitor enabled state across restarts
- extend Rasa-driven normalization to cover Signal K notification on/off/status phrasing
- record the Test Pi deployment and the verification gap around the expected SV-Krishna API listener

### Files Added Or Changed

- `docs/README.md`
- `docs/agent-handover-2026-06-26-signalk-notifications.md`
- `docs/log.md`
- `src/config.ts`
- `src/controller.ts`
- `src/index.ts`
- `src/services/signalkAlertMonitor.ts`
- `src/services/signalkAlertMonitorStore.ts`
- `src/test/config.test.ts`
- `src/test/controllerTelemetry.test.ts`
- `src/types.ts`
- `src/web/webServer.ts`

### Sandbox Recovery Step

- No workstation sandbox recovery was required.
- On the Test Pi, deployment sync was rerun excluding runtime-owned `local/` state after permission errors during an initial `rsync --delete` attempt.

### Execution Status

- Executed locally and on the Test Pi.
- Local tests were reported green for the changed code.
- Pi app was rebuilt, deployed, and `svkrishna.service` was restarted.
- Pi Rasa NLU data was updated, retrained from the project venv, and `rasa-test.service` was restarted.
- Full live app API verification on the Test Pi remained incomplete because the expected SV-Krishna listener was not cleanly reachable on the assumed port during the session.

### Evidence

- live Pi Rasa parse checks classified:
  - `disable notifications` as `signalk_notifications_off`
  - `enable notifications` as `signalk_notifications_on`
  - `what is the notification status` as `signalk_notifications_status`
- deployed Pi Rasa model was copied over the service-pinned model filename before restart
- `svkrishna.service` was reported active after deployment
- port `3001` returned unrelated HTML from a different Node process and `127.0.0.1:3000` refused connections during the final API re-check

### Notes

- The repo now persists Signal K alert-monitor state separately from the startup env default, matching the existing wake-word settings pattern.
- The Rasa-side training issue described in the handover was a shell-path problem on the Pi, not necessarily a model or code failure.
- The fixed-model-file behavior in `rasa-test.service` remains operationally fragile and should be treated as existing environment debt unless the unit is updated.

### Follow-Up Actions

- confirm the intended SV-Krishna web/API bind port on the Test Pi and re-run the end-to-end notification toggle checks there
- inspect `/etc/systemd/system/rasa-test.service` and replace the fixed model filename workflow with a controlled latest-model promotion step or explicit model-path update process
- align docs and Pi config so the persisted Signal K alert-monitor settings path is predictable during future deploy/debug sessions

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

## 2026-07-22 - Jellyfin login recovery on cluster02

### Intent

- investigate and restore Jellyfin user login failures on `cluster02` (`192.168.68.202`)

### Files Added Or Changed

- `docs/log.md`

### Sandbox Recovery Step

- No sandbox recovery step was required.
- No media or torrent content was deleted.

### Execution Status

- Executed remotely on `cluster02`.
- Reduced the ext4 reserved-block allocation on `/dev/nvme0n1p2` from 5% to 1% with `tune2fs`, restoring 75 GB of space to non-root services.
- Stopped Jellyfin briefly, backed up its SQLite database and configuration, and restarted the Docker container.

### Evidence

- Before recovery, `/dev/nvme0n1p2` was 100% full with zero space available and Jellyfin logged repeated `SQLite Error 10: 'disk I/O error'` failures.
- Backup created at `/mnt/ssd/jellyfin/backups/disk-full-recovery-20260722-213544`.
- SQLite `PRAGMA quick_check` returned `ok`.
- The `media` account exists, has zero invalid login attempts, and does not require a password update.
- Jellyfin returned HTTP 200 after restart and reported startup complete.
- No SQLite, disk-I/O, no-space, or application errors appeared after the clean restart.
- Post-recovery filesystem state: 75 GB available, 96% used.

### Follow-Up Actions

- Configure retention or free additional space under `/mnt/ssd/media/torrents`, which currently consumes approximately 1.6 TB, so the filesystem does not fill again.

## 2026-07-23 - Recurrent Jellyfin disk-full recovery and guard

### Intent

- recover Jellyfin after the host filesystem filled again
- prevent Jellyfin's live SQLite process from remaining active when free space becomes critically low

### Files Added Or Changed

- `deploy/scripts/jellyfin-disk-guard.sh`
- `deploy/systemd/jellyfin-disk-guard.service`
- `deploy/systemd/jellyfin-disk-guard.timer`
- `docs/log.md`

### Sandbox Recovery Step

- No sandbox recovery step was required.
- No media or torrent content was deleted.

### Execution Status

- Executed remotely on `cluster02` (`192.168.68.202`).
- Stopped Jellyfin, made a consistent backup, checked and checkpointed SQLite, and restarted the container.
- Installed and enabled `jellyfin-disk-guard.timer` on `cluster02`.

### Evidence

- The filesystem had already been cleared to 222 GB available, but the unrestarted Jellyfin process continued reporting `SQLite Error 10: 'disk I/O error'`.
- Backup created at `/mnt/ssd/jellyfin/backups/disk-full-recovery-20260723-212542`.
- SQLite `PRAGMA quick_check` returned `ok`; WAL checkpoint returned `(0, 0, 0)`.
- The `media` account remained present with zero invalid login attempts.
- Jellyfin returned HTTP 200 after restart and resumed writing a normal SQLite WAL.
- No SQLite, disk-I/O, no-space, or application errors appeared after startup completed.
- The guard timer is active and checks once per minute.
- The guard stops Jellyfin below 50 GiB available and automatically restarts it above 100 GiB, using a marker so it does not restart a container stopped for another reason.

### Follow-Up Actions

- Identify the external process or host writing into `/mnt/ssd/media/torrents`; no downloader container or service was running on `cluster02` during this investigation.
- Apply storage retention or quotas at that writer. The guard protects Jellyfin's database but does not prevent other data from filling the filesystem.

## 2026-07-25 - Quark A026 Wi-Fi and Signal K cutover

### Intent

- give the Quark-Elec A026 a stable address on the boat LAN
- replace the unreliable Signal K USB ingress with the A026 TCP stream
- preserve existing Signal K source identities and downstream consumers

### Files Added Or Changed

- `docs/quark-a026-wifi-signalk-cutover-2026-07-25.md`
- `docs/README.md`
- `execution-logs/signalk-a026-wifi-cutover-2026-07-25.md`
- `docs/log.md`

### Sandbox Recovery Step

- No sandbox recovery step was required.
- A live Signal K settings backup was created at
  `/home/pi/.signalk/settings.json.pre-a026-wifi-20260725-145943`.

### Execution Status

- Executed on the boat router and `pi@192.168.1.100`.
- Reserved `192.168.1.99` for A026 MAC `84:0D:8E:A2:C9:A5`.
- Replaced the active `nmeain` serial configuration with a TCP client to
  `192.168.1.99:2000`.
- Restarted Signal K; the service returned `active`.
- The separate NMEA 2000, wind input, and NMEA output providers were not
  changed.

### Evidence

- Router reboot completed and the A026 remained reachable at
  `192.168.1.99`.
- Signal K established a TCP socket to `192.168.1.99:2000`.
- `nmeain.GP` GPS sentence timestamps advanced over the verification
  interval.
- `nmeain.AI` AIS `VDM` timestamps also advanced.
- Live position and speed-over-ground remained sourced from `nmeain.GP`.
- Existing polar consumers continued receiving the same source identity.

### Follow-Up Actions

- Keep the A026 USB cable connected to the powered Waveshare USB hub because
  it supplies power. The USB serial interface may enumerate, but the active
  Signal K configuration does not consume it.
- Confirm AIS target display and GPS continuity during the next sailing
  session.

## 2026-07-25 - Magnetic wind direction null repair

### Intent

- diagnose intermittent null values on
  `environment.wind.directionMagnetic`
- establish one authoritative magnetic wind calculation

### Files Added Or Changed

- `execution-logs/signalk-magnetic-wind-direction-2026-07-25.md`
- `docs/log.md`

### Sandbox Recovery Step

- No sandbox recovery step was required.
- Backups of the live derived-data and Signal K settings were created before
  the changes.

### Execution Status

- Executed on `pi@192.168.1.100`.
- Enabled position/WMM-derived magnetic variation.
- Disabled the competing apparent-wind magnetic-direction calculation.
- Kept the true-to-magnetic wind calculation enabled.
- Preferred `derived-data` over the A026's empty RMC magnetic-variation value
  for `navigation.magneticVariation`.
- Restarted Signal K; the service returned `active`.

### Evidence

- Before repair, an eight-second sample contained 35 null and 16 numeric
  magnetic-wind readings.
- After repair, a fifteen-second sample contained:
  - 70/70 numeric magnetic-variation readings
  - 70/70 numeric magnetic-wind-direction readings
  - 70/70 numeric true-wind-direction readings
- Calculated local magnetic variation was approximately `-0.4522°`.
- The A026 TCP connection remained established.

### Follow-Up Actions

- Confirm the magnetic-wind display remains continuous during the next sailing
  session.
- Revisit heading source semantics separately if the IMU bridge is expected to
  provide independently corrected true and magnetic headings.

## 2026-07-25 - KIP copy of LVGL dashboard planning

### Intent

- assess whether KIP can reproduce the proposed LVGL marine dashboard
- divide implementation into substantial, independently owned work packages
- establish a safe live-configuration and rollback boundary before changing
  the boat display

### Files Added Or Changed

- `docs/Boat_Information_Media_Control_Panel_System_Design_v1.md`
- `docs/lvgl-marine-dashboard-specification.md`
- `docs/4d5d259a631e49507f0f3e2859524887a13191c7fd7b58df2a1d73220000d8a8.png`
- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- GitHub design branches were fetched and inspected.
- Three parallel read-only audits covered KIP widget mapping, KIP custom-widget
  architecture, and the live boat installation.
- No live KIP configuration, Signal K application data, service or dashboard
  was changed.

### Evidence

- The boat is running Signal K `2.13.5` and KIP `4.8.0`.
- KIP application data is server-backed under
  `/home/pi/.signalk/applicationData/global/kip/`.
- The existing `Krishna` profile can remain untouched while a new
  `Krishna LVGL` profile is developed.
- Navigation, depth, wind, AIS and battery data are present.
- Solar, tanks, relays, cabin environment and active anchor state were not
  present during the audit.

### Next Action

- execute WP1 from the implementation plan: export/checksum the live baseline
  and produce the complete Signal K data contract before creating the
  configuration-only prototype.

## 2026-07-25 - KIP custom-development baseline

### Intent

- define a maintainable source, build, deployment and rollback boundary for
  custom KIP widgets without vendoring KIP into this repository

### Files Added Or Changed

- `docs/kip-custom-development-and-deployment-baseline.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Documentation and upstream-source inspection only.
- Pinned the design baseline to upstream KIP tag `v4.8.0`, commit
  `417348d9d5948e17ea9f8c715ab3d37cc3fea555`.
- No maintained KIP fork or sibling worktree was created.
- No npm package was built or installed.
- No live KIP profile, application data, package or Signal K service was
  changed.

### Assumptions and Follow-Up

- The first custom build will preserve KIP's package identity, plugin id and
  `/@mxtommy/kip/` base path and use a `4.8.0-krishna.N` package version.
- Verify the Signal K-supported local-tarball installation command on a test
  instance and rehearse package plus configuration rollback before any boat
  deployment.

## 2026-07-25 - KIP WP1 live baseline and rollback backup

### Intent

- preserve the live KIP server-backed configuration before prototype work
- define the verified Signal K data contract for the LVGL-aligned KIP profile

### Files Added Or Changed

- `docs/kip-lvgl-live-data-contract-2026-07-25.md`
- `execution-logs/kip-wp1-baseline-2026-07-25.md`
- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Executed read-only inspection and a KIP-only backup on
  `pi@192.168.1.100`.
- Created `/home/pi/backup-kip-20260725-160640` with mode `0700`.
- Verified all three copied JSON files against their live source SHA-256
  checksums.
- Recalculated source checksums after copying; they were unchanged.
- No service was restarted and no KIP profile or active configuration was
  changed.

### Findings and Follow-Up

- Navigation, depth, wind, AIS and most battery values can support the
  configuration-only prototype.
- Solar, tanks, relays, cabin weather and active anchor state remain missing
  or unresolved and must render unavailable.
- Starter battery current is implausible and is excluded from trustworthy
  presentation pending source validation.
- The next safe action is WP2: create a separate `Krishna LVGL` profile while
  preserving the existing `Krishna` profile.

## 2026-07-25 - KIP anchor situation contract audit

### Intent

- establish the exact read and control contract exposed by the installed
  anchor-alarm plugin before WP3 custom-widget development

### Files Added Or Changed

- `docs/kip-anchor-situation-data-contract-2026-07-25.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Read-only audit of `signalk-anchoralarm-plugin` `2.0.1` on
  `pi@192.168.1.100`.
- Inspected installed implementation, documentation, sanitized persisted
  state and the live Signal K API.
- No anchor action, PUT, POST, file change or service restart was performed.

### Verified State and Blockers

- The plugin is enabled but anchor watch is inactive (`on: false`).
- No live `navigation.anchor` values or anchor notification existed.
- The track endpoint exists but requires authenticated plugin access and
  returned HTTP `401` to the unauthenticated read-only request.
- The plugin exposes no public boolean enabled path and does not guarantee an
  initial normal notification.
- Active cadence, source labels and reconnect behaviour remain unverified
  until a controlled anchoring test can be performed.

## 2026-07-25 - KIP WP2 stock-profile artifact

### Intent

- prepare a separate, configuration-only `Krishna LVGL` KIP prototype
- reproduce the LVGL information hierarchy with stock, read-only KIP widgets

### Files Added Or Changed

- `config/kip/krishna-lvgl-stock-v1.json`
- `config/kip/validate-krishna-lvgl.jq`
- `config/kip/README.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Inspected the live KIP configuration schema read-only on
  `pi@192.168.1.100`.
- Created a standalone KIP `{app, dashboards, theme}` import artifact at
  configuration version `12`; it is not a server-side replacement file.
- The artifact contains exactly Overview, Anchor Watch and Systems. Its
  initial `24 x 12` assumption was subsequently corrected to KIP's `24 x 24`
  grid during browser validation.
- All 22 widgets use the stock KIP Host2 wrapper and read-only widget types.
- Anchor, solar, tank and relay information is explicitly marked unavailable.
- No live KIP file, profile, Signal K service or dashboard was changed.
- No sandbox recovery step was required.

### Validation and Follow-Up

- `jq empty config/kip/krishna-lvgl-stock-v1.json` passed.
- The repository validator passed configuration version, dashboard order,
  grid bounds, widget UUID, approved-type and no-PUT checks.
- All 22 widget IDs are unique. The corrected artifact ends every dashboard at
  grid row `24`.
- Structural validation was followed by the live-profile installation and
  explicit `800 x 480` browser validation recorded below.

## 2026-07-25 - KIP WP2 stock-profile installation and validation

### Intent

- add the stock prototype as a separate server-backed KIP profile
- validate the actual KIP layout at an `800 x 480` application viewport
- preserve the existing `Krishna` profile and keep the prototype read-only

### Files Added Or Changed

- `config/kip/krishna-lvgl-stock-v1.json`
- `config/kip/validate-krishna-lvgl.jq`
- `config/kip/README.md`
- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `execution-logs/kip-wp2-stock-profile-2026-07-25.md`
- `execution-logs/kip-lvgl-stock-v1-screenshots/`
- `docs/log.md`

### Execution Status

- Executed on `pi@192.168.1.100`.
- Added `Krishna LVGL` to both KIP application-data aliases.
- Left the existing five-dashboard `Krishna` profile unchanged.
- Kept all prototype widgets read-only.
- Signal K remained active and was not restarted.

### Evidence

- Initial browser validation identified and corrected a `24 x 12` versus
  `24 x 24` KIP grid assumption.
- The corrected artifact passed its JSON/JQ safety validator.
- Overview, Anchor Watch and Systems each use the complete 24-row grid.
- Explicit Chromium device metrics confirmed an `800 x 480` viewport with no
  document-level scrolling.
- Screenshots captured all three dashboards with live boat telemetry and
  explicit unavailable states.

### Follow-Up Actions

- Select or restore `Krishna LVGL` from KIP on the intended physical display.
- Perform physical touch and day/night review.
- Start WP3 for the native offline anchor-situation widget.

## 2026-07-25 - Krishna Anchor Situation widget design

### Intent

- design the native KIP Host2 boundary for the offline anchor situation
  display before implementation

### Files Added Or Changed

- `docs/kip-krishna-anchor-situation-widget-design.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Documentation and read-only source inspection only.
- Inspected KIP `v4.8.0` Host2, stream, SVG and theme conventions in the
  sibling `Kip` repository on `krishna/v4.8-lvgl-dashboard`.
- Inspected the upstream Signal K Anchor Alarm plugin's published paths and
  metadata behaviour.
- No KIP implementation file, package, profile, application data or Signal K
  service was changed.

### Design Decisions and Follow-Up

- Keep projection, distance, bearing, scale, status and trail handling in a
  pure widget-local TypeScript model.
- Use explicit Host2 paths sampled at one second and a responsive inline SVG
  using KIP theme roles.
- Treat static anchor reference timestamps separately from live GPS freshness;
  stale GPS can never report `Anchor secure`.
- Verify live anchor path/state behaviour before implementing controls or
  finalising widget dimensions.

## 2026-07-25 - KIP anchor-widget implementation pattern review

### Intent

- identify the exact KIP `4.8.0` components, services, configuration
  conventions and test patterns suitable for the Krishna Anchor Situation
  widget

### Files Added Or Changed

- `docs/kip-anchor-widget-implementation-patterns-2026-07-25.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Read and applied the KIP project, Host2 widget, widget-creation and Angular
  test instructions.
- Inspected the clean sibling KIP repository at commit
  `417348d9d5948e17ea9f8c715ab3d37cc3fea555`.
- Reviewed Anchor Watch, AIS Radar, Compass, Windsteer, resize, stream,
  configuration-dialog, icon, WidgetService and representative widget test
  implementations.
- Documentation and source inspection only.
- No KIP code, package, live profile, Signal K service or boat dashboard was
  changed.
- No sandbox recovery step was required.

### Findings and Follow-Up

- The new widget should be a schematic-generated Host2 Component using a
  purpose-built SVG and the existing `anchorWatch` icon.
- The existing Anchor Watch is an iframe wrapper and is not a suitable native
  implementation base.
- AIS provides useful render scheduling and geometry patterns, but anchor
  geometry should be separated into directly tested pure functions.
- The timeout documentation says minutes while runtime treats the value as
  seconds; this must be resolved or explicitly tested before safety use.
- Direct tests are absent for the existing Anchor Watch, AIS Radar, Compass
  and AIS processing code, so the new widget test plan deliberately fills
  those assurance gaps.

## 2026-07-25 - KIP WP3 independent review checklist

### Intent

- prepare deterministic independent-review criteria while the Krishna Anchor
  Situation implementation proceeds in the sibling KIP repository

### Files Added Or Changed

- `docs/kip-anchor-widget-wp3-review-checklist-2026-07-25.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Documentation and read-only test-runner inspection only.
- Defined exact cardinal, diagonal, date-line, status-precedence and bounded
  trail vectors plus Host2, notification, SVG, configuration and registration
  assertions.
- Confirmed Angular unit-test builder support for `--include` file selection
  and `--filter` suite/test regular expressions.
- Did not edit the sibling KIP repository while implementation is active.
- No sandbox recovery step was required.

### Constraints and Follow-Up

- The source contains icon `anchorWatch`, not the design draft's
  `anchorAlarmWidget`; registration must use a real icon or deliberately add
  and test a new one.
- Registration will use the explicitly selected Component category and the
  existing `anchorWatch` icon.
- Node `22.23.1` is available at the coordinated local path and `npm ci` was
  rerun under it. The Rollup optional native package still cannot be required
  directly, so focused test/build execution will determine whether it remains
  an effective blocker.
- Review the implementation diff only after the implementation agent reports
  completion; coordinate before applying any test or corrective patch.

## 2026-07-25 - KIP WP3 native anchor-situation widget

### Intent

- implement the distinctive offline anchor panel from the LVGL design as a
  native KIP Host2 widget
- preserve a read-only boundary until active anchor behavior is verified
- produce a testable package without installing it on the boat

### Files Added Or Changed

- sibling KIP checkout on `krishna/v4.8-lvgl-dashboard`
- `docs/kip-anchor-situation-data-contract-2026-07-25.md`
- `docs/kip-krishna-anchor-situation-widget-design.md`
- `docs/kip-anchor-widget-implementation-patterns-2026-07-25.md`
- `docs/kip-anchor-widget-wp3-review-checklist-2026-07-25.md`
- `execution-logs/kip-wp3-anchor-widget-2026-07-25.md`
- `execution-logs/kip-anchor-widget-screenshots/`
- `artifacts/kip/mxtommy-kip-4.8.0-krishna.1.tgz`
- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Implemented and independently reviewed the read-only native widget.
- Corrected warning/critical precedence, coordinate timestamp pairing,
  trail-threshold precision and pre-anchor trail ownership.
- Passed 16 focused tests, lint, production/plugin build and whitespace
  validation under Node `22.23.1`.
- Rendered inactive and simulated within-radius states at `800 x 480`.
- Built release candidate `4.8.0-krishna.1`.
- Did not install or activate the custom KIP package on the boat.

### Follow-Up Actions

- review compact and full-screen layouts on the physical display
- validate night, red-only and high-contrast themes
- test against an active Anchor Alarm under safe boat conditions
- rehearse package and configuration rollback on a test Signal K instance

## 2026-07-25 - KIP WP3 deployment to boat instance

### Intent

- deploy the tested `4.8.0-krishna.1` KIP candidate after the user confirmed
  that the boat instance was not being used in a live navigational context
- place the native anchor widget in the separate `Krishna LVGL` profile while
  preserving the original `Krishna` profile and an exact rollback boundary

### Files Added Or Changed

- `execution-logs/kip-wp3-boat-deployment-2026-07-25.md`
- `execution-logs/kip-wp3-anchor-widget-2026-07-25.md`
- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `docs/README.md`
- `docs/log.md`

### Execution Status

- Created fresh backup
  `/home/pi/backup-kip-deploy-20260725-170513` containing stock KIP `4.8.0`,
  package metadata and all KIP application data.
- Uploaded and checksum-verified the candidate under the persistent
  `/home/pi/.signalk/local-packages/` directory.
- Installed `@mxtommy/kip@4.8.0-krishna.1` and restarted Signal K.
- npm rebuilt the existing native `mdns` dependency and completed successfully
  after approximately 152 seconds. An early probe caught the normal package
  replacement window; the full timing and protective restore action are
  recorded in the execution evidence.
- Replaced only the unavailable-anchor placeholder in the separate
  `Krishna LVGL` profile with `widget-krishna-anchor-situation`.
- Confirmed both KIP application-data aliases are byte-identical and the
  original `Krishna` profile remains available.
- Verified active Signal K, HTTP 200 from KIP and the Signal K API, the widget
  in the served bundle, and fresh position and heading telemetry.
- True wind speed was absent during the final observation and remains an
  optional omitted indication.
- No rollback was needed or executed.

### Follow-Up Actions

- inspect the page on the physical `800 x 480` display
- validate night, red-only and high-contrast themes
- safely activate Anchor Alarm and validate real plugin geometry,
  notifications, cadence and reconnect behavior
- execute the documented rollback rehearsal before navigation-critical use

## 2026-07-31 - Native LVGL Anchor Watch first read-only milestone

### Intent

- continue the parked Waveshare Anchor Watch development without changing the
  accepted Overview layout
- establish honest read-only Signal K state handling before any consequential
  anchor controls are considered

### Files Added Or Changed

- `firmware/waveshare-lvgl-overview/main/telemetry/telemetry_state.c/.h`
- `firmware/waveshare-lvgl-overview/main/telemetry/signalk_delta.c`
- `firmware/waveshare-lvgl-overview/main/ui/anchor_watch_screen.c/.h`
- `firmware/waveshare-lvgl-overview/main/ui/overview_screen.c/.h`
- `firmware/waveshare-lvgl-overview/main/main.c`
- `firmware/waveshare-lvgl-overview/main/CMakeLists.txt`
- `firmware/waveshare-lvgl-overview/tests/telemetry_state_test.c`
- `firmware/waveshare-lvgl-overview/tests/signalk_delta_test.c`
- `firmware/waveshare-lvgl-overview/README.md`
- `docs/log.md`

### Execution Status

- Added anchor position, maximum/warning/current radius, rode length, true wind
  direction, notification state/message and position age to the telemetry model.
- Added null invalidation and explicit state precedence for inactive, within,
  warning, critical, stale, unavailable and fault.
- Added a separate persistent read-only Anchor Watch screen with north-up
  geometry, real anchor-to-vessel plot position, boundary, bounded trail,
  distance, bearing, heading, wind and GPS age.
- Preserved the existing Overview object and geometry; navigation switches
  between persistent LVGL screens rather than recreating the Overview.
- `telemetry_state_test` and `signalk_delta_test` passed with
  `-Wall -Wextra -Werror`.
- ESP-IDF 5.5.5 build passed. Binary size is `0x159050`; the 4 MiB app
  partition has 66% free.
- No sandbox recovery was needed. No board was flashed and no Signal K or boat
  environment was changed.

### Follow-Up Actions

- add deterministic anchor data to the workstation simulator and inspect all
  seven states on the physical 800 x 480 display
- flash only under a controlled test window, then verify touch navigation,
  serial stability and live/stale transitions
- keep anchor-setting, radius, raise/disable and history-clearing writes out of
  scope until authenticated contracts and confirmation/failure UX are tested

## 2026-07-31 - Native LVGL Anchor Watch device deployment

### Intent

- deploy the tested read-only Anchor Watch build to the attached Waveshare
  display and verify a clean boot through live telemetry readiness

### Files Added Or Changed

- `execution-logs/waveshare-lvgl-anchor-watch-deployment-2026-07-31.md`
- `docs/log.md`

### Execution Status

- Flashed the expected ESP32-S3 at the stable serial-by-id path; esptool
  verified all written hashes and hard-reset the device.
- Verified 16 MB QIO flash, 8 MB PSRAM memory test, GT911 touch identification,
  30,436 MiB SD mount, Wi-Fi at `192.168.68.64`, Signal K connection and full
  dashboard telemetry readiness.
- Observed no panic or reset during the post-readiness stability window.
- No sandbox recovery was required. No Signal K host or boat environment was
  changed.

### Follow-Up Actions

- obtain owner physical-screen and touch-navigation acceptance
- inject controlled anchor states on the test feed before validating active,
  warning, critical, stale, unavailable and fault rendering

## 2026-07-31 - Anchor Watch head-up correction and synthetic review state

### Intent

- reconcile the implemented plot with the authoritative native LVGL design
- reuse the accepted Overview boat symbol and expose nearby moving AIS targets
- provide a reversible synthetic active-anchor state for physical review

### Execution Status

- Confirmed the native LVGL specification requires head-up even though the
  older KIP widget design separately described north-up.
- Changed Anchor Watch so the exact Overview boat outline remains upright and
  vessel, trail, North and AIS geometry rotate relative to true heading.
- Added up to eight fresh moving AIS targets within the current plot extent.
- Backed up and restarted only the workstation Signal K simulator, then read
  back the synthetic anchor/vessel coordinate leaves and 20/40/50 m radii.
- The fixture publishes display inputs only; it did not call, set or arm the
  Anchor Alarm plugin and did not change the boat Signal K instance.
- Both host tests, ESP-IDF build, flash hash verification, boot, full telemetry
  readiness and ten-second stability observation passed.

### Follow-Up Actions

- obtain owner visual acceptance of the deployed `WITHIN` review state
- add a controlled non-self AIS context if physical AIS-marker review is needed
- exercise warning, critical, stale, unavailable and fault states separately

## 2026-07-31 - Anchor symbol and alarm-authority review

- Replaced the Anchor Watch plot-origin GPS glyph with a native 29 x 32 amber
  anchor drawing and deployed the hash-verified build (`0x159bc0`). Boot, touch,
  SD, Wi-Fi, Signal K and complete telemetry readiness passed.
- Confirmed `src/services/anchorAlarmService.ts` is a voice/control client for
  the Signal K Anchor Alarm plugin, not an independent alarm engine. The plugin
  should remain the sole state and notification authority.
- The workstation test Signal K has no Anchor Alarm plugin installed; its
  current anchor state remains display-only synthetic data. The boat plugin
  was previously verified enabled but inactive.
- Before live voice activation, remove the hard-coded position fallback from
  `AnchorAlarmService`: loss of both local and remote fresh position must fail
  closed rather than setting an anchor at a test coordinate.

## 2026-07-31 - Anchor Watch top-bar continuity

- Replicated the accepted Overview top-bar behaviour on Anchor Watch: measured
  Wi-Fi arcs, Signal K live/stale state, GPS live/stale state and Signal K
  clock now use the same positions, colours, thresholds and typography.
- Removed the separate top-bar read-only badge; the screen remains read-only
  and states this in its content area.
- ESP-IDF build passed at `0x15a0b0`; flash hashes, boot, touch, SD, Wi-Fi,
  Signal K connection and full telemetry readiness passed on the device.

## 2026-07-31 - Test Anchor Alarm plugin integration and voice fail-closed hardening

- Removed the voice adapter's hard-coded position fallback and required a fresh
  local or remote GPS fix before any anchor write. Added a zero-write failure
  test; all 51 repository tests passed.
- Deployed `dist/` to Test Pi `192.168.68.203`, restarted
  `svkrishna.service`, verified active state and HTTP 200 Web UI operation.
- Installed and enabled Anchor Alarm 2.0.1 only on workstation Signal K.
- Changed simulator depth to constant 3 m and replaced simulated anchor/radius
  values with real plugin-owned outputs.
- Passed 15 m rode and 3 m depth through a controlled authenticated test-plugin
  activation. Read-back confirmed 14.6969 m maximum radius, 11.7576 m warning
  radius, 0 m initial distance, persisted active state and normal notification.
- LVGL consumes those standard plugin paths without a firmware change.
- Evidence: `execution-logs/signalk-test-anchor-plugin-integration-2026-07-31.md`.
- No boat system was changed; step-5 boat activation remains pending controlled
  physical approval and real sensor/configuration validation.

## 2026-07-31 - Anchor Watch numeric-label rendering fix

- Diagnosed blank Anchor Watch values despite a valid `WITHIN` state as use of
  LVGL's float-disabled `lv_label_set_text_fmt` path.
- Routed GPS age, anchor distance/radius/bearing, vessel heading and true-wind
  formatting through standard `snprintf` before assigning label text.
- ESP-IDF build passed at `0x15a120`; the application, bootloader and partition
  table were hash-verified during flash to the attached display.
- Post-reset touch, SD, Wi-Fi, Signal K connection and complete telemetry
  readiness passed. No Signal K or anchor-alarm configuration was changed.

## 2026-07-31 - Anchor Watch compass, wind sector and compact metrics

- Reworked distance, anchor-to-vessel bearing, vessel heading and true wind as
  four Overview-style metric cards with accent rails, large values, separate
  units and concise detail lines.
- Added a fixed outer instrument ring whose 30-degree ticks and cardinal
  labels rotate against the upright boat using true heading.
- Kept the amber warning and red maximum-radius circles exclusively for anchor
  safety. Added a short cyan perimeter sector for relative true wind angle.
- Added `environment.wind.angleTrueWater` to the Signal K subscription, state
  model and host tests; both tests passed with warnings treated as errors.
- Backed up the workstation simulator configuration, added a fixed synthetic
  40-degree starboard true-wind angle for review, and restarted only the test
  Signal K container. The Anchor Alarm plugin retained its active 15 m-rode
  state and 14.6969 m maximum radius.
- ESP-IDF build passed at `0x15a510`; flash hashes, boot, touch, SD, Wi-Fi,
  Signal K connection and complete telemetry readiness passed on the device.
- No Test Pi or boat environment was changed. Physical layout acceptance is
  still required on the attached display.

## 2026-07-31 - Anchor Watch wind-sector visibility and card priority

- Confirmed the synthetic 40-degree starboard relative wind angle remained
  live, isolating the missing indication to LVGL arc rendering rather than the
  Signal K subscription.
- Replaced the short arc with a foreground nine-marker cyan sector spanning
  32 degrees, with a larger centre marker at the measured wind angle.
- Promoted true wind speed to the card's large value and moved absolute true
  wind direction to its detail line.
- Changed bearing, heading and wind direction presentation from `deg T` to the
  requested shorter `deg` form.
- Both host tests passed. The `0x15a570` build was hash-verified during flash
  and reached complete post-reset telemetry readiness on the display.

## 2026-07-31 - Instrument-style Anchor Watch dial

- Reworked the Anchor Watch plot toward the supplied sailing-instrument
  reference: broad light compass band, dark inner face, rotating 30-degree
  numerals/cardinals, red North marking and a fixed three-digit heading window.
- Added a strong cyan ray from the plot centre to the relative true-wind angle
  while retaining the cyan perimeter sector.
- Preserved the upright Overview boat, anchor symbol, rode, vessel offset,
  trail, AIS targets and independent amber/red anchor safety boundaries.
- Both host tests passed. The `0x15a8a0` application was hash-verified during
  flash and reached complete touch, SD, Wi-Fi, Signal K and telemetry readiness.
- This is a physical design-review build; owner assessment of density,
  contrast and overlap on the real display remains the acceptance step.

## 2026-07-31 - Instrument-style dial rolled back

- Owner review rejected the instrument-style dial as worse than the preceding
  Anchor Watch presentation.
- Removed only that experiment and restored the prior dark plot, simple
  rotating cardinal compass, cyan perimeter wind sector and compact cards.
- The rebuilt application returned exactly to the prior `0x15a570` size.
  Both host tests, flash hash verification and complete device telemetry
  readiness passed.

## 2026-07-31 - Anchor Watch thread closeout

- Rewrote the Waveshare handover to reflect the actual final deployed state,
  including the accepted rollback, current Signal K test-plugin authority,
  voice fail-closed behaviour, recovery information and next safety gate.
- Confirmed generated firmware output, runtime backups and packaged review
  artifacts remain local and are excluded from version control.
- Prepared the complete documented source/configuration/evidence backlog for
  integration with remote `main` without discarding either side of the
  repository's divergent history.
- Committed the completed backlog as `24bc2d2`, merged remote `main`'s PCB
  upload history as `6ffa38f`, and pushed the combined history directly to
  `origin/main` without force.
- Final repository validation passed all 51 Node tests, both firmware host
  telemetry tests, the ESP-IDF build and the attached-device deployment checks.

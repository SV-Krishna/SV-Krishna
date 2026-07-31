# KIP Copy of the LVGL Marine Dashboard

## Objective

Build an `800 x 480` KIP experience that stays visually and operationally
close to the proposed LVGL dashboard so that moving between the two displays
does not require learning a different information hierarchy.

The detailed LVGL specification remains the design authority:

- `docs/lvgl-marine-dashboard-specification.md`
- `docs/4d5d259a631e49507f0f3e2859524887a13191c7fd7b58df2a1d73220000d8a8.png`
- `docs/Boat_Information_Media_Control_Panel_System_Design_v1.md`

The first KIP version will contain exactly three dashboards:

1. Overview
2. Anchor Watch
3. Systems

Media control is a later, independent package because KIP 4.8 has no standard
media widget and the Raspberry Pi media API has not been finalised.

## Verified Starting Point

Live checks on `pi@192.168.1.100` on 2026-07-25 established:

- Signal K `2.13.5`
- KIP `4.8.0`, served by Signal K at `/@mxtommy/kip/`
- server-backed KIP application data under
  `/home/pi/.signalk/applicationData/global/kip/`
- an existing `Krishna` profile with five dashboards
- an existing Signal K backup that contains the KIP configuration

Live data currently available for the prototype includes:

- position, heading, SOG and STW
- depth below keel and below transducer
- apparent and true wind
- AIS targets
- battery A and B values, subject to validation
- Signal K notifications

Not currently present in the live vessel tree:

- solar data
- tank levels
- relay states
- cabin BME280 data
- active anchor-watch state

Absent inputs must display as unavailable. They must not be replaced with
invented values or cached values that appear live.

## Design Boundary

Use stock KIP dashboard and widget behaviour wherever it is a good match.
Initially add no large, monolithic replacement screen.

The likely custom boundary is:

- `Krishna Anchor Situation`: anchor/boat/radius/trail graphic and semantic
  secure, warning, alarm and stale states
- `Krishna Status Card`: reusable compact presentation for multi-path
  conditions and system summaries
- an optional, isolated panel-mode shell change for the persistent status bar
  and three-button bottom navigation

KIP custom widgets are compiled into the Angular application. They therefore
require a maintained KIP fork; they cannot be dropped into the installed KIP
package at runtime.

## Work Packages

### WP1 - Baseline, Data Contract and Rollback

Owner scope: live-instance and configuration agent.

- Export and checksum the current server-backed KIP configuration.
- Keep the existing `Krishna` profile unchanged.
- Define a new `Krishna LVGL` profile and reproducible import/export artifact.
- Map every displayed value to its Signal K path, units, source cadence, stale
  threshold, warning zones and write capability.
- Record missing and suspect paths, particularly battery B current.

Acceptance:

- rollback restores the exact starting configuration;
- every proposed field is classified as live, derived, missing or unresolved;
- no relay or anchor-control path is guessed.

Status on 2026-07-25: baseline backup and live data contract completed. See
`execution-logs/kip-wp1-baseline-2026-07-25.md` and
`docs/kip-lvgl-live-data-contract-2026-07-25.md`. Creation of the new
`Krishna LVGL` profile remains part of WP2 so that WP1 does not mutate active
KIP application data.

### WP2 - Configuration-Only 800 x 480 Prototype

Owner scope: KIP composition agent.

- Create Overview, Anchor Watch and Systems dashboards using stock KIP 4.8
  widgets on KIP's `24 x 24` canvas.
- Use verified navigation, depth, wind, AIS and battery paths.
- Represent unavailable solar, tank, relay, weather and anchor values
  explicitly.
- Apply the closest stock dark/night theme and LVGL-like spacing.
- Keep all controls read-only.

Acceptance:

- all three pages fit at `800 x 480` without scrolling;
- primary values are readable and the centre anchor area is the Overview focal
  point;
- changing dashboards is reliable;
- stale and unavailable data are not presented as current.

Status on 2026-07-25: installed as the separate server-backed `Krishna LVGL`
profile and browser-validated at an explicit `800 x 480` viewport. The
existing `Krishna` profile remains unchanged. See
`execution-logs/kip-wp2-stock-profile-2026-07-25.md`.

### WP3 - Anchor Situation Widget

Owner scope: custom KIP widget agent.

- Fork and pin upstream KIP at the installed `v4.8.0` baseline.
- Build a Host2 widget for the anchor, boat, alarm radius, distance, bearing,
  heading, wind and bounded movement trail.
- Implement semantic secure, warning, alarm, stale and unavailable states.
- Cap visual updates around `1 Hz`.
- Add confirmation flows for consequential anchor actions only after their
  Signal K/plugin contracts are verified.

Acceptance:

- stale GPS can never produce “Anchor secure”;
- angle handling is correct across `0/360` degrees;
- missing, null, out-of-order and reconnect cases are tested;
- the widget remains usable without an internet map.

Status on 2026-07-25: implemented and packaged as the uninstalled release
candidate `4.8.0-krishna.1`. Focused tests, lint, production build and
`800 x 480` inactive/within-state rendering passed. Physical theme and active
Anchor Alarm integration remain required before boat installation. See
`execution-logs/kip-wp3-anchor-widget-2026-07-25.md`.

### WP4 - Semantic Cards and Marine Theme

Owner scope: custom KIP visual-system agent.

- Build a reusable configurable status-card widget.
- Add shared Krishna colour, spacing, typography and state tokens.
- Support compact depth, tide, weather, AIS and relay-summary presentations.
- Preserve KIP night and red-mode compatibility.

Acceptance:

- normal, caution, alarm, stale, unavailable and fault states are visually
  consistent;
- frequently changing numbers do not cause layout movement;
- touch targets and typography remain usable on the physical display.

### WP5 - Systems Composition and Safe Controls

Owner scope: integration and safety agent.

- Compose the final Systems page from battery, solar, tank and relay widgets.
- Add real solar, tank and relay paths only as those sources become available.
- Verify Signal K PUT handlers before enabling any control.
- Require confirmation for configured safety-sensitive loads.

Acceptance:

- rejected or timed-out writes return to reported state and show failure;
- unavailable communications disable controls;
- routine and safety-sensitive controls follow their documented confirmation
  policy.

### WP6 - Persistent Panel Chrome and Physical Validation

Owner scope: KIP shell and visual-validation agent.

- First test a reusable status/navigation widget.
- If necessary, add an opt-in panel-mode shell patch that reserves space for a
  persistent top status bar and bottom Overview/Anchor Watch/Systems controls.
- Keep the patch isolated from KIP data services and normal KIP mode.
- Validate on an actual `800 x 480` browser viewport in day, night and red
  modes.

Acceptance:

- three navigation targets are always visible and approximately `50 px` high;
- current page and alarm state are unambiguous;
- no overlap, scroll or clipped controls;
- an extended soak shows no browser instability or excessive redraw.

### WP7 - Packaging, Deployment and Upgrade Discipline

Owner scope: release agent.

- Build a repeatable KIP package and boat installation process.
- Record the exact upstream tag/commit and Krishna patch series.
- Retain stock KIP and the original `Krishna` profile as rollback paths.
- Add automated unit, lint, build and `800 x 480` screenshot checks.

Status on 2026-07-25: release candidate `4.8.0-krishna.1` was installed on
the boat instance after the user confirmed it was not in navigational use.
The separate `Krishna LVGL` Anchor Watch page now contains the native anchor
widget. Package, server, served-bundle, profile and representative telemetry
checks passed. The exact install command, transient npm replacement window,
fresh backup and rollback boundary are recorded in
`execution-logs/kip-wp3-boat-deployment-2026-07-25.md`. Physical theme review,
active Anchor Alarm validation and an executed rollback rehearsal remain open.

Acceptance:

- a clean environment can reproduce the package and profile;
- rollback is tested rather than assumed;
- each KIP upgrade is visually and functionally validated before boat
  installation.

## Delivery Order

The first tranche is WP1 and WP2. WP3 and WP4 may then proceed in parallel
against the confirmed data contract and static page composition. WP5 depends
on real writable paths. WP6 follows physical review of the three dashboards.
WP7 runs throughout and becomes the release gate.

## Known Risks

- Stock KIP Anchor Watch embeds the Signal K anchor-alarm application and is
  not the native offline anchor graphic shown in the LVGL design.
- The embedded anchor map may require internet access and must not be the sole
  onboard anchor-status presentation.
- Current battery configuration contains suspect mappings and at least one
  implausible live current value; it must not be copied blindly.
- Exact persistent top and bottom chrome will increase the maintenance cost of
  rebasing the KIP fork.
- The ESP32-S3 cannot run KIP. The KIP copy requires a browser-capable display
  driven by the Pi, a tablet or another computer.

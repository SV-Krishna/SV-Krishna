# KIP WP2 Stock Profile Execution Evidence

Date: 2026-07-25
Target: `pi@192.168.1.100`
Signal K: `2.13.5`
KIP: `4.8.0`

## Intent

Install and validate a separate, read-only `Krishna LVGL` KIP profile without
changing the existing `Krishna` profile or enabling consequential controls.

## Rollback Boundary

The source configuration was backed up before this work:

```text
/home/pi/backup-kip-20260725-160640
```

The source and backup SHA-256 values are recorded in
`execution-logs/kip-wp1-baseline-2026-07-25.md`.

## Artifact

```text
config/kip/krishna-lvgl-stock-v1.json
```

The artifact contains:

- Overview: 10 widgets
- Anchor Watch: 5 widgets
- Systems: 7 widgets
- KIP configuration schema version 12
- stock Host2 read-only widget types only
- no Switch Panel, Slider, Autopilot or Anchor Watch iframe
- no enabled Signal K PUT operation
- no battery B current presentation

## Installation

The profile was added to both live KIP application-data aliases:

```text
/home/pi/.signalk/applicationData/global/kip/11.0.0.json
/home/pi/.signalk/applicationData/global/kip/11.99.0.json
```

Profiles after installation:

```text
Defalt
Default
Krishna
Krishna LVGL
```

The original `Krishna` profile retained five dashboards.

Post-install SHA-256 for both updated aliases:

```text
a3f37eca5ff03c350a771713e3f1c9b3784b500662557960b0bbd9b106ab898f
```

Signal K remained `active`; no service restart was required.

## Browser Validation

The initial browser render exposed an incorrect `24 x 12` canvas assumption:
the widgets occupied only the upper half of the KIP display. The artifact,
validator and installed profile were corrected to KIP's `24 x 24` canvas.

The corrected profile passed:

```text
jq empty
jq -e -f config/kip/validate-krishna-lvgl.jq
```

Validated results:

- exactly three dashboards in the required order
- 22 unique widgets
- all dashboards end at grid row 24
- all widgets remain inside the `24 x 24` grid
- approved stock read-only widget types only
- no enabled PUT configuration

Chromium device metrics were explicitly set to an `800 x 480` application
viewport. For all three dashboards:

```text
innerWidth: 800
innerHeight: 480
scrollWidth: 800
scrollHeight: 480
```

There was no document-level scrolling.

Screenshots:

- `execution-logs/kip-lvgl-stock-v1-screenshots/overview-800x480.png`
- `execution-logs/kip-lvgl-stock-v1-screenshots/anchor-watch-800x480.png`
- `execution-logs/kip-lvgl-stock-v1-screenshots/systems-800x480.png`

## Observed Result

- Overview presents live depth, position, AIS, wind/heading, leisure battery
  state of charge and voltage, and starter voltage.
- Anchor Watch presents live position and heading/wind context while clearly
  marking anchor position and alarm data unavailable.
- Systems presents verified battery values and explicitly marks solar, tanks
  and relays unavailable.
- Unavailable subsystems are visually obvious and are not populated with
  fabricated values.

## Remaining Gaps

- The profile has not been made active on the user's existing browser/display.
- Stock KIP does not provide the persistent LVGL status bar and three-button
  bottom navigation.
- A native offline `Krishna Anchor Situation` widget remains WP3.
- The stock visual hierarchy is a useful baseline, not pixel-identical LVGL
  parity.
- Physical touch, day/night readability and extended soak tests remain
  outstanding.

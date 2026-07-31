# Krishna Anchor Situation Widget Design

## Scope

`Krishna Anchor Situation` is a read-only native KIP Host2 widget providing an
offline, north-up view of the anchor, vessel, alarm boundary and recent vessel
trail. It does not load charts or depend on an internet map.

Anchor/radius writes and track clearing remain out of scope until their
authenticated Signal K contracts and confirmation flows are separately
designed. The baseline is KIP `v4.8.0`, commit
`417348d9d5948e17ea9f8c715ab3d37cc3fea555`.

## Host2 Boundary

Scaffold the widget into KIP's `Component` category:

```bash
npm run generate:widget -- \
  --name krishna-anchor-situation \
  --title "Krishna Anchor Situation" \
  --description "Offline anchor boundary, vessel position, trail and status" \
  --icon anchorWatch \
  --register-widget Component
```

Use the standard data route:

```text
SignalKConnectionService -> SignalKDeltaService -> DataService
  -> WidgetStreamsDirective -> Host2 adapter -> pure model -> SVG view
```

Do not subscribe to the full Signal K tree or call the Anchor Alarm plugin
directly. Register all explicit observations in one `effect` and one
`untracked` block. Keep transient values in signals, not in merged runtime
configuration. Disable automatic historical series: the short trail is
transient display state, not a KIP dataset.

## Signal K Paths

Defaults use source `default` and `sampleTime: 1000`.

| Config key | Default path | Type / units | Required | Purpose |
| --- | --- | --- | --- | --- |
| `vesselLatitude` | `self.navigation.position.latitude` | number, deg | yes | Current vessel fix |
| `vesselLongitude` | `self.navigation.position.longitude` | number, deg | yes | Current vessel fix |
| `anchorLatitude` | `self.navigation.anchor.position.latitude` | number, deg | yes | Fixed anchor reference |
| `anchorLongitude` | `self.navigation.anchor.position.longitude` | number, deg | yes | Fixed anchor reference |
| `currentRadius` | `self.navigation.anchor.currentRadius` | number, m | no | Server-calculated distance |
| `maxRadius` | `self.navigation.anchor.maxRadius` | number, m | yes | Alarm boundary |
| `warningRadius` | `self.navigation.anchor.warningRadius` | number, m | no | Warning threshold |
| `headingTrue` | `self.navigation.headingTrue` | rad converted to deg | no | Vessel orientation |
| `windDirectionTrue` | `self.environment.wind.directionTrue` | rad converted to deg | no | Wind arrow |
| `windSpeedTrue` | `self.environment.wind.speedTrue` | m/s converted to knots | no | Wind label |

Do not default to `navigation.anchor.bearingTrue`: the installed plugin defines
that as vessel-to-anchor, while the display requires anchor-to-vessel. Derive
the displayed bearing from the two positions.

The additional event input is Signal K
`notifications.navigation.anchor`. It is not a `DEFAULT_CONFIG.paths` entry:
observe KIP's existing `NotificationsService.observeNotifications()` and
select that exact path. This preserves KIP's notification lifecycle and avoids
inventing an object-valued path type for `WidgetStreamsDirective`.

The installed Anchor Alarm `2.0.1` plugin emits zones as an object value at
`self.navigation.anchor.meta`, not through the normal Signal K metadata/state
channel. Therefore do not assume `currentRadius` carries authoritative zone
state. Consume an actual anchor notification object when present and
independently classify geometry, but never use a client calculation to clear
or acknowledge a server notification. Absence of a notification is not
evidence of a normal state.

Old timestamps on the static anchor position/radius do not make them stale.
GPS freshness comes from the latest valid vessel-position timestamp.

## Pure Geometry and State Model

Place calculations in a framework-independent TypeScript module. It accepts
plain observations and explicit `nowMs`; it must not access Angular, DOM,
timers or Signal K services.

Input includes vessel/anchor positions, vessel and radius timestamps, the
latest explicit anchor notification, radii, heading, wind, trail, `nowMs` and
`gpsStaleAfterMs`. Output includes semantic status/reason, GPS age, distance,
bearing, plot scale, vessel/trail coordinates and optional-element visibility.

Geometry rules:

- Validate latitude `[-90, 90]`, longitude `[-180, 180]`, finite non-negative
  radii and finite angles.
- Project points to local east/north metres around the anchor using a
  short-distance equirectangular projection, including date-line wrapping.
- Calculate distance with `hypot(east, north)` and north-referenced bearing
  with `atan2(east, north)`, normalised to `[0, 360)`.
- Keep the anchor at the SVG origin; plot the vessel at its real scaled
  offset rather than centring it decoratively.
- Scale from the greater of maximum radius and observed plotted distance,
  with about 15% padding and a safe non-zero minimum.
- Clamp only screen coordinates; retain the real displayed distance when the
  vessel lies beyond the plot.

Keep an immutable trail of at most 300 points (five minutes at 1 Hz). Add a
point only from a complete fresh coordinate pair that moved at least `0.25 m`.
Reconnect must not silently clear the trail.

### Status precedence

Use:

```text
inactive | within | warning | critical | stale | unavailable | fault
```

Apply precedence:

1. Impossible coordinates or invalid configured values: `fault`.
2. Missing anchor or no positive maximum radius: `inactive`.
3. Explicit notification state `alarm` or `emergency`: `critical`, even with
   stale GPS.
4. No valid vessel fix: `unavailable`.
5. GPS older than the configured threshold: `stale`.
6. Explicit notification state `warn`, or distance at/above warning radius:
   `warning`.
7. Distance beyond maximum radius without a server alarm notification:
   `critical`, reason `Outside configured radius`; do not claim a server
   alarm.
8. Otherwise: `within`, labelled `Within configured radius`.

Default GPS stale time is five seconds and is configurable. A one-second clock
must update age, so a stopped stream becomes stale without another delta.
Null invalidates a live value; it must never be converted to zero. Retain a
stale last point only as visibly dimmed historical context.

The installed plugin exposes no public enabled/armed boolean. Consequently the
widget must not label `within` as `Anchor secure` or assert that monitoring is
armed. It can say that the current geometry is within the configured radius.

## SVG and Theme

Use a responsive inline SVG with a stable square `viewBox`, separated from the
Host2 adapter. Suggested layers are: background/reference marks, alarm and
warning circles, trail, anchor, rode line, heading-rotated boat, optional wind
arrow, labels/status, and stale/error overlay.

Avoid map tiles, canvas, D3 and continuous animation. Commit SVG changes at no
more than 1 Hz. Any short valid-movement transition must be disabled on first
paint, reconnect, large jumps and reduced-motion preference.

Use only KIP theme roles:

| Meaning | CSS roles |
| --- | --- |
| Background | `--kip-widget-card-background-color`, `--mat-sys-background` |
| Text/line | `--kip-contrast-color`, `--kip-contrast-dim-color` |
| Within radius | `--kip-zone-nominal-color` |
| Warning | `--kip-zone-warn-color` |
| Critical | `--kip-zone-alarm-color`, `--kip-zone-emergency-color` |
| Stale/unavailable | `--kip-grey-color`, `--kip-grey-dim-color` |
| Wind | `--kip-yellow-color` |
| Trail | `--kip-blue-color`, `--kip-blue-dim-color` |

Do not hard-code colour hex values. Always pair status colour with text/icon.
Night, red-only and high-contrast modes must remain legible.

## File-Level Plan in the KIP Fork

- `src/app/widgets/widget-krishna-anchor-situation/krishna-anchor-situation.component.ts`:
  Host2 inputs, complete `DEFAULT_CONFIG`, guarded path observers, filtered
  `NotificationsService` observation, transient signals, one-second commit
  clock and teardown.
- `.../krishna-anchor-situation.component.html` and `.scss`: bind the view
  model and size status/overlays with theme roles.
- `.../anchor-situation.model.ts`: pure validation, projection, distance,
  bearing, scaling, trail and status functions.
- `.../anchor-situation.model.spec.ts`: deterministic model tests.
- `.../anchor-situation-svg.component.ts`, `.svg` and `.scss`: presentational
  SVG without subscriptions or plugin calls.
- `.../krishna-anchor-situation.component.spec.ts`: Host2, timing, null and
  teardown tests.
- `.../README.md`: paths, assumptions, states and configuration.
- `src/app/core/services/widget.service.ts`: schematic-generated component map
  and catalog entry.
- `src/assets/svg/icons.svg`: reuse `anchorAlarmWidget` initially; add a new
  symbol only if the catalog needs to distinguish the offline plot.

Types are widget-local; no cross-package contract or plugin endpoint is
required.

## Acceptance Tests

Pure model:

- Cardinal/diagonal bearings and `359 -> 0` normalisation are correct.
- Distance works at boat scale and across the date line.
- Vessel-at-anchor, outside-radius and zero-safe scaling are deterministic.
- Trail rejects invalid/jitter points and never exceeds 300.
- Explicit server alarm notification remains critical with stale GPS.
- Missing anchor is inactive; missing GPS unavailable; expired GPS stale.
- Null never produces `0,0` or a zero-metre secure result.
- Warning and maximum-radius equality cases are explicit.

Host2 adapter:

- `DEFAULT_CONFIG` includes every path, conversion, source, requirement and
  `sampleTime: 1000`.
- Invalid/incomplete configs do not register bad paths; option changes rewire
  deterministically.
- First valid data can paint immediately; later model commits are no faster
  than 1 Hz.
- Mixed latitude/longitude updates never append a half-old pair.
- Age becomes stale without a new delta.
- Null, reconnect and out-of-order timestamps remain honest.
- Clock and subscriptions are cleaned up on destroy.

Rendering/integration:

- Small Overview and large Anchor Watch sizes do not clip essential labels.
- The `800 x 480` dashboard does not scroll.
- All seven states differ without relying only on colour.
- Day, night, red-only and high-contrast screenshots remain readable.
- Live plugin distance, boundary and state agree with its paths; stopped GPS
  becomes stale within the threshold.
- KIP unit, lint, plugin and production-build gates pass before packaging.

## Verification Still Required

- Activate a watch under safe boat conditions and verify the installed
  Anchor Alarm `2.0.1` path cadence, timestamps and notification lifecycle.
- Verify the `NotificationsService` filtering and removal lifecycle for
  `notifications.navigation.anchor` with the active plugin.
- Choose final Overview and Anchor Watch grid sizes before catalog dimensions.
- Decide whether five minutes of in-memory trail is sufficient.

Until then the widget remains read-only and absent anchor data is shown as
inactive/unavailable rather than synthesising a watch.

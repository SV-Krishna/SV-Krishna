# KIP WP3 Anchor Widget Review Checklist

## Review Boundary

Use this checklist for independent review of the Krishna Anchor Situation
implementation in:

```text
/home/antony-slack/Documents/repos/Kip
```

Baseline commit:

```text
417348d9d5948e17ea9f8c715ab3d37cc3fea555
```

The review is read-only until the implementation agent reports completion and
the coordinating agent authorises a test or fix patch.

Design authorities:

- `docs/kip-krishna-anchor-situation-widget-design.md`
- `docs/kip-anchor-situation-data-contract-2026-07-25.md`
- `docs/kip-anchor-widget-implementation-patterns-2026-07-25.md`

## Source and Scope Checklist

- [ ] Diff is limited to the widget, pure model/SVG component, registration,
      necessary config types/UI, tests and widget documentation.
- [ ] Widget is read-only: no PUT, plugin POST, anchor-setting, alarm-disable
      or track-clear action exists.
- [ ] No direct Anchor Alarm REST call or whole-tree Signal K subscription was
      added.
- [ ] No unrelated live KIP profile, package or boat configuration changed.
- [ ] Source remains pinned to commit `417348d...`.
- [ ] Registration uses an icon that actually exists. The pinned source
      contains `anchorWatch`; it does not contain the design draft's
      `anchorAlarmWidget`.
- [ ] Registration uses the explicitly selected `Component` category.

## Pure Model Checklist

- [ ] Model imports no Angular, DOM, Signal K service or timers.
- [ ] All time-dependent results accept explicit `nowMs`.
- [ ] Latitude is finite and within `[-90, 90]`.
- [ ] Longitude is finite and within `[-180, 180]`.
- [ ] Radii are finite; maximum radius must be positive.
- [ ] Null is never coerced to zero.
- [ ] Longitude difference is wrapped across the date line before projection.
- [ ] Projection uses the anchor as the local origin.
- [ ] Bearing is `atan2(east, north)` and normalised to `[0, 360)`.
- [ ] Real distance remains available when screen coordinates are clamped.
- [ ] Plot scale uses the larger of maximum radius and plotted distance, with
      padding and a safe non-zero minimum.
- [ ] Status precedence exactly matches the design.
- [ ] Static anchor timestamps do not determine GPS freshness.
- [ ] GPS age comes from the latest complete valid vessel-position pair.
- [ ] Warning/max equality semantics are explicit rather than accidental.
- [ ] Trail is immutable, movement-gated and capped at 300 points.
- [ ] Reconnect does not silently erase the trail.

## Deterministic Geometry Vectors

Expected values below use an equirectangular projection with Earth radius
`6,371,000 m`. Use tolerances appropriate for floating-point arithmetic,
for example `±0.02 m` and `±0.02°`.

| Case | Anchor `(lat, lon)` | Vessel `(lat, lon)` | East m | North m | Distance m | Bearing |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Coincident | `(50, -1)` | `(50, -1)` | 0 | 0 | 0 | 0 by convention |
| North | `(50, -1)` | `(50.001, -1)` | 0 | 111.194927 | 111.194927 | 0° |
| East | `(50, -1)` | `(50, -0.999)` | 71.474721 | 0 | 71.474721 | 90° |
| South | `(50, -1)` | `(49.999, -1)` | 0 | -111.194927 | 111.194927 | 180° |
| West | `(50, -1)` | `(50, -1.001)` | -71.474721 | 0 | 71.474721 | 270° |
| North-east | `(50, -1)` | `(50.001, -0.999)` | 71.473978 | 111.194927 | 132.184875 | 32.732136° |
| Date-line east | `(0, 179.999)` | `(0, -179.999)` | 222.389853 | 0 | 222.389853 | 90° |
| Date-line west | `(0, -179.999)` | `(0, 179.999)` | -222.389853 | 0 | 222.389853 | 270° |

Additional angle assertions:

| Input | Expected normalised value |
| ---: | ---: |
| `-1` | `359` |
| `0` | `0` |
| `359` | `359` |
| `360` | `0` |
| `361` | `1` |
| `721` | `1` |

If shortest-angle animation is implemented:

| From | To | Expected signed delta |
| ---: | ---: | ---: |
| 359° | 1° | +2° |
| 1° | 359° | -2° |
| 10° | 190° | explicitly chosen deterministic ±180° |

## Status-Precedence Vectors

Use `gpsStaleAfterMs = 5000`. Distances and radii below are metres.

| Case | Inputs | Expected status and reason |
| --- | --- | --- |
| Invalid coordinate | vessel latitude `91`, notification alarm | `fault`; invalid input wins |
| Invalid radius | max radius `NaN` or negative | `fault` |
| Missing anchor | no anchor position, valid GPS | `inactive` |
| No positive radius | max radius missing or `0` | `inactive` |
| Server alarm with stale GPS | valid anchor/radius, notification `alarm`, GPS age `6000` | `critical`; explicit server alarm |
| Server emergency, no current fix | notification `emergency`, otherwise configured | `critical`; explicit server alarm |
| Missing vessel fix | configured anchor/radius, no alarm | `unavailable` |
| Freshness boundary | GPS age exactly `5000` | not stale because design says older than threshold |
| Stale GPS | GPS age `5001`, no alarm | `stale` |
| Server warning | fresh GPS inside warning radius, notification `warn` | `warning` |
| Warning equality | distance `80`, warning radius `80`, max `100` | `warning` |
| Outside boundary | distance `100.01`, max `100`, no server alarm | `critical`, `Outside configured radius` |
| Maximum equality with warning configured | distance `100`, warning `80`, max `100` | `warning` |
| Maximum equality without warning | distance `100`, no warning, max `100` | `within` if “beyond” remains strict `>` |
| Normal geometry | distance `50`, warning `80`, max `100` | `within`, `Within configured radius` |

The widget must never say `Anchor secure`. The public contract cannot prove
that monitoring is armed.

Notification checks:

- [ ] Only `notifications.navigation.anchor` is selected.
- [ ] `alarm` and `emergency` map to critical.
- [ ] `warn` maps to warning after fault/inactive/critical/stale precedence.
- [ ] Absence or removal of a notification is not interpreted as server
      normal.
- [ ] The client never clears or acknowledges a server notification.

## Trail Vectors

- [ ] First complete, valid, fresh pair appends one point.
- [ ] A `0.249 m` move is rejected.
- [ ] A `0.250 m` move is accepted because the threshold is “at least”.
- [ ] A non-finite coordinate is rejected without mutating existing points.
- [ ] A half-updated latitude/longitude pair is not appended.
- [ ] An out-of-order pair does not move the freshness timestamp backwards.
- [ ] After 301 accepted points, length is 300, the oldest is evicted and the
      newest remains.
- [ ] Reconnect retains existing trail.
- [ ] Null live coordinates stop extension and do not append `(0, 0)`.
- [ ] A stale retained point is visibly historical, not current.

## Host2 Adapter Assertions

### Static contract

- [ ] `id`, `type` and `theme` use required signal inputs.
- [ ] Component uses `ChangeDetectionStrategy.OnPush`.
- [ ] `DEFAULT_CONFIG.supportAutomaticHistoricalSeries` is `false`.
- [ ] All ten path keys from the design are present.
- [ ] Every path uses `source: "default"` and `sampleTime: 1000`.
- [ ] Vessel and anchor coordinates use degrees without accidental
      radians-to-degrees conversion.
- [ ] Heading and wind direction convert radians to degrees.
- [ ] Wind speed converts metres/second to knots.
- [ ] `currentRadius`, `warningRadius`, heading and wind paths are optional.
- [ ] No write-related config property is present.

### Stream lifecycle

- [ ] `runtime.options()` and path entries are guarded before observation.
- [ ] Explicit observations are registered in one effect and one `untracked`
      block.
- [ ] Config changes rely on Host2 stream diffing; subscriptions are not
      scattered through lifecycle methods.
- [ ] No widget-local unit conversion duplicates `UnitsService`.
- [ ] First valid update can render immediately.
- [ ] Subsequent visual commits occur no faster than 1 Hz.
- [ ] One-second age clock makes a stopped stream stale without another delta.
- [ ] Component clock and any scheduled frame are cancelled on destroy.
- [ ] Timestamp handling is deterministic for null and out-of-order updates.

### Complete coordinate-pair rule

- [ ] Latitude and longitude are committed as one logical fix only when both
      are present and valid.
- [ ] A new latitude plus an old longitude does not create a false trail
      point.
- [ ] Pair timestamp is explicitly defined, preferably the later timestamp
      only after both coordinates belong to the same update window.
- [ ] Null in either coordinate invalidates current GPS state immediately.

### Notifications

- [ ] Uses `NotificationsService.observeNotifications()`.
- [ ] Filters the exact anchor notification path.
- [ ] Subscription uses destroy-bound cleanup.
- [ ] Notification removal does not synthesize an authoritative normal state.

## SVG and Accessibility Assertions

- [ ] Anchor stays at SVG origin; vessel uses calculated offset.
- [ ] Alarm radius, optional warning radius, rode, trail, anchor, boat,
      heading and optional wind are distinct stable layers.
- [ ] First paint does not sweep from zero.
- [ ] Reconnect and large jumps do not animate deceptively.
- [ ] Reduced-motion preference suppresses movement animation.
- [ ] Repeated updates do not duplicate SVG nodes.
- [ ] Resize preserves geometry/trail state and essential labels.
- [ ] No hard-coded colour hex values exist in widget TypeScript or SCSS.
- [ ] Every state has text/icon semantics, not colour alone.
- [ ] Default dark, Night, Red-Only and High-Contrast modes remain legible.
- [ ] Small Overview and large Anchor Watch sizes preserve status, distance
      and GPS-age information.

## Registration and Configuration Assertions

- [ ] Component import, `_componentTypeMap` and `_widgetDefinition` agree.
- [ ] Selector and class name match generated component metadata.
- [ ] Icon ID resolves from the real `icons.svg`.
- [ ] Minimum/default dimensions match tested dashboard sizes.
- [ ] Plugin dependency choice is explicit; do not require internet map use.
- [ ] Generic path/colour/timeout UI is reused.
- [ ] Any custom nested option group is typed in `widgets-interface.ts`.
- [ ] Missing options from an older saved config receive defaults.
- [ ] Optional empty paths leave the form valid.
- [ ] Config save preserves disabled/non-configurable raw values.

## Test Runner and Environment

KIP uses:

```text
@angular/build:unit-test
Vitest
jsdom
src/test.ts
```

Confirmed focused options from the installed Angular builder schema:

```sh
ng test --watch=false \
  --include='**/krishna-anchor-situation*.spec.ts'

ng test --watch=false \
  --filter='Krishna Anchor Situation'
```

`--include` selects files relative to the project root. `--filter` is a
regular expression applied to suite/test names. Release gates remain:

```sh
npm test
npm run lint
npm run build:all
```

Use the coordinated runtime:

```sh
PATH=/home/antony-slack/.local/share/node-v22.23.1/bin:$PATH
```

Node `22.23.1` and npm `10.9.8` were verified. `npm ci` was coordinated and
rerun under this runtime. Directly requiring
`@rollup/rollup-linux-x64-gnu` still fails, so the actual focused
test/build commands must establish whether this optional-package condition
affects the builder. Do not repair dependencies or delete `node_modules`
again without coordination.

## Review Outcome Template

Record each finding with:

```text
Severity: blocking | important | minor
File and line:
Observed:
Expected:
Evidence/test vector:
Recommended correction:
```

Approval requires:

- all safety/status precedence vectors passing;
- all geometry/date-line/trail vectors passing;
- Host2 and notification lifecycle covered;
- no write path;
- focused tests, full tests, lint and production/plugin build green in a
  supported Node environment;
- unresolved live-plugin behaviour clearly labelled rather than inferred.

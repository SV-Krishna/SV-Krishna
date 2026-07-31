# KIP WP3 Krishna Anchor Situation Widget

Date: 2026-07-25
KIP baseline: `v4.8.0` / `417348d9d5948e17ea9f8c715ab3d37cc3fea555`
Development branch: `krishna/v4.8-lvgl-dashboard`
Release candidate: `4.8.0-krishna.1`

## Intent

Build a native, read-only KIP anchor-situation widget that works without map
tiles and follows the LVGL dashboard hierarchy.

No KIP package was installed on the boat during WP3.

## Development Environment

Sibling checkout:

```text
/home/antony-slack/Documents/repos/Kip
```

The Angular 21 toolchain requires Node `>=20.19`. The local build used Node
`22.23.1` and npm `10.9.8`. The Node archive was verified against the official
SHA-256 manifest before extraction.

## Implemented Behaviour

- Standard KIP Host2 widget registered in the `Component` category.
- Existing `anchorWatch` catalog icon reused.
- Ten explicit Signal K paths observed at a one-second sample rate.
- Anchor notifications consumed through `NotificationsService`.
- No Signal K PUT, plugin POST or anchor-control operation.
- Date-line-safe local projection and north-referenced bearing.
- Real boat-to-anchor offset, alarm radius, optional warning radius, heading,
  wind and bounded trail.
- Maximum 300 trail points, with a `0.25 m` movement threshold.
- Trail collection begins only with a complete anchor reference and positive
  radius.
- A genuinely changed anchor reference starts a new trail; a temporary
  disconnect does not.
- GPS becomes stale after five seconds without a current coordinate pair.
- Mismatched latitude/longitude timestamps are rejected.
- Null inputs are never converted to zero.
- Statuses: inactive, within, warning, critical, stale, unavailable and fault.
- Nominal geometry says `Within configured radius`; it does not claim the
  server alarm is armed.
- Responsive inline SVG and KIP theme-role colours; no map, canvas, D3 or
  hard-coded colour values.

## Review Corrections

Independent review found and corrected:

1. A local outside-maximum critical state could be masked by the warning band.
2. Latitude and longitude from mismatched timestamps could form a false
   position.
3. The exact `0.25 m` trail threshold required floating-point tolerance.
4. An unrelated WidgetService hunk could have enabled other electrical
   widgets and was reverted.
5. Browser simulation showed pre-anchor vessel points could distort a later
   anchor plot; trail ownership is now tied to complete anchor geometry.

## Verification

Focused tests:

```text
2 spec files passed
16 tests passed
```

Coverage includes cardinal/date-line geometry, angle normalisation, status
precedence, exact radius boundaries, null and mismatched coordinate pairs,
trail filtering/cap/ownership, Host2 creation and ten observer registrations.

Additional gates:

```text
npm run lint      passed
npm run build:all passed
git diff --check  passed
```

## Visual Validation

The custom development build was rendered with an explicit `800 x 480`
Chromium application viewport.

Evidence:

- `execution-logs/kip-anchor-widget-screenshots/anchor-inactive-800x480.png`
- `execution-logs/kip-anchor-widget-screenshots/anchor-within-simulated-800x480.png`

The inactive screenshot uses live boat navigation/wind data while Anchor Alarm
remains off. The within-radius screenshot uses a temporary browser-only anchor
reference derived near the live position; it did not write coordinate or
anchor state to Signal K.

## Release Candidate

Artifact:

```text
artifacts/kip/mxtommy-kip-4.8.0-krishna.1.tgz
```

SHA-256:

```text
2d86e6e0f4cc46a69b08ff610cbb6adc3055a65c0a467965e630ac62610cd546
```

The tarball was subsequently installed on the non-navigational boat instance
at the user's direction. Deployment evidence is recorded in
`execution-logs/kip-wp3-boat-deployment-2026-07-25.md`.

## Remaining Validation

- Confirm whether the widget should remain hidden when `anchoralarm` is absent.
- Review compact Overview sizing as well as the full Anchor Watch layout.
- Check night, red-only and high-contrast themes on a physical display.
- Activate Anchor Alarm only under safe conditions and verify actual path
  cadence, notifications, reconnect behavior and plugin geometry.
- Rehearse the documented package-plus-configuration rollback before treating
  the custom build as navigation-critical.

# KIP Anchor Situation Data Contract

## Scope and Safety Boundary

This is a read-only audit of the live boat installation at
`pi@192.168.1.100` on 2026-07-25. It covers
`signalk-anchoralarm-plugin` version `2.0.1`.

No anchor action, Signal K PUT, plugin POST, configuration write, state write
or service restart was performed.

The contract distinguishes:

- **live now**: a value path was present in the current Signal K vessel tree;
- **plugin-defined inactive**: the installed code publishes the path only
  after an anchor is dropped or monitoring starts;
- **control only**: an endpoint or PUT handler changes anchor state and must
  not be used by a read-only display;
- **not exposed**: internal plugin state has no supported Signal K value path.

Exact vessel and anchor coordinates must not be written to repository logs or
screenshots.

## Observed Live State

The plugin is enabled, but its persisted runtime state is:

- `on: false`;
- no persisted anchor position;
- no persisted radius.

At the time of inspection:

- `navigation.anchor` did not exist in the live `vessels.self` value tree;
- `notifications.navigation.anchor` did not exist;
- consequently there were no live anchor-value timestamps or sources;
- the authenticated `GET /plugins/anchoralarm/getTrack` endpoint could not be
  read without a Signal K login and returned HTTP `401`;
- the code-defined in-memory track is initialised empty and position
  subscription/tracking is not started when persisted `on` is false.

The correct current display state is therefore **Anchor watch inactive**, not
secure, warning, alarm or fault.

## Plugin-Defined Read Contract

Signal K supplies a server timestamp and source when the plugin emits an
update. The plugin does not insert a custom timestamp in its deltas. Consumers
must use the timestamp attached to each Signal K path rather than assuming all
anchor fields were calculated together.

| Meaning | Signal K path | Unit/value | Production behaviour | Current classification |
|---|---|---|---|---|
| Anchor position | `self.navigation.anchor.position` | `{latitude, longitude, altitude?}` | Emitted when anchor position is set; `altitude` is stored as negative depth when available | Plugin-defined inactive |
| Alarm/swing radius | `self.navigation.anchor.maxRadius` | m | Emitted when a radius is set; `null` when anchor is raised/plugin stops | Plugin-defined inactive |
| Current boat-to-anchor range | `self.navigation.anchor.currentRadius` | m | Despite its name, emitted from the calculated vessel/anchor separation during position checks | Plugin-defined inactive |
| Distance from bow | `self.navigation.anchor.distanceFromBow` | m | Calculated from bow-adjusted vessel position to anchor | Plugin-defined inactive |
| True bearing to anchor | `self.navigation.anchor.bearingTrue` | rad | Rhumb-line bearing from bow-adjusted vessel position to anchor | Plugin-defined inactive |
| Apparent/relative bearing | `self.navigation.anchor.apparentBearing` | rad | Recomputed from vessel position, anchor position and true heading | Plugin-defined inactive |
| Rode length | `self.navigation.anchor.rodeLength` | m | Present only when rode length is supplied/derived; cleared on raise | Plugin-defined inactive |
| Warning radius | `self.navigation.anchor.warningRadius` | m | Emitted only when configured warning percentage is non-zero | Not available with current `warningPercentage: 0` |
| GPS/radius allowance | `self.navigation.anchor.fudgeFactor` | m | Configuration allowance emitted with an active anchor delta | Plugin-defined inactive |
| Alarm zones | `self.navigation.anchor.meta` | object containing `zones` | Emitted as a value path by this plugin when max radius is present; not the normal Signal K metadata channel | Plugin-defined inactive |
| Anchor notification | `self.notifications.navigation.anchor` | `{state, method, message}` | Emitted for drag, warning, missing-position and incomplete-anchor conditions; normal may be emitted when an alarm clears | Plugin-defined inactive |
| Bow anchor height | `self.design.bowAnchorHeight` | m | Emitted with an active anchor delta | Plugin-defined inactive |

There is also a deprecated misspelled path,
`self.design.bowAnchorHight`. New dashboard work must not use it.

### Enabled and Alarm State

There is **no published boolean path** for “anchor watch enabled.” The
plugin's authoritative `state.on` is internal and persisted in
`plugin-config-data/anchoralarm/state.json`, but is not published through the
Signal K vessel API.

There is also no continuously published explicit alarm-state path separate
from `notifications.navigation.anchor`. The notification may be absent before
the first alarm/clear delta. Therefore:

- absence of the notification does not mean `normal`;
- presence of position/radius is useful evidence that an anchor definition
  exists, but is not a formally exposed `enabled` flag;
- a KIP widget cannot claim “Anchor watch active and secure” from the current
  public contract alone.

### Track

Read-only endpoint:

`GET /plugins/anchoralarm/getTrack`

The response is an array of:

```json
{
  "position": {
    "latitude": 0,
    "longitude": 0
  },
  "time": 0
}
```

Coordinates above are schema placeholders, not boat values. `time` is Unix
epoch milliseconds. While monitoring is active, the plugin records at most
one point per minute and retains at most 1,440 points (approximately 24
hours). The track is in memory, is cleared when position watching stops, and
is not persisted across a plugin/service restart.

The endpoint requires authenticated plugin access on this installation.
Browser use may work through the logged-in Signal K session, but a custom KIP
widget must handle HTTP `401`, an empty array and session expiry explicitly.

## Control Contract — Audit Only

These are consequential write operations. They were discovered from the
installed code and documentation but were **not invoked**.

### Standard Signal K PUT handlers

| Handler path | Effect |
|---|---|
| `vessels.self.navigation.anchor.position` | Position object sets anchor position; `null` raises/clears anchor |
| `vessels.self.navigation.anchor.maxRadius` | Sets maximum radius and starts monitoring when position exists |
| `vessels.self.navigation.anchor.rodeLength` | Sets rode length and calculates anchor/radius state |

### Plugin REST endpoints

| Method and endpoint | Effect |
|---|---|
| `POST /plugins/anchoralarm/dropAnchor` | Drops anchor at current bow-adjusted vessel position; optional `radius` |
| `POST /plugins/anchoralarm/setRadius` | Sets a supplied radius or calculates one from current geometry |
| `POST /plugins/anchoralarm/setRodeLength` | Sets rode length/depth and calculated radius |
| `POST /plugins/anchoralarm/setManualAnchor` | Estimates anchor position from manual depth and rode length |
| `POST /plugins/anchoralarm/setAnchorPosition` | Repositions anchor to supplied coordinates |
| `POST /plugins/anchoralarm/raiseAnchor` | Clears anchor and stops monitoring |

WP3 must remain read-only until authentication, access policy, request
validation, confirmation UX, failure recovery and physical on-boat tests are
designed separately.

## Timing and Staleness

When active, the plugin subscribes to vessel position and true heading and
checks anchor geometry from incoming position updates. Its documentation
describes one-second monitoring. Track storage is intentionally reduced to
one point per minute.

Recommended first-widget rules:

| Input/state | Stale rule |
|---|---|
| Anchor position | Configuration-like; retain while active, but never use its age as proof of GPS health |
| Vessel position used for anchor status | stale after 5 s |
| Distance and bearings | stale after 5 s, or immediately when vessel position is stale |
| Max/warning radius | Configuration-like; unavailable when null/missing |
| Notification | Event state; do not infer normal from absence |
| Track latest point | trail is historical; show point age and stop extending when monitoring/GPS is unavailable |

Any stale or missing current GPS position must suppress a “secure” state even
if old distance and radius values remain visible.

## Blockers for the Proposed Anchor Situation Widget

1. There is no public `enabled`/`on` Signal K path.
2. There is no guaranteed initial `normal` notification when watch starts.
3. The track endpoint requires authentication and the current read-only audit
   could not inspect its live payload.
4. The plugin is inactive, so active path cadence, source labels, timestamps,
   reconnect behaviour and actual track response remain unverified on the
   boat.
5. Current configuration has warning percentage `0`, so no warning radius or
   warning band will be produced.
6. The plugin expects `environment.depth.belowSurface` for automatic depth
   calculations, while the live dashboard audit verified below-keel and
   below-transducer paths; below-surface availability must be checked before
   relying on automatic geometry.
7. `navigation.anchor.currentRadius` is semantically a current distance, not
   the configured radius; its name can easily be misinterpreted.
8. The in-memory track is lost on plugin stop/restart and cannot be treated as
   durable history.

Until blockers 1–4 have a tested solution, the KIP copy should present:

- `Inactive` when anchor position and radius are absent;
- `Unavailable` when required GPS/current geometry is stale or missing;
- notification severity only when an actual notification object exists;
- no positive “Secure” claim based solely on missing notification data.

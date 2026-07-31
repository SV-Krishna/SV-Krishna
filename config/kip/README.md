# Krishna LVGL Stock KIP Prototype

`krishna-lvgl-stock-v1.json` is a proposed KIP `4.8.0` configuration-only
prototype for an `800 x 480` browser viewport. It follows the information
hierarchy in `docs/lvgl-marine-dashboard-specification.md` while using only
stock KIP widgets.

This file is a standalone KIP configuration export with the schema
`{app, dashboards, theme}`. It is intentionally not a copy of Signal K's
server-side `11.0.0.json`, which is a map of named configurations. If it is
later installed, save it as a new shared configuration named
`Krishna LVGL`; do not replace the existing `Krishna` configuration.

## Prototype boundaries

- Exactly three dashboards: Overview, Anchor Watch and Systems.
- A `24 x 24` KIP grid is used on every dashboard.
- Only Numeric, Position, AIS Radar, Static Label and Windsteer widgets are
  included.
- All configured paths are read-only observations.
- No Switch Panel, Slider, Autopilot or Anchor Watch iframe is included.
- The anchor, solar, tanks and relays are explicitly labelled unavailable.
- The existing battery B current mapping is deliberately excluded because it
  remains suspect.
- Timeouts are enabled on live telemetry widgets so stale streams do not
  continue indefinitely without KIP's timeout treatment.

The stock Anchor Watch widget embeds the Signal K anchor-alarm application,
which includes consequential controls. A static unavailable panel is used
until the anchor data and action contracts are verified.

## Validate

Run from the repository root:

```sh
jq empty config/kip/krishna-lvgl-stock-v1.json
jq -e -f config/kip/validate-krishna-lvgl.jq \
  config/kip/krishna-lvgl-stock-v1.json
```

The validator checks the KIP configuration version, dashboard names, Host2
wrapper, widget IDs, `24 x 24` bounds, approved widget types and absence of
control-capable widgets or enabled PUT configuration.

This validation establishes structural compatibility only. It does not prove
pixel fit or readability in KIP. Before any installation, import the artifact
into a non-live KIP profile and capture all three pages at exactly
`800 x 480`.

## Read-only server evidence

The schema was checked on 2026-07-25 against the boat's current files under:

```text
/home/pi/.signalk/applicationData/global/kip/
```

The two current KIP file aliases had the same checksum:

```text
e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c  11.0.0.json
e722937c878bda9d0c347a4eb383916a3b5316d2cc299cfdc778005ed3b9e57c  11.99.0.json
```

No server file, KIP configuration or Signal K service was changed while
creating this artifact.

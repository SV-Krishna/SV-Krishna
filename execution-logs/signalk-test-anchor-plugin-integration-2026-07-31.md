# Workstation Signal K Anchor Alarm integration

Date: 2026-07-31

## Scope

Complete preparation steps 1, 2 and 4 for the Anchor Watch sequence and pass
the proposed step-5 values through a controlled workstation-only activation.
No boat Signal K or boat Pi was changed.

## Voice safety hardening

- Removed the hard-coded test-coordinate fallback from
  `src/services/anchorAlarmService.ts`.
- Local position now accepts either a standard position object or paired Signal
  K latitude/longitude leaf nodes, but only with a fresh timestamp.
- If local and remote position are missing or stale, activation fails before
  any plugin write.
- Added a deterministic zero-write fail-closed test.
- Full repository test result: 51 passed, 0 failed.
- Deployed the built `dist/` to Test Pi `admin@192.168.68.203`, restarted only
  `svkrishna.service`, verified it active and confirmed Web UI HTTP response on
  port 8080.
- Existing unrelated Test Pi warnings remain: Influx query HTTP 401 and absent
  ReSpeaker XVF USB device.

## Test Signal K plugin

- Installed `signalk-anchoralarm-plugin@2.0.1` in the persistent
  `svkrishna-signalk` volume.
- Preserved pre-install package configuration and the original simulator source
  under `backups/signalk-test/2026-07-31-pre-anchor-plugin/`.
- Original simulator source SHA-256:
  `2670b60a7d62ca9b7a4a11596246fc4d35503f255e0c90208c3dedaf73396bc5`.
- Enabled Anchor Alarm with an 80% warning boundary, immediate alarm,
  10-second missing-position alarm and no rode-counter automation.
- Extended the workstation simulator reversibly so it can emit a standard
  fixed `navigation.position` object. Depth is a constant 3 m.

## Controlled activation

The first authenticated write attempts failed safely while the simulator still
published a null position. Once API read-back showed a valid fresh position,
the real plugin accepted:

- `dropAnchor` at the synthetic current position;
- `setRodeLength` with `length: 15` and `depth: 3`.

Plugin-owned API read-back and persisted state confirmed:

- watch: `on: true`;
- rode length: `15 m`;
- depth/anchor altitude: `3 m` / `-3 m`;
- maximum horizontal radius: `14.696938456699069 m`;
- warning radius at 80%: `11.757550765359255 m`;
- current radius immediately after drop: `0 m`;
- notification: `normal`, message `Anchor Alarm - Normal`.

The LVGL firmware already subscribes to these standard plugin paths, so the
display is now driven by the real workstation Anchor Alarm outputs rather than
synthetic anchor/radius values.

## Remaining step 5

The proposed controlled boat inputs are depth 3 m and rode 15 m, yielding a
nominal 14.7 m maximum radius before bow height or fudge factor. They have been
proved only on the workstation test plugin. A boat activation still requires
fresh real GPS/depth, explicit confirmation, the boat's actual bow-height and
fudge configuration, and a safe physical test window.

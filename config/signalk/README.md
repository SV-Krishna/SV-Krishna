# Signal K test fixtures

`lvgl-test-simulator.json` is the controlled test fixture used by the native
Waveshare LVGL dashboard. It preserves the existing synthetic SOG and depth
signals and adds synthetic true/apparent wind plus House and Start battery
state-of-charge, voltage, and current. It also emits a synthetic GNSS method
quality heartbeat so the test display can exercise GPS freshness states.
Standard synthetic `navigation.headingTrue`,
`tanks.freshWater.0.currentLevel`, and `electrical.solar.0.panelPower` values
exercise the head-up compass and Vessel Stores bindings.
The solar fixture varies between 8 W and 48 W against the dashboard's
configured 50 W maximum input.

For Anchor Alarm integration review, the fixture emits a fixed synthetic vessel
position and a constant 3 m below-surface depth. Anchor position, current
radius, warning/max radius and rode length are deliberately not simulated: the
test Anchor Alarm plugin is authoritative for those paths. These inputs are for
the isolated workstation feed only and must never be installed on the boat
instance.

The workstation simulator plugin carries a reversible test-only extension for
the `fixedValue` object used by `navigation.position`; its original `index.js`
is preserved in the dated pre-plugin backup. This is required because the
upstream numeric simulator cannot otherwise emit a standard Signal K position
object consumed by Anchor Alarm.

All generated values use standard `vessels.self` Signal K paths and SI units.
They are test data, not observations from boat sensors.

To install it on the local `svkrishna-signalk` test container:

```bash
docker cp config/signalk/lvgl-test-simulator.json \
  svkrishna-signalk:/home/node/.signalk/plugin-config-data/simulator.json
docker restart svkrishna-signalk
```

Take a copy and checksum of the existing `simulator.json` before installation.
Rollback consists of copying that original file back and restarting the
container. Do not apply this fixture to the boat instance.

`anchoralarm-test.json` enables Anchor Alarm 2.0.1 only on the workstation
test Signal K instance. It uses an 80% warning boundary, immediate alarm,
10-second missing-position alarm and no automatic rode-counter activation.
For the controlled review case, 3 m depth and 15 m rode produce a calculated
maximum horizontal swing radius of approximately 14.7 m before any configured
fudge factor; the warning boundary is approximately 11.8 m.

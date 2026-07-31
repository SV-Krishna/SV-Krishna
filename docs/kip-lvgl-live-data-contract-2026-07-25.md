# KIP/LVGL Live Data Contract

## Scope

This is the read-only data contract captured from the live boat Signal K
server at `pi@192.168.1.100` on 2026-07-25. It supports the first
configuration-only KIP copy of the proposed LVGL Overview, Anchor Watch and
Systems screens.

Signal K values are transported in SI units. The display units below are the
presentation units to configure in KIP. Cadences are observed nominal
cadences, not guarantees. Stale thresholds deliberately allow several missed
updates.

## Live and Derived Inputs

| Display value | Signal K path | Signal K unit | Display unit | Source | Nominal cadence | Stale after | Status / notes |
|---|---|---:|---:|---|---:|---:|---|
| Position | `self.navigation.position` | degrees object | decimal degrees | `nmeain.GP` | 1 s | 5 s | Live; hide exact coordinates from screenshots and logs |
| SOG | `self.navigation.speedOverGround` | m/s | kn | `nmeain.GP` | 1 s | 5 s | Live; was near zero alongside |
| COG true | `self.navigation.courseOverGroundTrue` | rad | °T | `nmeain.GP` / derived | 1 s | 5 s | Unresolved while stationary: observed `null`; do not substitute heading |
| Heading magnetic | `self.navigation.headingMagnetic` | rad | °M | `ws.imu-bridge.XX` | 0.5–1 s | 3 s | Live but uncalibrated and known to twitch; label magnetic |
| Heading true | `self.navigation.headingTrue` | rad | °T | `derived-data` | about 1 s | 3 s | Derived from magnetic heading/variation; inherits IMU limitations |
| STW | `self.navigation.speedThroughWater` | m/s | kn | `nmea2000.32` | about 0.57 s | 3 s | Live |
| Depth below keel | `self.environment.depth.belowKeel` | m | m | `nmea2000.32` | about 0.57 s | 3 s | Live; preferred depth value |
| Depth below transducer | `self.environment.depth.belowTransducer` | m | m | `nmea2000.32` | about 0.57 s | 3 s | Live; label datum explicitly if displayed |
| Apparent wind speed | `self.environment.wind.speedApparent` | m/s | kn | `windin.WI` | about 0.88 s | 4 s | Live |
| Apparent wind angle | `self.environment.wind.angleApparent` | rad | ° | `windin.WI` | about 0.88 s | 4 s | Live |
| True wind speed | `self.environment.wind.speedTrue` | m/s | kn | `derived-data` | about 0.88 s | 4 s | Derived |
| True wind angle | `self.environment.wind.angleTrueWater` | rad | ° | `derived-data` | about 0.88 s | 4 s | Derived |
| True wind direction | `self.environment.wind.directionTrue` | rad | °T | `derived-data` | about 0.88 s | 4 s | Derived |
| Magnetic wind direction | `self.environment.wind.directionMagnetic` | rad | °M | `derived-data` | about 0.88 s | 4 s | Derived; numeric stability was separately verified after the 2026-07-25 fix |
| Leisure battery SoC | `self.electrical.batteries.A.capacity.stateOfCharge` | ratio | % | WebSocket battery source | 1 s | 5 s | Live |
| Leisure battery voltage | `self.electrical.batteries.A.voltage` | V | V | WebSocket battery source | 1 s | 5 s | Live |
| Leisure battery current | `self.electrical.batteries.A.current` | A | A | WebSocket battery source | 1 s | 5 s | Live; confirm charge/discharge sign convention |
| Leisure battery power | `self.electrical.batteries.A.power` | W | W | WebSocket battery source | 1 s | 5 s | Live |
| Starter battery SoC | `self.electrical.batteries.B.capacity.stateOfCharge` | ratio | % | WebSocket battery source | 1 s | 5 s | Live but validate SoC meaning |
| Starter battery voltage | `self.electrical.batteries.B.voltage` | V | V | WebSocket battery source | 1 s | 5 s | Live; use this rather than `vin-v` |
| Starter battery current | `self.electrical.batteries.B.current` | A | A | WebSocket battery source | 1 s | 5 s | **Suspect:** live snapshot was approximately `-1280 A`; do not display as trustworthy |
| Starter battery power | `self.electrical.batteries.B.power` | W | W | WebSocket battery source | 1 s | 5 s | Live but cross-check against current before use |
| Starter battery temperature | `self.electrical.batteries.B.temperature` | K | °C | WebSocket battery source | 1 s | 5 s | Live |
| AIS targets | `vessels.*` excluding `self` | mixed | target summary/radar | `nmeain` AIS | event driven | 60 s per target | Live; 20 non-self targets were present during capture |
| Signal K notifications | `self.notifications.*` | object | semantic state/message | multiple | event driven | retain explicit state | Live; never infer normality from a missing notification |

## Missing or Unresolved Inputs

These paths were not present in the live `self` tree. The first KIP profile
must show them as unavailable, or omit them, rather than inventing paths or
values.

| Proposed function | Live classification | First implementation |
|---|---|---|
| Solar voltage/current/power | Missing | Unavailable status card |
| Fresh, grey, black, diesel and LPG tank levels | Missing | Unavailable status card |
| Relay states and writable controls | Missing/unverified | Read-only unavailable summary; no PUT actions |
| Cabin BME280 temperature/humidity/pressure | Missing | Unavailable weather card |
| Tide height/trend | Missing | Unavailable tide card |
| Anchor position, radius, distance, bearing and alarm state | Not active in snapshot | Anchor page may be composed, but must show inactive/unavailable until the Anchor Alarm contract is separately verified |
| Leisure battery temperature | Missing | Omit or unavailable |

## Display Behaviour

- A stale value must remain visually distinct from a live value and show its
  age where practical.
- A `null`, non-numeric, implausible or missing value is unavailable/fault,
  not zero.
- GPS staleness must prevent any `Anchor secure` presentation.
- All values and controls in the first profile are read-only.
- No relay or anchor-control path is authorised by this contract.
- KIP widget sampling may be faster than the source cadence, but it does not
  make the source data fresher.

# Signal K magnetic wind direction repair — 2026-07-25

- Target: `pi@192.168.1.100` (`Krishna`)
- Service: `signalk.service`
- Affected path: `environment.wind.directionMagnetic`

## Cause

Two enabled `signalk-derived-data` calculations wrote to the same path:

- `directionMagnetic2` used `navigation.headingMagnetic` and
  `environment.wind.angleApparent`.
- `directionMagnetic` used `environment.wind.directionTrue` and
  `navigation.magneticVariation`.

The A026 RMC sentences contained empty magnetic-variation fields, producing
`navigation.magneticVariation = null`. The two calculations therefore raced,
alternately publishing a number and `null`.

An eight-second pre-change sample contained 51 readings: 16 numeric and 35
null.

## Changes

- Enabled the derived-data position/WMM calculation for
  `navigation.magneticVariation`.
- Disabled `wind.directionMagnetic2`.
- Kept `wind.directionMagnetic` enabled.
- Added a source priority for `navigation.magneticVariation`:
  - first: `derived-data`
  - second: `nmeain.GP`

The priority prevents empty A026 RMC variation values from overwriting the
position-derived WMM value. It does not suppress any other RMC fields.

## Backups

- `/home/pi/.signalk/plugin-config-data/derived-data.json.pre-wind-direction-20260725-151511`
- `/home/pi/.signalk/settings.json.pre-magvar-priority-20260725-151650`

## Verification

- Signal K restarted and returned `active`.
- Calculated magnetic variation was approximately `-0.0078922 rad`
  (`-0.4522°`) from source `derived-data`.
- Fifteen-second post-change sample:
  - `navigation.magneticVariation`: 70 numeric, 0 null
  - `environment.wind.directionMagnetic`: 70 numeric, 0 null
  - `environment.wind.directionTrue`: 70 numeric, 0 null
- The Signal K TCP connection to the A026 at `192.168.1.99:2000` remained
  established.

## Rollback

Restore both files and restart Signal K:

```bash
cp /home/pi/.signalk/plugin-config-data/derived-data.json.pre-wind-direction-20260725-151511 \
  /home/pi/.signalk/plugin-config-data/derived-data.json
cp /home/pi/.signalk/settings.json.pre-magvar-priority-20260725-151650 \
  /home/pi/.signalk/settings.json
sudo systemctl restart signalk
```

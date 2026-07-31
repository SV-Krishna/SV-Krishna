# SignalK Polar Recorder Ops Log (2026-07-04)

Scope:

- Live boat Pi `206` at `pi@192.168.195.206`
- SignalK `polar-recorder` and `signalk-polar-performance-plugin`
- Dockside investigation while the boat was stationary

## 1) Initial symptoms

- `polar-recorder` UI showed manual recording in progress, but recording state needed verification.
- `/home/pi/.signalk/plugin-config-data/polar-recorder/polar-test-206.json` was not being updated.
- `polar-recorder` logs repeatedly reported `Invalid data due to: STW too low`.
- `signalk-polar-performance-plugin` was not producing a useful apparent performance result in the UI.

## 2) Live plugin state found on Pi `206`

Installed plugins:

- `polar-recorder 1.1.2`
- `signalk-polar-performance-plugin 0.0.59`

Relevant live config at inspection time:

- `polar-recorder` was configured to use:
  - `environment.wind.angleTrueWater`
  - `environment.wind.speedTrue`
  - `navigation.speedThroughWater` from source `nmea2000.32`
  - `navigation.courseOverGroundTrue` from `nmeain.GP`
  - `navigation.headingTrue` from `imu-bridge.XX`
- Dockside live STW from `nmea2000.32` was `0`, which correctly blocked recording.
- `signalk-polar-performance-plugin` had bad source config:
  - `useTWSsource = "environment.wind.speedOverGround"` which is not the expected source-label format
  - `useSOG = false`
  - `useSOGsource = "navigation.speedOverGround"` which was also not the expected source-label format

## 3) Dockside test harness used

To prove whether the recorder itself could work when STW was valid, a temporary simulator-based harness was applied on the live Pi:

- enabled `simulator`
- injected fixed `navigation.speedThroughWater`
- later also injected fixed `navigation.speedOverGround`
- temporarily pointed `polar-recorder` STW source to `simulator.0`
- temporarily pointed `signalk-polar-performance-plugin` SOG source to `simulator.1`

Backups were created before edits in:

- `/home/pi/.signalk/plugin-config-data/simulator.json.bak.*`
- `/home/pi/.signalk/plugin-config-data/polar-recorder.json.bak.*`
- `/home/pi/.signalk/plugin-config-data/signalk-polar-performance-plugin.json.bak.*`

## 4) What the harness proved

With simulated STW present:

- `polar-recorder` `/live-data` started returning valid TWA/TWS/STW values
- `polar-recorder` stopped failing on `STW too low`
- after toggling record in the UI, `polar-test-206.json` began updating again
- SignalK logs showed concrete writes such as:
  - recorded `4.00kt` at various TWA/TWS bins

Conclusion:

- the recorder logic itself was functional
- the primary dockside blocker was absence of valid STW from the live instrument path while stationary

## 5) UI issue found and fixed

The `polar-recorder` web UI at:

- `http://192.168.1.100:3000/polar-recorder/`

had a real frontend bug in:

- `/home/pi/.signalk/node_modules/polar-recorder/public/scripts/main.js`

Observed behavior:

- `NOW` values could appear
- `POLAR` / `Δ STW` could flash briefly and then disappear or fall back to placeholders

Cause:

- websocket `updateLivePerformance` messages were processed before the selected polar file had finished loading
- when the polar file load completed, the page did not recompute the `Δ STW` card from the most recent live values

Fix applied on the live Pi:

- cached the last live `twa`, `tws`, and `stw`
- after `fetchPolarData()` completes, re-ran `updateLivePerformance(...)`

This was a real UI bug and was intentionally left in place after the test harness was removed.

## 6) Wind-source confirmation

The final true-wind values used by the plugins are derived from the dedicated `windin` NMEA0183 connection.

Verified live chain:

- `environment.wind.speedApparent` source: `windin.WI`
- `environment.wind.angleApparent` source: `windin.WI`
- `environment.wind.speedTrue` source: `derived-data`
- `environment.wind.angleTrueWater` source: `derived-data`

Configured SignalK connection:

- `windin`
- type `NMEA0183`
- device `/dev/ttyOP_windin`
- baud `4800`

Practical meaning:

- apparent wind enters SignalK through `windin`
- `derived-data` converts that apparent wind into true-wind values used by `polar-recorder` and the performance plugin

## 7) Final post-test live state restored

After testing, the live Pi was returned to a normal non-simulated state:

- `simulator` disabled
- `polar-recorder` STW source restored to `nmea2000.32`
- `polar-recorder` wind inputs left on the real `derived-data` values
- `signalk-polar-performance-plugin` corrected to:
  - `useTWSsource = "derived-data"`
  - `useSOG = true`
  - `useSOGsource = "nmeain.GP"`
- manual polar recording stopped

Verified live state after rollback:

- `navigation.speedThroughWater = 0` from `nmea2000.32`
- `navigation.speedOverGround` live from `nmeain.GP`
- `environment.wind.speedTrue` and `environment.wind.angleTrueWater` live from `derived-data`
- `polar-recorder` returned to rejecting samples with `STW too low`, which is correct while docked

## 8) Operational conclusion

- `polar-recorder` is functioning correctly when valid STW exists.
- Dockside non-recording was expected because the boat was stationary and live STW from the instrument path was zero.
- The `polar-recorder` page had a separate frontend timing bug, and that bug has been fixed on the live Pi.
- Wind ultimately comes from the dedicated `windin` connection, with `derived-data` providing the true-wind values consumed by the polar tooling.

## 9) Recommended next checks underway

- when sailing again, verify that `navigation.speedThroughWater` from `nmea2000.32` rises cleanly above the recorder threshold
- confirm `polar-recorder` records without any simulator assistance
- confirm the `Δ STW` card remains stable on the live page during actual updates
- if the plugin package is upgraded or reinstalled later, re-apply or upstream the frontend fix because it currently lives inside the installed plugin assets on the Pi

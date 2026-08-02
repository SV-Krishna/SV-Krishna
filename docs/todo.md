# SV Krishna operational to-do list

## Waveshare display reboot robustness and power commissioning

Status: monitor-reset validated on 2026-08-02; cold boots and current draw remain

- The checked-in 8 KiB main-task stack passed five consecutive native-USB
  monitor/reset boots without a panic, watchdog or stack-overflow report.
- Complete five repeated cold-power boots; these require physically removing
  and restoring power and were not performed during the monitor-reset test.
- Confirm each boot reaches display/touch initialization, SD mount, Wi-Fi,
  Signal K subscription, dashboard readiness and presence monitoring without a
  panic, watchdog reset or stack-overflow report.
- Measure actual 5 V current with the display backlight on and off, including
  Wi-Fi activity and LD2410C load, before finalising the enclosure supply and
  fuse.
- Retest the installed no-person interval from the operator's actual departure;
  the current app setting is 1.5 m range with a nominal 15-second delay, but the
  bench acceptance timestamps did not isolate the precise departure time.

Acceptance checks:

- [ ] Five consecutive cold boots complete without restart or stack exhaustion.
- [x] Five consecutive monitor/reset cycles complete without restart or stack
  exhaustion.
- Presence still produces a complete on/off/on backlight cycle after reboot.
- Measured peak and steady-state currents are recorded and remain within the
  selected regulator, wiring and fuse margins.

## Signal K USB-watchdog restart policy and NMEA 2000 recovery

Status: investigation required after live event on 2026-08-01

- Review whether unplugging a required USB/NMEA 2000 device should restart the
  whole Signal K server while the device is deliberately absent.
- Remove or mitigate the observed race in which the watchdog restarted Signal K
  before `/dev/ttyOP_nmea2000` returned, then did nothing when the link appeared
  because the required-device check had become healthy.
- Distinguish a missing device node from an adapter that exists and is open but
  supplies no NMEA 2000 traffic; the latter currently leaves stale or absent
  data without triggering recovery.
- Consider a debounce/grace period and a restart only after the device has
  returned, with rate limiting and explicit data-freshness verification.
- Verify recovery using fresh PGN `128259` speed-through-water and depth data,
  not solely by checking the serial symlink.

Acceptance checks:

- A brief deliberate unplug does not cause repeated premature Signal K
  restarts.
- Reconnecting the adapter restores fresh NMEA 2000 data automatically.
- The watchdog reports a present-but-silent adapter separately from a missing
  adapter.
- Polar Recorder regains STW and derived true-wind inputs after recovery.

## IMU magnetometer calibration and heading stability

Status: calibration performed on 2026-08-01; stability and semantics remain

- Revalidate the provisional Z-axis scale with movement that exercises the
  vertical axis; the 2026-08-01 level-vessel swing produced a narrow Z range.
- Validate the calibrated and aligned result against the trusted magnetic
  compass at several headings, not only the `292 deg` alignment heading.
- Add circular heading smoothing and appropriate gyro/magnetometer fusion so
  individual magnetometer samples do not produce abrupt 2 Hz heading changes.
- Correct the IMU publication semantics: publish measured magnetic heading and
  derive true heading using the WMM magnetic variation.
- Review the TCP `10110` NMEA output and remove redundant `HDM`, `HDT`, and
  `VHW` sentence generation after confirming the chart plotter's requirements.

Acceptance checks:

- With the boat stationary, heading does not twitch materially on the Signal K
  data browser or chart plotter.
- A slow full turn produces a continuous heading through north without a jump.
- Calibrated magnetic heading agrees with the trusted boat compass within an
  agreed tolerance.
- `navigation.headingMagnetic` has one authoritative live source.
- `navigation.headingTrue` equals magnetic heading adjusted by the calculated
  magnetic variation.
- The TCP `10110` stream contains only the heading sentences required by the
  chart plotter.

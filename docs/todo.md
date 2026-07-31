# SV Krishna operational to-do list

## IMU magnetometer calibration and heading stability

Status: deferred until the boat can be moved

- Swing the boat slowly through at least one complete 360° turn in calm, open
  water while collecting ICM-20948 magnetometer samples.
- Calculate and save hard-iron offsets and per-axis scale corrections.
- Compare the calibrated result with a trusted magnetic compass heading and
  apply only the remaining alignment offset.
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

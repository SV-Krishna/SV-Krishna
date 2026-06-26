# IMU Bridge (Calibrate + Publish to SignalK)

This bridge sits between an IMU producer and SignalK.

It accepts roll/pitch/heading samples, applies basic calibration offsets, and writes calibrated values to SignalK paths.

## Paths published

- `navigation.attitude` (`roll`, `pitch`, `yaw` in radians)
- `navigation.headingMagnetic` (radians)
- `navigation.headingTrue` (radians)

## Run

```bash
cd /opt/svkrishna/app
npm run imu-bridge
```

Default listen address:

- `http://0.0.0.0:8091`

## Environment

- `IMU_BRIDGE_HOST` (default `0.0.0.0`)
- `IMU_BRIDGE_PORT` (default `8091`)
- `IMU_BRIDGE_STATE_PATH` (default `/opt/svkrishna/state/imu-bridge-calibration.json`)
- `IMU_BRIDGE_SIGNALK_URL` (default `http://127.0.0.1:3000`)
- `IMU_BRIDGE_SIGNALK_TOKEN` (optional static JWT)
- `IMU_BRIDGE_SIGNALK_USERNAME` (optional; used to fetch JWT via `/signalk/v1/auth/login`)
- `IMU_BRIDGE_SIGNALK_PASSWORD` (optional; used with username above)
- `IMU_BRIDGE_MIRROR_SIGNALK_URL` (optional second SignalK target, for example `203`)
- `IMU_BRIDGE_MIRROR_SIGNALK_TOKEN` (optional static JWT for mirror target)
- `IMU_BRIDGE_MIRROR_SIGNALK_USERNAME` (optional mirror username)
- `IMU_BRIDGE_MIRROR_SIGNALK_PASSWORD` (optional mirror password)

Notes:

- Current implementation publishes deltas via SignalK websocket stream (`/signalk/v1/stream?subscribe=none&token=...`).
- JWTs are cached in-memory and refreshed on auth failure.
- A persistent websocket connection is reused for lower churn.

## API

### `GET /health`

Returns service status, current calibration and target URLs.

### `GET /calibration`

Returns current offsets in degrees:

```json
{
  "rollOffsetDeg": 0,
  "pitchOffsetDeg": 0,
  "headingOffsetDeg": 0
}
```

### `POST /calibration`

Patch offsets:

```json
{
  "rollOffsetDeg": -0.7,
  "pitchOffsetDeg": 0.4,
  "headingOffsetDeg": 2.3
}
```

### `POST /calibration/zero`

Set offsets from a current raw reading.

`targetHeadingDeg` defaults to `0` if omitted.

```json
{
  "rollDeg": 1.2,
  "pitchDeg": -0.8,
  "headingDeg": 74.5,
  "targetHeadingDeg": 72.0
}
```

### `POST /sample`

Send one IMU sample in degrees:

```json
{
  "rollDeg": 1.2,
  "pitchDeg": -0.8,
  "headingDeg": 74.5,
  "source": "imu-gpio"
}
```

This applies calibration and publishes to SignalK.

## Operational notes (live `206`)

- SignalK write paths for `navigation.attitude`, `navigation.headingMagnetic`, `navigation.headingTrue` require auth.
- Bridge is configured to use dedicated SignalK user `imu-bridge` (readwrite).
- On `206`, service unit and env are:
  - `/etc/systemd/system/imu-bridge.service`
  - `/home/pi/svkrishna/app/imu-bridge.env`

### `GET /latest`

Returns last sample/delta and publish result.

## Example curl flow

```bash
curl -sS http://127.0.0.1:8091/health

curl -sS -X POST http://127.0.0.1:8091/calibration \
  -H "Content-Type: application/json" \
  -d '{"headingOffsetDeg":1.8}'

curl -sS -X POST http://127.0.0.1:8091/sample \
  -H "Content-Type: application/json" \
  -d '{"rollDeg":0.6,"pitchDeg":-0.3,"headingDeg":81.2,"source":"imu-gpio"}'
```

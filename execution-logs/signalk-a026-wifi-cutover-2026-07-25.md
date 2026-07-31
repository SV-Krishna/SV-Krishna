# Signal K A026 Wi-Fi cutover — 2026-07-25

- Target: `pi@192.168.1.100` (`Krishna`)
- A026 endpoint: `192.168.1.99:2000`
- A026 MAC: `84:0D:8E:A2:C9:A5`
- Router: TP-Link TL-MR6400 at `192.168.1.1`

## Changes

- Reserved `192.168.1.99` for the A026 MAC on the router.
- Replaced the Signal K `nmeain` serial transport (`/dev/ttyOP_nmeain`,
  38400 baud) with a TCP client transport to `192.168.1.99:2000`.
- Kept the provider ID `nmeain` so existing source selectors remain stable.
- Left the separate `nmea2000`, `windin`, and `nmeaout` providers unchanged.
- The A026 USB cable remains connected to the powered Waveshare USB hub
  because it supplies power to the A026. Its USB serial interface may still
  enumerate on the Pi, but Signal K no longer opens or consumes that interface.
- Created rollback backup:
  `/home/pi/.signalk/settings.json.pre-a026-wifi-20260725-145943`.

## Verification

- Router reboot observed; router and A026 returned reachable.
- Signal K service restarted and reported `active`.
- Signal K process held an established TCP connection from
  `192.168.1.100` to `192.168.1.99:2000`.
- `/signalk/v1/api/sources` showed advancing `nmeain.GP` timestamps for
  `RMC`, `VTG`, `GGA`, `GSV`, and `GLL`.
- `/signalk/v1/api/sources` showed advancing `nmeain.AI` `VDM` timestamps.
- Vessel position and speed-over-ground were live from `nmeain.GP`.
- The active `nmeain` configuration no longer references
  `/dev/ttyOP_nmeain`.
- Keeping the A026 USB cable connected for power does not create a duplicate
  Signal K data path.

## Rollback

Restore the timestamped settings backup and restart Signal K:

```bash
cp /home/pi/.signalk/settings.json.pre-a026-wifi-20260725-145943 \
  /home/pi/.signalk/settings.json
sudo systemctl restart signalk
```

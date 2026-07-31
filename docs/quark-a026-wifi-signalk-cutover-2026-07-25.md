# Quark-Elec A026 Wi-Fi and Signal K cutover

Date: 2026-07-25
Status: deployed and verified on the boat

## Purpose

Move the Quark-Elec A026 GPS/AIS/NMEA 0183 input into Signal K from an
unreliable USB serial data path to a stable TCP connection over the boat LAN.

The USB cable remains connected because it supplies power to the A026 from the
powered Waveshare USB hub. It is no longer the Signal K data path.

## Network and hardware state

| Component | Address or identity | Role |
| --- | --- | --- |
| TP-Link TL-MR6400 | `192.168.1.1` | Boat LAN router |
| Raspberry Pi `Krishna` | `192.168.1.100` | Signal K server |
| Quark-Elec A026 | `192.168.1.99` | GPS/AIS/NMEA 0183 TCP server |
| A026 MAC address | `84:0D:8E:A2:C9:A5` | Router reservation identity |
| A026 NMEA endpoint | TCP port `2000` | Signal K input stream |

The router DHCP pool is `192.168.1.100–192.168.1.199`. The A026 address
therefore sits outside the dynamic pool. An enabled router address reservation
also maps the A026 MAC address to `192.168.1.99`.

The router was rebooted after adding the reservation. It returned successfully,
and the A026 remained available at `.99` with live NMEA data on port `2000`.

## Previous Signal K path

The Signal K provider had this logical shape:

```text
A026 USB serial
  -> /dev/ttyOP_nmeain
  -> 38400 baud
  -> Signal K provider nmeain
```

This path was vulnerable to erratic USB connection behaviour. Repeated serial
disconnects and reconnect attempts could contribute to the previous Signal K
failure cycle.

## Current Signal K path

The active path is now:

```text
A026 Wi-Fi station
  -> boat LAN
  -> TCP 192.168.1.99:2000
  -> Signal K provider nmeain
```

The active `nmeain` connection retains:

- provider ID `nmeain`
- NMEA 0183 checksum validation
- the existing `myNMEA0183InputEvent` output event

It now uses:

- transport type `tcp`
- host `192.168.1.99`
- port `2000`
- no-data timeout of 30 seconds

The obsolete `device` and `baudrate` fields were removed from the active
`nmeain` configuration.

Keeping the provider ID unchanged preserves existing source identities,
including:

- `nmeain.GP`
- `nmeain.AI`

This avoids changes to consumers such as the polar-performance and
polar-recorder configuration.

## USB power and enumeration

The A026 USB cable must remain connected to the powered Waveshare USB hub
because the A026 draws its power from that connection.

The Pi may continue to enumerate the A026 USB serial interface, and the
`/dev/ttyOP_nmeain` compatibility path may still exist when the device is
present. This does not create duplicate data because the active Signal K
configuration does not open or consume that serial interface.

The distinction is:

- USB remains physically connected for power.
- Signal K is logically connected to the A026 only over TCP.

The old Quark-specific serial reconnect loop should therefore no longer be
possible. A broader USB power, hub, cable or bus failure can still affect the
other USB-backed Signal K providers.

The following providers remain deliberately unchanged:

- `nmea2000` on `/dev/ttyOP_nmea2000`
- `windin` on `/dev/ttyOP_windin`
- `nmeaout` on `/dev/ttyOP_nmeaout`

## Live verification

The following checks passed after the Signal K restart:

- `signalk.service` returned `active`.
- The Signal K Node process held an established TCP socket from
  `192.168.1.100` to `192.168.1.99:2000`.
- `nmeain.GP` timestamps advanced for `RMC`, `VTG`, `GGA`, `GSV`, and `GLL`.
- `nmeain.AI` timestamps advanced for AIS `VDM`.
- Vessel position was live from `nmeain.GP`.
- Speed over ground was live from `nmeain.GP`.
- Existing polar processing continued to consume `nmeain.GP`.
- The active `nmeain` settings contained no `/dev/ttyOP_nmeain` reference.

No AIS targets happened to be required for the transport test: advancing
`nmeain.AI` `VDM` timestamps confirmed that AIS sentences were being received
and parsed.

## Failure behaviour

If Wi-Fi or the A026 TCP service is briefly interrupted, the installed Signal K
TCP provider reconnects automatically. Its reconnect delay is capped at
approximately five seconds. The configured 30-second no-data timeout also
causes a silent/stale socket to be closed and re-established.

This is materially safer than repeatedly opening an unstable USB serial device,
but it does not remove every possible failure:

- loss of A026 power stops both GPS and AIS input
- loss of boat Wi-Fi interrupts the TCP path
- a general powered-hub or Pi USB-bus fault may still affect the other serial
  and NMEA 2000 providers
- another independently configured process could still open the A026 USB
  serial interface

At the time of cutover, no other service was configured to consume the A026 USB
serial interface.

## Recovery and rollback

A copy of the previous live Signal K settings was created at:

```text
/home/pi/.signalk/settings.json.pre-a026-wifi-20260725-145943
```

To restore the previous USB serial configuration:

```bash
cp /home/pi/.signalk/settings.json.pre-a026-wifi-20260725-145943 \
  /home/pi/.signalk/settings.json
sudo systemctl restart signalk
systemctl is-active signalk
```

Rollback should only be used if the TCP path cannot be recovered. After a
rollback, verify that `/dev/ttyOP_nmeain` exists before expecting the legacy
provider to start.

## Recommended follow-up

- During the next sailing session, confirm sustained GPS continuity.
- Confirm AIS targets appear normally when traffic is present.
- If Signal K becomes unstable again, distinguish TCP `nmeain` errors from
  faults affecting the remaining USB providers.
- Keep the A026 USB cable connected for power.

The concise command evidence is retained in
`execution-logs/signalk-a026-wifi-cutover-2026-07-25.md`.

# SignalK USB Instability Ops Log (2026-05-26)

Scope:

- Live Pi `206` (`pi@192.168.195.206`)
- NMEA provider instability during sailing
- Recovery/mitigation actions and outcomes

## 1) Symptoms observed

- SignalK providers repeatedly reporting not connected:
  - `nmea2000`
  - `nmeain`
  - `windin`
  - `nmeaout`
- Frequent serial open failures:
  - `No such file or directory, cannot open /dev/ttyOP_*`
  - `Cannot lock port`
- In one event, Pi required hard power cycle.

## 2) Root-cause evidence from logs

Kernel logs (notably May 23 and May 25) showed USB transport faults:

- repeated `error -71`
- USB hub branch resets / disconnect / re-enumeration
- messages such as:
  - `Cannot enable. Maybe the USB cable is bad?`
  - `unable to enumerate USB device`

SignalK side effects during these bursts:

- provider reconnect loops and repeated open failures
- `MaxListenersExceededWarning` accumulation
- one observed `heap out of memory` crash during a severe fault period

Conclusion:

- primary cause is physical USB instability (lead/hub branch)
- secondary amplification is software reconnect churn under prolonged device flapping

## 3) Hardware intervention

During testing on `2026-05-25`, a defective USB lead was identified and replaced.

Post-change interpretation:

- USB fault storm significantly reduced versus pre-replacement windows
- serial topology and `/dev/ttyOP_*` availability became recoverable after reboot/rescan

## 4) Programmatic mitigation deployed

Deployed watchdog on `206`:

- `/home/pi/svkrishna/bin/usb_serial_watchdog.sh`
- `/etc/systemd/system/svkrishna-usb-watchdog.service`
- `/etc/systemd/system/svkrishna-usb-watchdog.timer`

Timer cadence:

- every 20 seconds

Current behavior:

- checks required links: `ttyOP_nmea2000`, `ttyOP_nmeaout`, `ttyOP_windin`
- logs optional missing: `ttyOP_nmeain`
- attempts udev rescan and, if still missing with cooldown satisfied, restarts `signalk.service`

## 5) Current caveat

`ttyOP_nmeain` mapping is tied to a specific expected USB identity:

- `idVendor=0483`, `idProduct=5740`, `serial=00000000003A`

If that exact device is absent, `ttyOP_nmeain` will remain missing by design.

## 6) Recommended ongoing checks

```bash
systemctl is-active signalk.service imu-bridge.service imu-sender.service svkrishna-usb-watchdog.timer
ls -l /dev/ttyUSB* /dev/ttyOP_* 2>/dev/null
journalctl -u svkrishna-usb-watchdog.service -n 100 --no-pager
journalctl -u signalk.service -n 200 --no-pager
journalctl -k -n 200 --no-pager
```


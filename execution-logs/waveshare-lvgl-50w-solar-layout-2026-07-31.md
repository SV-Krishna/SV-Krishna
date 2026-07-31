# Waveshare LVGL 50 W solar layout deployment

Date: 2026-07-31

## Scope

Show a complete solar gauge using the vessel's 50 W maximum input, reclaim the
space occupied by the redundant Essential Systems caption, and centre the boat
symbol from the exact plot centre.

## Recovery and environment changes

- Existing full-flash backup remains the ESP32 recovery image.
- Captured the running workstation Signal K simulator before changing it:
  `backups/signalk-test/2026-07-31-pre-50w-solar/simulator.json`
- Backup SHA-256:
  `729b2bf985471a2dbd01132ece06ff07f2c48d7424f6af2817161702dcfd85c7`
- Installed the revised simulator fixture and restarted only the workstation
  `svkrishna-signalk` test container.
- No boat Pi or boat Signal K environment was changed.

## Result

- Vessel Stores was increased from 112 px to 136 px high.
- Solar now has a value and bar; 50 W maps to 100%, with safe clamping above
  or below the range.
- Essential Systems was reduced from 88 px to 64 px and the `Read-only
  overview` caption removed.
- The boat line object now has an explicit symmetric 27 x 30 px box and is
  centred by LVGL within the 236 x 236 px plot.
- Synthetic solar was corrected from the inappropriate 80–420 W range to
  8–48 W.

## Validation

- telemetry state host test with warnings as errors: pass
- Signal K delta host test with warnings as errors: pass
- ESP-IDF 5.5.5 build: pass; image size `0x14f810`, 67% application partition
  free
- workstation Signal K API read-back: `46.211555555555556 W`, within the new
  fixture and display range
- ESP32 flash write and hash verification: pass
- device serial: SD mounted at 30,436 MiB, Wi-Fi connected, Signal K subscribed,
  and complete dashboard telemetry ready
- ten-second post-readiness stability observation: no panic or reset

Status: deployed and serial-validated on the attached ESP32. Precise visual
alignment and clipping still require a new straight-on photograph or user
inspection because serial diagnostics cannot confirm rendered pixels.

## Follow-up deployment: North orbit and 20 NM label

The North marker previously remained a child of the circular plot. It was
reparented to the Anchor Watch panel so it can follow a mathematically fixed
125 px radius from the plot centre without being clipped at the plot boundary.
The calculation now subtracts half the rendered label width and height, making
the centre of the `N` glyph—not its top-left corner—the point on the orbit.

The 20 NM caption was moved four pixels inward and changed to the primary text
colour so it remains visible against the outer band. ESP-IDF build, flash/hash
verification, SD/Wi-Fi/Signal K telemetry readiness and post-readiness stability
all passed. Image size was `0x14f890`, with 67% of the application partition
free. Exact pixel appearance remains subject to physical screen inspection.

The subsequent label-alignment build centres both range captions horizontally
and moves them farther inside their respective circles: 10 NM at plot y=156
and 20 NM at plot y=198. Build (`0x14f8b0`), flash/hash verification, complete
telemetry readiness and post-readiness stability passed.

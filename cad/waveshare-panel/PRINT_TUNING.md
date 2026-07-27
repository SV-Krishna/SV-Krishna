# Waveshare enclosure print tuning

This document records printer- and material-specific findings for the
Waveshare enclosure. It complements the CAD specification; it does not change
the nominal geometry.

## Hardware and material baseline

- Printer: Creality Ender-3 V3 SE
- Nozzle: 0.4 mm brass
- Filament: Creality Hyper PETG, 1.75 mm
- Slicer: Creality Print 7.0.1.4212
- Build plate: confirm the selected plate type before each slice

## Current prototype profile

| Setting | Value |
|---|---:|
| Layer height | 0.20 mm |
| Initial nozzle temperature | 230 C |
| Subsequent nozzle temperature | 220 C; configured, awaiting physical validation |
| Bed temperature | 70 C |
| Normal part cooling | 40-50% after the first three layers |
| Overhang part cooling | Cap at 60% in the user filament profile |
| Retraction | 1.2 mm at 25 mm/s |
| Maximum volumetric flow | 10 mm3/s |
| First-layer speed | 25 mm/s |
| Outer wall speed | 50 mm/s |
| Inner wall speed | 80 mm/s |
| Sparse infill speed | 100 mm/s |
| Top surface speed | 45 mm/s |
| Travel speed | 180 mm/s |
| Walls | 4 |
| Top and bottom layers | 5 |
| Infill | 30% gyroid |
| Slicer Z offset | 0; use the printer's CR Touch calibration |

## 2026-07-27 bezel prototype observation

### Verified in the generated G-code

- The fan starts at 0%.
- Cooling remains disabled for the first three layers.
- At Z=0.8 mm, the G-code issues `M106 S102`, approximately 40%.
- Detected overhang regions issue `M106 S229`, approximately 90%, inherited
  from the system Generic PETG profile.
- The G-code uses 230 C for the first layer and 225 C thereafter.
- The corrected bezel occupies X=4-216 mm on the nominal 220 mm bed.

### Observed at the physical printer

- The printer reported and operated at 0% fan after cooling should have
  started.
- Significant fine stringing or wisps were visible during the print.
- The operator manually changed the fan to 60%.

This means the observed 0% fan cannot be explained solely by the generated
G-code. Future prints must verify that the part-cooling fan is physically
turning after the third layer; the value shown in the slicer is not sufficient
evidence that the printer applied the command.

### In-print response

- Set the physical printer's part-cooling fan to 60%.
- Reduce the nozzle to 220 C if extrusion and layer bonding remain clean.
- If stringing remains heavy, 215 C may be tested cautiously.
- Do not reduce flow to address stringing.
- Do not change global print speed solely to address stringing.

Stop reducing temperature and return to 220-225 C if the extruder clicks,
walls show gaps, lines become rough, or layer bonding deteriorates.

## User-profile correction applied 2026-07-27

The custom Hyper PETG filament profile inherits these values from Creality
Print's system Generic PETG profile:

```json
"enable_overhang_bridge_fan": "1",
"overhang_fan_speed": "90"
```

The system profile was left unchanged because Creality Print may replace it
during an update. The following override was added to the local custom Hyper
PETG profile:

```json
"enable_overhang_bridge_fan": "1",
"overhang_fan_speed": "60"
```

This records the configured state, not a validated physical result. The next
slice and print must confirm:

- fan off for only the intended opening layers;
- normal cooling command after layer three;
- no fan command above 60%;
- expected nozzle and bed temperatures;
- the complete model remains within the printable area.

## Before the next enclosure part

1. Dry the PETG according to the spool manufacturer's instructions. Moisture
   is a common cause of PETG stringing and cannot be corrected reliably by
   cooling alone.
2. Run CR Touch levelling and verify the first layer without adding a slicer
   Z offset.
3. Confirm the fan physically starts after the third layer.
4. Print a small temperature and retraction test before another full-size
   enclosure component.
5. Treat 220 C, 60% maximum cooling, and 1.2 mm at 25 mm/s retraction as the
   next test baseline, not as final validated values.

## 2026-07-27 bezel prototype result

**Observed:** The corrected 212 x 142 mm bezel completed printing and was
reported as looking good.

The current observation confirms successful completion and acceptable initial
appearance only. Display fit, mounting-hole alignment, radar performance,
gasket-groove fit, dimensional accuracy, warping, stringing after cleanup, and
surface finish have not yet been recorded as physically verified.

**Next step:** Review and slice `carrier.stl`. Before committing to the full
assembly, test the printed bezel against the physical display and record the
remaining fit measurements above.

## 2026-07-27 carrier slice review

**G-code verified:** `carrier.stl` was sliced in Creality Print 7.0.1.4212
using the Ender-3 V3 SE 0.4 mm and custom Hyper PETG profiles.

| Property | Sliced result |
|---|---:|
| Footprint | X=18-202 mm, Y=50-170 mm |
| Maximum height | 12.0 mm |
| Layers | 60 at 0.20 mm |
| Estimated time | 8299.91 s (about 2 h 18 min) |
| Estimated filament | 14.12115 m (about 43 g at 1.27 g/cm3) |
| Supports | Disabled |
| Brim | Disabled |
| Initial temperatures | 230 C nozzle, 70 C bed |
| Subsequent nozzle temperature | 225 C |
| Normal cooling | 40% |
| Maximum cooling command | 60% (`M106 S153`) |
| Retraction | 1.2 mm at 25 mm/s |
| Slicer Z offset | 0 |

No outside-bed, floating-part, collision, empty-layer, or slicing-completion
warning was found. The carrier is oriented with its frame and rails on the
bed; the four vertical standoffs and through-holes do not require generated
support.

**Configuration amendment applied:** The subsequent nozzle temperature was
changed from 225 C to 220 C because the bezel print produced significant
stringing or wisps at the hotter baseline. The carrier must be resliced before
printing; the G-code values in the table above describe the superseded slice.
No carrier geometry change was justified by the slice review, so the validated
CAD was preserved.

For the next print, confirm physically that the part-cooling fan starts after
layer three and reaches the requested value; the previous bezel print remained
at 0% despite non-zero commands in its G-code. Dry the PETG before printing if
that has not already been done.

### Carrier reslice verification

**G-code verified 2026-07-27:** The carrier was resliced after the temperature
amendment. The replacement G-code contains 230 C for the first layer, 220 C
thereafter, 70 C bed temperature, 40% normal cooling, and no fan command above
60% (`M106 S153`). Retraction remains 1.2 mm at 25 mm/s and slicer Z offset
remains 0.

The reslice retains the 184 x 120 x 12 mm envelope, 60 layers, disabled
supports, disabled brim, approximately 2 h 18 min estimate, and 14.12115 m
filament estimate. No outside-bed, collision, floating-part, or empty-layer
warning was found. This verifies the replacement G-code configuration; the
220 C setting and printer fan response still await physical validation.

### Carrier prototype result

**Observed 2026-07-27:** The carrier completed printing and was reported as
printing very well. This physically validates the revised 220 C post-first-
layer temperature as producing a good initial carrier result with the current
Hyper PETG profile.

Fit of the four display standoffs, M3 holes, support rails, and six bezel
clamping positions against the physical display and printed bezel has not yet
been recorded. Complete those checks before treating the carrier geometry as
dimensionally validated.

**Next main enclosure part:** Review and slice `rear_box.stl`, followed by
`service_cover.stl`. Print the smaller radar clip and BME280 pod components
after their physical modules have been measured.

## Documentation policy for this CAD

- Keep geometry parameters and their rationale in the `.scad` source.
- Keep build and export instructions in `README.md`.
- Record printer/material behaviour and dated print observations here.
- Distinguish physical observations, G-code verification, and proposed tuning;
  do not present an untested recommendation as a validated result.
- Preserve reproducible profile values, but do not commit credentials,
  machine secrets, transient `/tmp` files, or user-specific application state.
- Update this record after each meaningful prototype, including failed prints.

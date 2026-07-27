# Waveshare boat-panel enclosure handover

Date: 2026-07-27

Repository: `SV-Krishna/SV-Krishna`

Working branch: `feature/lightweight-llm-poc`

## Outcome

A parametric OpenSCAD prototype was created for the Waveshare ESP32-S3
7-inch boat-panel enclosure. The front bezel and display carrier have been
printed successfully in Creality Hyper PETG. Work must pause before printing
the rear electronics box because the carrier-to-box mechanical attachment is
not yet designed.

## Source design

The CAD was derived from these files on branch
`agent/boat-information-media-panel-design`:

- `docs/Dimensioned_3D_Printed_Enclosure_Specification_v0.1.md`;
- `docs/Boat_Information_Media_Control_Panel_System_Design_v1.md`;
- `docs/Custom_Interface_PCB_Handover_Note.md`;
- `docs/images/boat-panel-enclosure-reference.svg`.

The source dimensions are explicitly provisional. Physical display, sensor,
connector, panel, and cable measurements remain authoritative.

## Repository layout

- `AGENTS.md`: mandatory documentation, validation, safety, and Git workflow.
- `waveshare_panel_enclosure.scad`: parametric CAD source.
- `render.sh`: exports every STL and the assembly preview.
- `output/`: current generated STL files and assembly PNG.
- `README.md`: build, rendering, and prototype instructions.
- `PRINT_TUNING.md`: dated G-code and physical-print evidence.
- `profiles/`: portable snapshots of the working Creality Print presets.
- `../../tools/openscad/`: checksum-verified local OpenSCAD installer.

## Current part envelopes

| Part | Exported envelope | Status |
|---|---:|---|
| Front bezel | 212 x 142 x 3 mm | Printed; initial appearance good |
| Display carrier | 184 x 120 x 12 mm | Printed very well |
| Cabin-panel cut-out | 170 x 102 mm | Modelled; do not cut yet |
| Rear electronics box | 168 x 100 x 38 mm | Modelled; blocked from printing |
| Service cover | About 167.2 x 99.2 mm | Not printed |
| Radar clip | Module-dependent | Not printed |
| BME280 pod and cover | Module-dependent | Not printed |

The intended size progression is deliberate:

1. The 212 x 142 mm bezel overlaps the 170 x 102 mm cut-out.
2. The 184 x 120 mm carrier is larger than the cut-out so it can clamp the
   cabin panel from the rear.
3. The 168 x 100 mm rear box is nominally 1 mm clear of each cut-out edge.

## Geometry changes already made

- Reduced bezel width from 216 to 212 mm for 4 mm nominal clearance at each
  side of the Ender-3 V3 SE bed.
- Preserved 21 mm bezel overlap per side around the 170 mm panel cut-out.
- Corrected the LD2410C pocket from a trapped internal void to a rear-open
  recess with a 1.5 mm front radar membrane.
- Added structural rails tying the four display standoffs into the carrier.
- Corrected the service-cover ventilation-loop generation.
- Added a 70 x 40 mm interface-PCB placeholder mounting pattern, strain-relief
  bridge, service-cover bosses, sensor parts, and staged test coupons.

## Printed prototype results

### Bezel

The corrected bezel completed printing and was reported as looking good.
During the first bezel run:

- significant wisps/stringing were observed;
- the physical printer remained at 0% fan after G-code requested cooling;
- fan was manually changed to 60%;
- the slice used 225 C after the first layer.

The report does not yet include measured display fit, radar performance,
gasket fit, warping, hole alignment, or dimensional deviation.

### Carrier

The carrier was resliced at 230 C first layer and 220 C thereafter, with a 60%
maximum fan command. It completed printing and was reported as printing very
well.

The report does not yet include measured display-standoff fit, M3 hole fit,
carrier-to-bezel clamping alignment, or interference checks against the real
display PCB and cables.

## Working print profile

Printer and material:

- Creality Ender-3 V3 SE;
- 0.4 mm brass nozzle;
- Creality Hyper PETG, 1.75 mm;
- Creality Print 7.0.1.4212.

Key settings:

| Setting | Value |
|---|---:|
| Initial nozzle temperature | 230 C |
| Subsequent nozzle temperature | 220 C |
| Bed | 70 C |
| Fan-off layers | First 3 |
| Normal cooling | 40-50% |
| Maximum overhang cooling | 60% |
| Retraction | 1.2 mm at 25 mm/s |
| Maximum volumetric flow | 10 mm3/s |
| Layer height | 0.20 mm |
| Walls | 4 |
| Top/bottom layers | 5 |
| Infill | 30% gyroid |
| Outer/inner wall speed | 50/80 mm/s |
| Sparse infill speed | 100 mm/s |
| Travel | 180 mm/s |
| Slicer Z offset | 0 |

Local active presets:

```text
~/.config/Creality/Creality Print/7.0/user/3297777049/
  filament/CRHyperPETG @Creality Ender-3 V3 SE 0.4 nozzle - Copy(1).json
  process/0.20mm Hyper PETG.json
  machine/Creality Ender-3 V3 SE 0.4 nozzle - Copy(1).json
```

Source-controlled snapshots are in `profiles/`.

Important: on the bezel print, the printer did not physically apply the
non-zero fan command when expected. For every future print, check that the fan
actually starts after layer three. Do not rely only on the slicer profile.

## Blocking mechanical issue

The current carrier and rear box have no shared screw pattern, locating lip,
captive nut, heat-set insert, or other positive attachment. The assembly
preview visually stacks them, but it does not define a buildable connection.

Do not print the current `rear_box.stl` as a production prototype.

The next CAD revision must:

1. Choose an assembly direction and service procedure.
2. Add a positive locating lip or register between carrier and rear box.
3. Add four M3 attachment points accessible during assembly.
4. Specify thread retention: heat-set inserts, captive nuts, or tapped
   hardware.
5. Ensure fasteners do not collide with the display mounts, bezel clamps,
   display PCB, ribbons, connector projections, or antenna.
6. Ensure the service cover remains independently removable.
7. Confirm the rear box still passes through the 170 x 102 mm panel cut-out.
8. Render all parts and print an interface coupon before the full rear box.

## Physical verification still required

- Exact Waveshare PCB revision.
- Display glass and rear-plate dimensions with callipers.
- Four display mounting-hole locations.
- Cabin-panel thickness and rear clearance.
- Display connector projections and cable bend radii.
- Carrier fit to display, bezel, and panel cut-out.
- LD2410C dimensions and performance through the 1.5 mm membrane.
- BME280 breakout dimensions.
- Interface PCB dimensions, connector access, and mounting-hole pattern.
- Operating temperature and power consumption in the enclosure.
- Gasket compression and incidental-splash behaviour.

Do not cut the cabin panel until the dimension gauge and complete hardware
stack have been physically checked.

## Recommended next-agent sequence

1. Read `AGENTS.md`, `README.md`, and `PRINT_TUNING.md`.
2. Measure the printed bezel, carrier, physical display, and cabin panel.
3. Record those measurements before changing parameters.
4. Design the carrier-to-rear-box locating and M3 fastening interface.
5. Create a small interface coupon and render it as a selectable part.
6. Render all outputs and inspect the affected STL and assembly preview.
7. Slice the coupon with the committed profile baseline and inspect G-code.
8. Print and physically test the coupon.
9. Only after it passes, regenerate and review the full rear box.
10. Continue with the service cover, radar clip, and BME280 pod after their
    interfaces are measured.

## Tool operation notes

OpenSCAD is installed project-locally because system installation required an
interactive sudo password:

```bash
tools/openscad/install.sh
cad/waveshare-panel/render.sh
```

The AppImage is intentionally ignored by Git. Its installer verifies the
official fixed SHA-256 checksum.

Creality Print AppImage:

```text
/home/antony-slack/Applications/
  CrealityPrint_Ubuntu2404-V7.0.1.4212-x86_64-Release.AppImage
```

When launched from the Codex/Snap environment, use a minimal environment.
Otherwise inherited Snap libraries can cause a `libpthread`/`GLIBC_PRIVATE`
symbol error. Preserve the desktop `DISPLAY`, `WAYLAND_DISPLAY`, `XAUTHORITY`,
`XDG_RUNTIME_DIR`, and `DBUS_SESSION_BUS_ADDRESS` values, and use
`APPIMAGE_EXTRACT_AND_RUN=1`.

## Commit history for this work

- `9e93584` Add documented Waveshare enclosure CAD workflow
- `9d221f3` Record Hyper PETG cooling profile correction
- `0eb3667` Record successful bezel prototype print
- `84511cf` Document carrier slice review
- `356d818` Lower Hyper PETG carrier print temperature
- `77b13ed` Verify revised carrier slice settings
- `20a75ee` Record successful carrier prototype print

All unrelated working-tree changes pre-date or fall outside this CAD task and
must remain untouched.

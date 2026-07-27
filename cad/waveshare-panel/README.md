# Waveshare boat-panel enclosure CAD

This directory contains a parametric OpenSCAD prototype derived from
`Dimensioned_3D_Printed_Enclosure_Specification_v0.1.md` on the
`agent/boat-information-media-panel-design` branch.

The model provides these printable parts:

- front bezel with glass recess, visible opening, gasket groove, radar pocket,
  and six clamping insert pilots;
- display carrier with four M3 display standoffs and six bezel clamps;
- rear electronics box with cover bosses, a 70 x 40 mm interface-PCB mounting
  pattern, cable entry, and strain relief;
- ventilated screw-on service cover;
- removable LD2410C retaining clip;
- ventilated BME280 pod and rear cover;
- dimension gauge, bezel-corner coupon, and radar-window coupon.

## Important prototype status

This is a first mechanical baseline, not a production-ready or waterproof
enclosure. The source document marks the display envelope, mounting holes,
connector clearances, sensor sizes, cabin-panel thickness, and available rear
depth as requiring physical verification. Do not cut the cabin panel from
these dimensions until the dimension gauge has been checked against the real
display and installation.

The service cover uses downward-sheltered vents but the assembly has not been
tested for splash or condensation ingress.

## OpenSCAD

A checksum-verified OpenSCAD 2021.01 AppImage is installed locally at:

```text
tools/openscad/OpenSCAD-2021.01-x86_64.AppImage
```

If it is absent, run `tools/openscad/install.sh`. System installation was not
possible because `sudo` requires an interactive password. The installer
downloads the official portable Linux build, verifies its fixed SHA-256
checksum, and keeps the third-party executable out of Git.

Open the source in the GUI:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 \
  tools/openscad/OpenSCAD-2021.01-x86_64.AppImage \
  cad/waveshare-panel/waveshare_panel_enclosure.scad
```

Select a value for `part` in the OpenSCAD Customizer, or render from the CLI:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 \
  tools/openscad/OpenSCAD-2021.01-x86_64.AppImage \
  -o bezel.stl \
  -D 'part="bezel"' \
  cad/waveshare-panel/waveshare_panel_enclosure.scad
```

Render all parts and an assembly preview:

```bash
cad/waveshare-panel/render.sh
```

The optional first argument changes the output directory.

## Prototype order

1. Print `dimension_gauge.stl` and compare the glass recess, mounting pattern,
   and 170 x 102 mm panel-cut-out witness line to the real hardware.
2. Print `bezel_corner.stl` to tune recess clearance, recess depth, visible
   overlap, and the 3 x 1.1 mm gasket groove.
3. Print `radar_test.stl` and verify LD2410C performance through the nominal
   1.5 mm plastic wall.
4. Measure the PCB, sensors, connectors, cable bend radii, and installation
   depth; update the parameters at the top of the `.scad` file.
5. Only then print the complete bezel, carrier, box, cover, clip, and pod.

Recommended starting print settings from the design specification are PETG
(ASA for stronger UV/heat exposure), 0.20 mm layers, four perimeters, five
top/bottom layers, and 25-35% infill. Print insert bosses locally solid.

The baseline bezel width is 212 mm. This leaves 4 mm nominal clearance at
each side of a centred Ender-3 V3 SE bed while retaining 21 mm of cabin-panel
overlap at each side of the 170 mm cut-out.

Printer-, filament-, and first-print findings are recorded in
[`PRINT_TUNING.md`](PRINT_TUNING.md). Review that file before slicing another
part; it includes settings that are not represented in the geometry.

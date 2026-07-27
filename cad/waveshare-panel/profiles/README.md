# Creality Print profile snapshots

These files are source-controlled snapshots of the user presets used for the
successful Waveshare bezel and carrier prototypes.

Target:

- Creality Print 7.0.1.4212;
- Creality Ender-3 V3 SE;
- 0.4 mm brass nozzle;
- Creality Hyper PETG, 1.75 mm.

The files inherit Creality Print system presets. They are not independent of a
compatible installation and may need to be imported through the application's
preset-management interface in a future version.

Validated baseline:

- 230 C first layer and 220 C thereafter;
- 70 C bed;
- fan off for the first three layers;
- 40-50% normal cooling and 60% maximum overhang cooling;
- 1.2 mm retraction at 25 mm/s;
- 10 mm3/s maximum volumetric flow;
- 0.20 mm layers, four walls, five top and bottom layers;
- 30% gyroid infill;
- zero slicer Z offset.

Local application paths and recovery instructions are in `../HANDOVER.md`.
Do not commit the complete user configuration directory because it contains
transient application state.

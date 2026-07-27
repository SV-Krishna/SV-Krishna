# Agent instructions: Waveshare panel CAD

These instructions apply to this directory and all of its descendants.

## Objective

Maintain the Waveshare boat-panel enclosure as a reproducible, documented
mechanical design. A change is not complete when the geometry merely renders;
its rationale, verification status, print implications, and prototype results
must also be recorded.

## Required documentation

For every material change:

1. Update `waveshare_panel_enclosure.scad` comments and parameters when
   geometry or fit changes.
2. Update `README.md` when part names, commands, dependencies, assembly,
   orientation, or prototype order changes.
3. Update `PRINT_TUNING.md` when slicer settings, printer behaviour, filament
   behaviour, G-code findings, or physical print results change.
4. Add a dated subsection for each meaningful physical prototype, including
   failed or interrupted prints.
5. Record measurements with units and identify how they were obtained.
6. Link claims to the relevant source file, specification, G-code, photograph,
   or physical observation where practical.

Write-ups must distinguish:

- **Specified**: taken from the design specification or manufacturer data.
- **Modelled**: encoded in the current CAD but not physically verified.
- **G-code verified**: confirmed in an exported slice.
- **Observed**: seen or measured on the physical printer or printed part.
- **Proposed**: a recommendation awaiting a test.

Never silently convert a proposed value into a validated value.

## Print log minimum

Each dated prototype entry must record, when available:

- part and CAD revision or Git commit;
- STL filename and slicer version;
- printer, nozzle, build plate, and filament;
- layer height, temperatures, cooling, retraction, walls, infill, supports,
  brim, relevant speeds, and slicer Z offset;
- sliced footprint, estimated time, and estimated filament;
- in-print adjustments and the layer or time at which they occurred;
- symptoms, photographs, measurements, fit results, and failure mode;
- conclusion and the exact next change.

Do not overwrite historical observations when a later test changes the
recommendation. Add a new dated result and mark the earlier conclusion as
superseded.

## CAD and slicing workflow

1. Read `README.md` and `PRINT_TUNING.md` before editing or slicing.
2. Treat dimensions marked provisional as unverified until measured.
3. Keep user-adjustable dimensions at the top of the OpenSCAD source.
4. Render all parts with `render.sh` after geometry changes.
5. Treat OpenSCAD warnings, empty objects, non-simple solids, or failed exports
   as blockers.
6. Inspect the assembly preview and the affected individual STL.
7. For a production-sized print, inspect exported G-code for bed bounds,
   temperatures, fan commands, support state, layer count, and slicer Z
   offset.
8. Print fitting gauges and coupons before a full enclosure when an interface
   has not been physically verified.
9. Never initiate a physical print without explicit user authorization.

## Safety and quality

- Never describe the enclosure as waterproof without a recorded ingress test.
- Preserve adequate clearance from glass, ribbon cables, antennas, radar
  fields, connectors, and heat-producing components.
- Do not place the 12 V converter or BME280 inside the display enclosure.
- Do not compensate for CR Touch calibration with an undocumented slicer
  Z offset.
- Never store passwords, tokens, machine credentials, or personal data in CAD,
  profiles, logs, screenshots, or commits.
- Do not commit transient `/tmp` files, application caches, crash dumps, or
  proprietary/third-party executables.

## Git completion requirement

Work in this directory is not complete until it is committed to Git.

Before handoff:

1. Review `git status` and preserve unrelated user changes.
2. Stage only files belonging to the requested CAD/documentation task.
3. Review the staged diff and generated-file list.
4. Run the relevant rendering and validation checks.
5. Create a focused commit with an imperative message describing the outcome.
6. Confirm the commit exists and report its hash.

Do not amend, squash, rebase, push, or open a pull request unless the user
explicitly requests it. If a commit cannot be made, report the reason and leave
the intended files clearly identified.

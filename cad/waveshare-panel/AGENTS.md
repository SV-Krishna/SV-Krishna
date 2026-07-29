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

For every meaningful CAD, profile, slicing, prototype, or operational change,
also add a concise dated entry to the repository-level `docs/log.md`. Use that
entry to record intent, affected files, validation status, recovery preparation,
and follow-up work. Keep the detailed print and measurement evidence in
`PRINT_TUNING.md` and link or refer to it from the project log rather than
duplicating the complete record.

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

## Validation and completion language

Use the existing evidence classifications above and describe the overall state
precisely:

- **Rendered**: OpenSCAD completed and the generated geometry passed the
  required render and visual checks.
- **Slice verified**: exported G-code was checked for the applicable bed,
  temperature, cooling, support, layer, and offset requirements.
- **Printed**: the physical print completed; this says nothing by itself about
  dimensional fit or operational suitability.
- **Fit observed**: the relevant physical measurements, interfaces, and
  clearances were checked and recorded.
- **Operationally accepted**: the assembled part performed its intended
  function in the real installation and the result was recorded.

Record every material validation step that was not run, why it was not run,
the remaining risk, and the exact next test. Never describe a successful
render, slice, or print as proof of fit, waterproofing, radar performance,
thermal suitability, or operational acceptance.

## External configuration recovery

- Before materially changing a printer, slicer, filament, machine, or process
  profile, capture its name, version, relevant current values, and restoration
  route without recording credentials or proprietary application data.
- After changing a profile, export or read the saved configuration back and
  inspect the resulting G-code where applicable. A value shown in a user
  interface is not sufficient evidence that the printer applied it.
- Record whether rollback was tested, prepared only, or unavailable.

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

## Parking and continuation

- When the user asks to pause, defer, park, or resume this work later, use the
  `park-work` skill.
- Before parking, leave `docs/log.md`, `PRINT_TUNING.md`, `HANDOVER.md`, and
  other affected durable documentation accurate for the current state.
- The parked record must include verified state, unverified dimensions and
  assumptions, remaining work, required physical materials or access, the
  exact next test, a restart prompt, and an explicit resume date when supplied.
- Parking supplements the repository documentation and Git state; it does not
  replace either one.
- Do not park active work merely because follow-up exists. Park it only when
  the user intentionally pauses or schedules the work.

## Git completion requirement

Work in this directory is not complete until it is committed to Git.

Before handoff:

1. Review `git status` and preserve unrelated user changes.
2. Stage only files belonging to the requested CAD/documentation task.
3. Review the staged diff and generated-file list.
4. Run the relevant rendering and validation checks.
5. Confirm `docs/log.md` and all affected source comments, `README.md`,
   `PRINT_TUNING.md`, profile documentation, and `HANDOVER.md` are current
   where applicable.
6. Record skipped validation, remaining risk, recovery readiness, and the next
   test.
7. Check staged files for secrets, personal data, proprietary assets,
   unintended generated files, and unrelated changes.
8. Create a focused commit with an imperative message describing the outcome
   and including its required documentation.
9. Confirm the commit exists and report its hash.

Do not amend, squash, rebase, push, or open a pull request unless the user
explicitly requests it. If a commit cannot be made, report the reason and leave
the intended files clearly identified.

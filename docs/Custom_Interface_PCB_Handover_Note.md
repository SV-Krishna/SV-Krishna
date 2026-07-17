# Custom Interface PCB Handover Note

## Purpose

This note explains the rationale for introducing a small custom interface PCB into the Waveshare ESP32-S3 7-inch boat information and media control panel design. It is intended for the next engineer or agent taking responsibility for the hardware design.

The PCB is an **improvement to the wiring and serviceability of the design**, not a change to the functional scope of the system.

## Wider design context

This handover note should be read alongside:

- [Boat Information and Media Control Panel — System Design v1](Boat_Information_Media_Control_Panel_System_Design_v1.md)
- [Dimensioned 3D-Printed Enclosure Specification — Draft v0.1](Dimensioned_3D_Printed_Enclosure_Specification_v0.1.md)
- [Enclosure reference image](images/boat-panel-enclosure-reference.svg)

The wider design defines the Waveshare display as:

- an LVGL-based Signal K dashboard;
- a BME280 cabin environmental sensor gateway;
- a remote control for the Raspberry Pi media system;
- a low-power panel using an LD2410C presence sensor to manage the screen backlight.

The confirmed external connections are:

- regulated 5 V and ground from the boat power converter;
- BME280 over I²C using 3.3 V, GND, SDA and SCL;
- LD2410C using 5 V, GND and digital presence output;
- short internal links to the Waveshare board.

## Why the interface PCB was suggested

The original design can be wired entirely with loose conductors, WAGO connectors and pluggable terminal blocks. That approach is electrically valid, but it introduces several practical weaknesses inside a compact, flush-mounted enclosure.

A small custom interface PCB improves the installation by replacing point-to-point wiring with a defined and repeatable interconnection layer.

The suggested PCB is approximately 70 × 40 mm and would act as a local backplane between:

- the regulated 5 V input;
- the Waveshare board;
- the BME280 sensor pod;
- the LD2410C presence sensor;
- test and service points.

## Main rationale

### 1. Reduced wiring complexity

Without a PCB, the enclosure requires multiple individual wires between terminal blocks, WAGO connectors, the display and both sensors.

That creates:

- more joints;
- more opportunities for wiring errors;
- more unsupported conductors;
- more difficult fault-finding;
- more congestion behind the display.

The PCB converts these into fixed copper tracks and labelled connectors.

### 2. Improved serviceability

The panel is intended to be flush-mounted in a boat cabin. Once installed, access will be from the rear service cover.

A PCB allows the engineer to disconnect:

- the display;
- the BME280 pod;
- the presence sensor;
- the 5 V supply;

without dismantling unrelated wiring.

Each external cable can terminate in its own pluggable connector.

### 3. Better vibration resistance

A boat installation is exposed to continuous vibration and movement.

A PCB mounted on standoffs provides a fixed mechanical platform for:

- Phoenix-style pluggable terminals;
- board-to-board or wire-to-board headers;
- strain-relieved harnesses;
- test points.

This is more robust than leaving multiple WAGO connectors and wire junctions unsupported inside the enclosure.

### 4. Clear separation of power and data

The PCB can deliberately separate:

- 5 V power distribution;
- 3.3 V sensor power;
- I²C data lines;
- presence-sensor output;
- optional UART or spare signals.

This reduces the chance of accidentally applying 5 V to a 3.3 V signal input.

### 5. Easier assembly and repeatability

A defined PCB makes the build reproducible.

A future replacement unit can be assembled from the same:

- terminal positions;
- cable labels;
- pin order;
- mounting-hole pattern;
- test procedure.

This is especially useful if the enclosure is reprinted or the display needs to be replaced.

### 6. Better diagnostics

The PCB can provide labelled test points for:

- 5 V;
- GND;
- 3.3 V;
- SDA;
- SCL;
- presence output.

This allows measurements with a multimeter without probing fragile connectors on the Waveshare board.

### 7. Future expansion without redesigning the enclosure

The current functional scope is deliberately limited, but the PCB can reserve space for:

- an additional I²C connector;
- a spare digital input;
- UART test pins;
- optional pull-up resistors;
- optional level shifting;
- power-status LED;
- resettable fuse or input protection.

These provisions do not need to be populated in the first version.

## Proposed PCB function

The PCB should be a passive or near-passive interconnection board.

It should not become another complex controller.

Its minimum functions are:

- accept regulated 5 V and GND;
- distribute 5 V to the Waveshare board and LD2410C;
- accept or distribute 3.3 V for the BME280;
- route SDA and SCL between the Waveshare board and BME280;
- route the LD2410C presence output to GPIO6;
- provide labelled test points;
- provide secure pluggable external connectors;
- mount on four standoffs inside the rear enclosure.

## Recommended connector arrangement

### Power input

Two-position pluggable terminal block:

```text
1 — 5 V
2 — GND
```

Recommended pitch: 5.08 mm.

### BME280

Four-position pluggable terminal block:

```text
1 — 3.3 V
2 — GND
3 — SDA
4 — SCL
```

Recommended pitch: 3.5 mm.

### LD2410C

Three-position pluggable terminal block:

```text
1 — 5 V
2 — GND
3 — OUT
```

Recommended pitch: 3.5 mm.

### Waveshare connection

Use a compact locking header or short removable harness carrying:

```text
5 V
GND
3.3 V
SDA
SCL
Presence output
```

The exact connector family should be chosen after confirming the physical connector availability and accessible pins on the Waveshare board revision in use.

## Recommended protections and options

The first PCB revision should consider footprints for:

- input reverse-polarity protection;
- resettable fuse on 5 V input;
- transient suppression on 5 V input;
- 100 nF local decoupling near each connector group;
- bulk capacitor on the 5 V rail;
- optional I²C pull-up resistors, not fitted by default until the existing bus is assessed;
- optional resistor divider or level-shifting footprint for the LD2410C output;
- power LED with a removable jumper or solder bridge;
- test points.

These should be treated as design options rather than mandatory populated parts.

## Important constraints

### Do not place the 12 V buck converter on this PCB

The buck converter should remain outside the display enclosure as defined in the enclosure specification.

Reasons:

- reduced heat inside the display enclosure;
- reduced electrical noise;
- easier replacement;
- simpler enclosure depth;
- reduced influence on the BME280 reading.

The PCB should receive regulated 5 V only.

### Do not mount the BME280 on the PCB

The BME280 remains in a remote ventilated pod.

Mounting it inside the display enclosure would produce a misleading cabin temperature due to heat from the display and ESP32.

### Do not make the PCB safety-critical

The panel remains an information and media-control device.

The PCB should not become the sole controller for any essential boat function.

## Mechanical design considerations

The enclosure specification currently allows a PCB of approximately 70 × 40 mm mounted on 10 mm standoffs.

The next designer should confirm:

- available internal space behind the Waveshare board;
- service-cover clearance;
- terminal screwdriver access;
- cable bend radius;
- position of strain relief;
- separation from the LD2410C radar field;
- separation from the ESP32 antenna area;
- access to the microSD slot and USB connectors.

The PCB mounting holes should be sized for M3 hardware or the chosen heat-set insert system.

## Recommended design process

1. Confirm the exact Waveshare PCB revision and available connector pins.
2. Confirm the selected BME280 breakout and LD2410C module dimensions.
3. Measure the real enclosure interior from the prototype CAD.
4. Produce a simple schematic.
5. Produce a two-layer PCB layout.
6. Keep power and signal routing clearly separated.
7. Add full silkscreen labels for every connector and test point.
8. Export manufacturing files and a printable 1:1 paper check.
9. Validate connector access against the enclosure before ordering.
10. Build and test the PCB on the bench before installation.

## Suggested first-revision acceptance criteria

The PCB is acceptable when:

- the display powers reliably from regulated 5 V;
- the BME280 is detected on I²C;
- the presence signal is read correctly on GPIO6;
- all external cables can be unplugged independently;
- all test points are accessible with the rear cover removed;
- no connector interferes with the Waveshare PCB, enclosure or service cover;
- the LD2410C detection performance is unaffected;
- there is no measurable instability on the 3.3 V or 5 V rails;
- the full assembly survives a vibration and handling test without loose connections.

## Recommendation to the next agent

Proceed with the interface PCB as a **serviceability and wiring-quality improvement**, but keep the first revision deliberately simple.

The priority is not to add functionality. The priority is to create a robust, labelled and removable wiring interface that supports the design already documented in the system design and enclosure specification.

A first revision should favour:

- large clearances;
- through-hole pluggable terminals;
- large labels;
- accessible test points;
- simple two-layer routing;
- optional rather than mandatory protection footprints;
- easy hand assembly and rework.

The PCB should remain a replaceable internal subassembly and should not create a dependency that prevents the panel from being repaired using conventional wiring if necessary.

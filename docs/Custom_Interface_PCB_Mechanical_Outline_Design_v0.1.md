# Custom Interface PCB Mechanical Outline Design

## Waveshare ESP32-S3 7-inch Boat Panel — Draft v0.1

**Status:** Mechanical integration baseline for enclosure iteration 2  
**Purpose:** Provide the enclosure designer with a defined PCB size, mounting pattern, component envelope, connector zones, keep-outs and service clearances.  
**Related documents:**

- [Boat Information and Media Control Panel — System Design v1](Boat_Information_Media_Control_Panel_System_Design_v1.md)
- [Dimensioned 3D-Printed Enclosure Specification — Draft v0.1](Dimensioned_3D_Printed_Enclosure_Specification_v0.1.md)
- [Custom Interface PCB Handover Note](Custom_Interface_PCB_Handover_Note.md)

## 1. Design intent

The custom interface PCB is a passive or near-passive wiring backplane for the boat information and media control panel. It does not change the system function.

It provides:

- regulated 5 V input;
- 5 V and ground distribution;
- 3.3 V distribution from the Waveshare board;
- BME280 connection;
- LD2410C connection;
- Waveshare display harness connection;
- I²C and GPIO breakout points;
- labelled test points;
- optional input protection and filtering;
- spare capacity for limited future expansion.

The PCB must remain removable and replaceable through the rear service opening without removing the touchscreen assembly.

## 2. Provisional PCB dimensions

The enclosure designer should reserve space for the following board:

| Feature | Dimension |
|---|---:|
| PCB width | 78.0 mm |
| PCB height | 48.0 mm |
| PCB thickness | 1.6 mm nominal |
| Corner radius | 2.0 mm |
| Copper layers | 2 |
| Maximum finished board tolerance | ±0.25 mm |

The previous 70 × 40 mm estimate was suitable as an early concept but left limited edge space around pluggable connectors and mounting holes. The 78 × 48 mm outline provides a more practical first-revision design while remaining compact.

The enclosure should allow a minimum board-plan envelope of:

```text
82 mm wide × 52 mm high
```

This provides approximately 2 mm clearance around the finished PCB on all sides.

## 3. Board coordinate system

For mechanical drawings, view the PCB from the component side with the 78 mm edge horizontal.

```text
Origin (0,0): bottom-left corner of finished PCB
X axis: left to right, 0–78 mm
Y axis: bottom to top, 0–48 mm
```

All mounting-hole coordinates in this document refer to the hole centres measured from this origin.

## 4. Mounting-hole pattern

Use four mounting holes in a rectangular pattern.

| Hole | X | Y |
|---|---:|---:|
| Bottom left | 4.0 mm | 4.0 mm |
| Bottom right | 74.0 mm | 4.0 mm |
| Top left | 4.0 mm | 44.0 mm |
| Top right | 74.0 mm | 44.0 mm |

Resulting centre-to-centre pattern:

```text
Horizontal: 70.0 mm
Vertical:   40.0 mm
```

Mounting-hole requirements:

- finished hole diameter: 3.2 mm;
- intended fastener: M3;
- no copper within 1.0 mm of the hole edge;
- no exposed electrical connection to mounting hardware;
- use nylon or fibre washers if required;
- use four mounting points, not two.

The enclosure should use M3 brass heat-set inserts or captive nuts. The boss pattern should match the dimensions above.

## 5. Standoff and mounting-plane requirements

Recommended standoff height:

```text
6 mm nominal
```

Acceptable range:

```text
5–8 mm
```

The PCB underside should have at least 4 mm clear space above the enclosure mounting plane after allowing for solder joints and through-hole pin tails.

Recommended enclosure bosses:

- boss outside diameter: 7–9 mm;
- insert sized for M3 hardware;
- boss top faces coplanar within 0.3 mm;
- local material around bosses should be substantially solid;
- provide tool access to all four screws with the rear cover removed.

Ten millimetre standoffs should not be assumed. They may be used only if physical testing shows that additional underside clearance is required.

## 6. Installed PCB volume

The enclosure designer should reserve the following hard occupied volume for the PCB assembly:

```text
Width:  82 mm
Height: 52 mm
Depth:  24 mm from the PCB mounting plane
```

The 24 mm depth allowance consists of:

| Element | Allowance |
|---|---:|
| Standoff | 6.0 mm |
| PCB | 1.6 mm |
| Maximum populated component height above PCB | 14.0 mm |
| Assembly tolerance | 2.4 mm |
| Total | 24.0 mm |

No populated component should exceed 14 mm above the component face of the PCB in revision one.

The preferred design uses right-angle pluggable terminal headers at the PCB edges so that plugs and wires approach parallel to the board rather than adding excessive enclosure depth.

## 7. Service volume

The hard occupied volume is not sufficient by itself. Space must also be provided to unplug connectors and bend cables.

Reserve a service envelope around the installed PCB of approximately:

```text
Width:  92 mm
Height: 72 mm
Depth:  38 mm from the mounting plane
```

This service envelope may overlap otherwise empty enclosure space, but it must not be blocked by:

- the rear cover;
- the Waveshare board;
- ribbon cables;
- structural ribs;
- heat-set insert bosses;
- cable clamps;
- the LD2410C retaining clip.

The rear cover should be removable without disconnecting the PCB. Once the cover is removed, all pluggable connectors and all four PCB mounting screws must be accessible.

## 8. Recommended connector arrangement

The following arrangement is the mechanical baseline. Exact connector part numbers remain subject to electrical and supplier confirmation.

### 8.1 Bottom edge — external power and presence sensor

Locate these connectors along the bottom 78 mm edge:

1. Regulated 5 V input — two-position, 5.08 mm pitch, pluggable.
2. LD2410C — three-position, 3.5 mm pitch, pluggable.

Nominal connector zone:

```text
X: 8–45 mm
Y: 0–12 mm
```

The enclosure should provide a cable path below or beside this edge with at least 12 mm bend space after the plugs are inserted.

### 8.2 Left edge — BME280 sensor pod

Locate the four-position BME280 pluggable connector on the left edge.

Nominal connector zone:

```text
X: 0–14 mm
Y: 17–39 mm
```

The cable should leave toward a dedicated low-noise signal-wire channel. Keep this route separated from the incoming 5 V cable where practical.

### 8.3 Right edge — Waveshare harness

Locate the removable Waveshare harness connector on the right edge.

Required signals:

```text
5 V
GND
3.3 V
SDA / GPIO8
SCL / GPIO9
LD2410C OUT / UART2 RXD / GPIO44
```

The solder-free connection uses the Waveshare UART2 PH2.0 header with its
physical selector in the `UART2` position. RXD is repurposed as a digital
GPIO44 input; this proof of concept does not enable the LD2410C UART protocol.
Do not substitute Sensor AD/GPIO4 because GPIO4 is shared with the actively
driven GT911 touch interrupt/reset sequence.

Nominal connector zone:

```text
X: 64–78 mm
Y: 13–37 mm
```

Use a compact locking wire-to-board connector or equivalent removable harness. The enclosure must allow the harness to be unplugged without removing the PCB.

### 8.4 Top edge — expansion and test access

Reserve the top edge for:

- I²C breakout;
- spare GPIO breakout;
- optional UART/test header;
- test points;
- optional power LED disable jumper.

Nominal zone:

```text
X: 14–64 mm
Y: 36–48 mm
```

These features may be unpopulated in revision one, but the enclosure should not place ribs directly above them.

## 9. Connector access clearances

Provide the following minimum free spaces measured from the finished PCB edge:

| Interface | Minimum clearance |
|---|---:|
| Pluggable connector insertion/removal direction | 18 mm |
| Cable bend after plug | 12 mm |
| Screwdriver access if plug is terminated in situ | 25 mm |
| Test-probe access above test points | 15 mm |
| Access around each M3 mounting screw | 6 mm radius |

Where possible, pluggable connector plugs should be terminated outside the enclosure and then inserted. This reduces the need to use a screwdriver within the installed panel.

## 10. Cable-entry relationship

The enclosure should provide two cable-routing regions rather than one congested entry point.

### Power region

For:

- regulated 5 V input;
- ground;
- LD2410C power and output.

Preferred position: adjacent to the PCB bottom edge.

### Signal region

For:

- BME280 four-core cable.

Preferred position: adjacent to the PCB left edge.

Requirements:

- clamp outer cable insulation, not individual conductors;
- provide at least one internal tie or P-clip point;
- avoid sharp printed edges;
- allow ferrules and connector plugs to pass during assembly;
- do not route the BME280 cable immediately alongside the display power cable for its full length.

## 11. Keep-out zones

### 11.1 ESP32 antenna

The PCB, wiring, metal fasteners and copper-rich areas must not be placed directly over the Waveshare ESP32 antenna region.

Until the exact Waveshare revision is measured, reserve:

```text
Minimum separation from antenna projection: 20 mm
Preferred separation: 25 mm or more
```

The enclosure CAD should include an antenna keep-out volume once the physical display board has been inspected.

### 11.2 LD2410C radar field

The custom PCB must not sit directly behind the LD2410C radar window or between the sensor and the cabin.

Maintain:

```text
Minimum lateral separation from the sensor module outline: 20 mm
Preferred separation from the forward radar axis: 30 mm
```

Do not place a PCB ground plane, terminal block, metal mounting screw or bundled cable immediately in front of the sensor.

### 11.3 Display and ribbon cables

Maintain at least 3 mm static clearance from:

- display PCB components;
- touchscreen ribbon cables;
- display flex connectors;
- microSD card insertion path;
- USB connector bodies.

Use 5 mm clearance where movement during assembly is possible.

## 12. Preferred position in the rear enclosure

The PCB should be mounted parallel to the display and rear service cover.

Preferred location:

- upper-left or upper-right region of the rear electronics enclosure;
- outside the LD2410C pocket and forward radar axis;
- away from the confirmed ESP32 antenna location;
- close enough to the Waveshare GPIO/power access point to permit a short harness;
- with external connectors facing available cable channels.

The enclosure designer must not freeze the absolute PCB location until the physical Waveshare board, ribbon cables, USB sockets, microSD path and antenna location have been measured.

The mounting pattern and volume in this document should be treated as fixed; the absolute location within the enclosure remains adjustable during prototype integration.

## 13. Rear enclosure depth recommendation

The current enclosure draft specifies 35 mm internal depth. This may be adequate only if:

- the PCB uses 5–6 mm standoffs;
- connector headers are right-angle;
- the board is not stacked directly over tall Waveshare components;
- cables leave laterally rather than directly toward the rear cover.

For enclosure iteration 2, use the following design target:

```text
Preferred clear internal depth: 40 mm
Minimum local clear depth over PCB mounting zone: 30 mm
```

A 40 mm internal depth gives more realistic allowance for the PCB, plugs, cable bends and assembly tolerances while remaining close to the original enclosure concept.

The final depth must be confirmed using a physical mock-up before the boat panel is cut.

## 14. PCB component-side height allocation

Recommended maximum heights above the PCB:

| Component class | Maximum target height |
|---|---:|
| Pluggable terminal header | 12 mm |
| Locking Waveshare harness connector | 10 mm |
| Electrolytic/bulk capacitor | 12.5 mm |
| TVS diode/fuse/protection components | 8 mm |
| Test points and pin headers | 11 mm |
| LED/jumper | 6 mm |

Avoid unusually tall radial capacitors or upright power components.

## 15. Preliminary electrical zones affecting mechanical layout

The PCB should be divided into these zones:

```text
Bottom-left: 5 V input protection and power terminal
Bottom-centre: LD2410C connector
Left side: BME280 connector and I²C conditioning footprints
Centre: power and ground distribution
Right side: Waveshare harness
Top side: test points and optional expansion
```

The board should retain a continuous ground plane where practical, subject to antenna and sensor-placement constraints in the wider enclosure.

## 16. Enclosure features required for PCB integration

Enclosure iteration 2 should include:

1. Four M3 mounting bosses on a 70 × 40 mm centre pattern.
2. An 82 × 52 × 24 mm minimum hard PCB volume.
3. A 92 × 72 × 38 mm service envelope where practical.
4. At least 18 mm connector removal clearance at populated board edges.
5. Dedicated power and BME280 cable-routing channels.
6. Internal strain-relief points.
7. No structural ribs over connector or test-point zones.
8. Tool access to all four PCB screws.
9. A removable PCB path through the rear service opening.
10. Explicit antenna and LD2410C keep-out volumes in the CAD model.
11. A local internal depth target of at least 30 mm above the PCB mounting plane.
12. Preferred overall rear-enclosure internal depth of 40 mm.

## 17. Mechanical mock-up recommendation

Before designing the electrical traces, produce a PCB mechanical dummy using one of these methods:

- 1.6 mm FR4 blank;
- laser-cut acrylic;
- 3D-printed 1.6–2 mm plate;
- 1:1 paper template bonded to card.

The dummy should include:

- 78 × 48 mm outline;
- four 3.2 mm mounting holes;
- connector body envelopes;
- plug-removal directions;
- maximum component-height blocks.

Test the dummy with:

- the actual Waveshare display;
- actual Phoenix-style terminal plugs;
- the intended harness connector;
- representative ferruled cables;
- the LD2410C and retaining clip;
- the rear service cover.

## 18. Items still requiring physical confirmation

The following are deliberately not presented as final facts:

- exact Waveshare connector and accessible pin location;
- exact ESP32 antenna position and orientation;
- selected terminal-block manufacturer and body dimensions;
- selected Waveshare harness connector;
- exact BME280 cable diameter;
- LD2410C OUT voltage and any level-shifting components;
- actual component heights after protection parts are selected;
- final PCB position relative to the display board;
- final rear-enclosure depth.

These checks may alter connector placement slightly but should not alter the 78 × 48 mm outline or 70 × 40 mm mounting pattern unless a significant physical conflict is discovered.

## 19. Acceptance criteria for enclosure iteration 2

The enclosure design is ready for the next stage when:

- the 78 × 48 mm PCB dummy fits without contact;
- all four mounting screws can be installed and removed;
- each pluggable connector can be unplugged independently;
- the PCB can be removed without removing the display;
- the rear cover closes without compressing wiring;
- a minimum 3 mm clearance exists from fixed display components;
- cable bends are not tighter than the cable manufacturer recommendation;
- the microSD and required USB connections remain accessible;
- the PCB and wiring remain outside the antenna keep-out;
- LD2410C detection is not degraded by the PCB or cable routing;
- external cables have effective strain relief;
- no terminal or test point is obstructed by an enclosure rib.

## 20. Parametric CAD values

The following values should be added to the enclosure CAD parameter set:

```text
INTERFACE_PCB_W                 = 78.0
INTERFACE_PCB_H                 = 48.0
INTERFACE_PCB_T                 = 1.6
INTERFACE_PCB_CORNER_R          = 2.0

INTERFACE_PCB_HOLE_D            = 3.2
INTERFACE_PCB_HOLE_X_SPACING    = 70.0
INTERFACE_PCB_HOLE_Y_SPACING    = 40.0
INTERFACE_PCB_HOLE_EDGE_OFFSET  = 4.0

INTERFACE_PCB_STANDOFF_H        = 6.0
INTERFACE_PCB_HARD_W            = 82.0
INTERFACE_PCB_HARD_H            = 52.0
INTERFACE_PCB_HARD_DEPTH        = 24.0

INTERFACE_PCB_SERVICE_W         = 92.0
INTERFACE_PCB_SERVICE_H         = 72.0
INTERFACE_PCB_SERVICE_DEPTH     = 38.0

PCB_CONNECTOR_REMOVAL_CLEARANCE = 18.0
PCB_CABLE_BEND_CLEARANCE        = 12.0
PCB_TEST_PROBE_CLEARANCE        = 15.0

PCB_ANTENNA_MIN_SEPARATION      = 20.0
PCB_LD2410_MIN_SEPARATION       = 20.0

REAR_INTERNAL_DEPTH_TARGET      = 40.0
PCB_LOCAL_DEPTH_MIN             = 30.0
```

## 21. Recommendation

Use this document as the mechanical contract between the enclosure and PCB designs for the next prototype.

The 78 × 48 mm board outline and 70 × 40 mm mounting-hole pattern should now be treated as the working baseline. Connector positions remain provisional until real components are selected, but their edge zones, insertion directions and clearance volumes should be represented in the enclosure CAD immediately.

The enclosure should be updated and physically checked with a PCB dummy before detailed PCB routing or manufacture begins.

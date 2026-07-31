# LVGL Marine Dashboard — Developer Implementation Specification

## 1. Purpose

This document defines the UX, visual, interaction, and implementation requirements for a marine monitoring interface built with LVGL for a Waveshare 7-inch ESP32-S3 touchscreen.

The supplied concept images are visual references only. They communicate the intended hierarchy, tone, and general layout, but they are not pixel-perfect implementation specifications. The production interface must be redrawn and implemented natively in LVGL at the target resolution.

The primary operating context is a sailing boat at rest, most commonly at anchor. The display will usually be viewed from below deck and should provide immediate awareness of:

- whether the anchor appears to be holding;
- what is happening around and beneath the boat;
- essential boat system status;
- whether anything requires attention.

This is not intended to replace a chart plotter or become a complete navigation display. It is a calm, glanceable vessel-status console for use while the boat is stationary.

## 2. Target Platform

### Hardware

- Waveshare ESP32-S3 7-inch capacitive touchscreen
- Native display resolution: **800 × 480 pixels**
- Landscape orientation
- Touch-first operation
- Likely use in a cabin environment with variable ambient light

### Software

- LVGL-based interface
- ESP32-S3 firmware environment
- Data may be supplied by local sensors, Signal K, network services, or internal application state

The UI must remain realistic for ESP32-S3 resources. Avoid desktop-style effects that are expensive to render or difficult to maintain.

## 3. Product Intent

A person below deck should be able to look at the screen and answer the following within approximately two seconds:

1. Is the anchor holding?
2. What are the wind, depth, tide, and nearby-vessel conditions?
3. Are the batteries charging and are essential consumables at acceptable levels?
4. Is there an alarm or degraded data source?

The interface should communicate meaning, not merely expose raw sensor values.

Examples:

- Prefer **“Anchor secure”** over only showing a GPS radius.
- Prefer **“Battery 68%, charging +24.8 A”** over a voltage value alone.
- Prefer **“Tide rising”** over a raw tide-height reading without context.

## 4. Confirmed Scope

The application contains three primary screens:

1. **Overview**
2. **Anchor Watch**
3. **Systems**

The Overview screen is the default screen and will be displayed for most of the operating time.

### Explicitly out of scope

The following must not be included unless the scope is formally changed:

- generator controls or status;
- water-heater controls or status;
- rain data;
- sea-temperature data;
- shore-power status;
- alternator status;
- inverter status;
- grey-water tank;
- black-water tank;
- dedicated safety panel;
- carbon-monoxide sensor display;
- BLE scanner or BLE diagnostics page;
- separate general sensor page.

Do not reserve empty cards or navigation items for these removed functions.

## 5. Information Architecture

### Screen 1 — Overview

Purpose: provide an immediate, comprehensive summary of the boat at anchor.

It should answer:

- Is the anchor holding?
- What is happening outside and beneath the boat?
- What is the state of the battery, solar charging, tanks, and relays?

### Screen 2 — Anchor Watch

Purpose: provide a focused view of the anchor position, vessel movement, alarm radius, and recent track.

This screen will contain the detailed anchor controls and larger movement plot.

### Screen 3 — Systems

Purpose: provide detailed boat-system information and relay controls.

This screen should contain the full relay-control interface. The Overview screen should show only a relay summary.

## 6. Global Screen Structure

The full 800 × 480 canvas should use three persistent horizontal zones:

1. **Top status bar** — approximately 36–42 px high
2. **Main content area** — approximately 380–390 px high
3. **Bottom navigation bar** — approximately 50–58 px high

Allow a small outer margin around the main panels. The exact dimensions may be adjusted during implementation, but text and touch targets must not be compressed to preserve decorative spacing.

### Recommended Overview column allocation

Within the main content area:

- Left column: approximately **180 px**
- Centre panel: approximately **360 px**
- Right column: approximately **260 px**

These are starting proportions, not immutable values. The centre anchor display must remain the visual focal point.

## 7. Top Status Bar

The top bar must remain minimal and operationally useful.

Include:

- current page title, for example **OVERVIEW**;
- GPS status;
- Signal K status;
- Wi-Fi status;
- current time;
- consolidated alarm indicator.

Do not show implementation technologies such as MQTT or BLE on the main status bar.

### Status behaviour

Each connection indicator should have clear states:

- connected / healthy;
- connecting / stale;
- disconnected / failed.

Use icon plus colour where possible. Do not rely on colour alone.

The alarm area should display one of:

- No alarms
- Warning
- Critical alarm

When warning or critical, the indicator should be touchable and open the relevant detail or alarm overlay.

## 8. Bottom Navigation

The bottom bar contains exactly three large navigation targets:

- Overview
- Anchor Watch
- Systems

Each item should contain an icon and label.

The selected item must be visually obvious through a combination of:

- accent colour;
- stronger text weight;
- top border, fill, or underline;
- icon emphasis.

Do not add separate navigation items for alarms, logs, sensors, settings, or diagnostics. These may be accessed contextually or from the Systems screen if needed later.

### Touch sizing

- Minimum touch height: approximately 50 px
- Generous spacing between controls
- Avoid small icon-only touch targets for primary navigation
- Design for fingers that may be cold or slightly wet

## 9. Overview Screen Layout

The Overview screen should use three vertical areas.

### 9.1 Left Column — Outside Conditions

This column answers: **“What is happening around and beneath the boat?”**

Include the following information, prioritised in this order:

#### Depth

Display:

- depth beneath keel as the primary value;
- unit;
- clear label such as **Below keel**;
- shallow warning state when applicable.

Depth should be one of the largest values in the left column.

#### Tide

Display:

- rising, falling, high, or low state;
- direction arrow where useful;
- optional contextual information such as expected change and time.

Example:

- Rising
- +0.8 m in 2 h 15 m

If tide data is unavailable, show a clear unavailable or stale state rather than retaining an old value without indication.

#### Position

Display:

- latitude;
- longitude;
- reported GPS accuracy if available.

Coordinates are supporting information and should not dominate the page.

#### Weather summary

Display only essential local weather information:

- air temperature;
- concise condition summary;
- humidity;
- atmospheric pressure.

Rain and sea temperature are out of scope.

#### Nearby AIS vessels

Provide a compact summary, for example:

- number of relevant vessels within a configured range;
- up to three nearest or most relevant vessels;
- vessel name;
- distance;
- relative or compass direction.

The Overview screen is not an AIS plotter. Do not attempt to reproduce a chart display here.

If no relevant vessels exist, show a calm positive state such as **No nearby targets**.

When Anchor Watch is inactive, retain a lightweight traffic view rather than
hiding the plot. Use 10 NM and 20 NM range bands and include only targets with
fresh position data that are moving above 0.5 kn. This is a traffic-awareness
summary, not a substitute for the vessel's primary AIS or chart plotter.

### 9.2 Centre Panel — Anchor Status

This is the most important element on the page.

It should visually communicate the relationship between:

- the anchor position;
- the boat’s current position;
- the vessel’s heading;
- wind direction;
- configured alarm radius;
- recent vessel movement or swing.

#### Required graphic components

- compass orientation markers;
- boat icon;
- anchor icon;
- line or relationship between boat and anchor;
- alarm-radius circle;
- current distance from anchor;
- wind direction arrow;
- wind speed;
- vessel heading;
- concise anchor state.

#### Recommended status wording

Normal:

- Anchor secure
- No significant movement detected

Warning:

- Approaching alarm radius
- Position movement increasing

Critical:

- Anchor alarm
- Possible dragging detected

The generated reference images show a circular instrument. This is a useful direction, but implementation should prioritise legibility over decorative compass detail. The developer may simplify tick marks and labels to fit 800 × 480.

#### Graphic interpretation

The boat must not merely sit decoratively at the centre. Its plotted relationship to the anchor and alarm boundary should reflect real state.

Where practical, show a short historical movement trail. Detailed historic plotting belongs primarily on the Anchor Watch screen.

### 9.3 Right Column — Boat Status

This column answers: **“How healthy are the essential systems?”**

#### Battery

Display:

- state of charge as the primary value;
- battery voltage;
- current, with clear charge/discharge sign or wording;
- power in watts where available;
- estimated remaining or time-to-full value only when the estimate is credible.

A conventional battery symbol or horizontal fill is acceptable, but text values must remain readable without interpreting the graphic.

#### Solar charging

Display:

- solar power in watts as the primary value;
- solar current;
- solar or charging voltage where useful;
- clear charging / inactive / unavailable state.

Do not include shore power, alternator, inverter, or generator data.

#### Tank levels

Display exactly these tank categories:

- fresh water;
- diesel;
- LPG.

Use horizontal level bars plus numeric percentages.

Tank colour should represent state:

- normal: healthy system colour;
- low: amber;
- critical: red.

Thresholds should be configurable rather than permanently hard-coded in the visual layer.

Do not include grey water or black water.

#### Relay summary

The Overview screen must not show six individual relay buttons.

Show a summary such as:

- 2 of 6 relays on
- Cabin lights, Water pump

The summary may be touchable and navigate to the Systems screen.

Full relay controls belong on the Systems screen to ensure safe, adequately sized touch targets.

## 10. Anchor Watch Screen

This screen expands the centre anchor-status concept into a focused operational view.

### Overview design lock

The physical Overview layout accepted on 2026-07-31 is the locked visual
baseline. Anchor Watch development must use a separate LVGL screen and must
not reposition, resize, or restyle accepted Overview elements unless the
owner explicitly reopens that screen or a verified defect requires correction.

The first native Anchor Watch milestone is read-only. Controls that set or
raise the anchor, change alarm radius, disable monitoring, or clear server
history remain disabled until authentication, confirmation UX, error handling,
rollback, and controlled physical testing have been agreed.

### Required content

- large anchor plot;
- anchor position;
- boat position;
- alarm-radius boundary;
- current distance from anchor;
- bearing from anchor to boat;
- boat heading;
- wind direction and speed;
- recent movement trail;
- current anchor status;
- last valid GPS update time.

### Controls

Provide large, clearly separated controls for:

- set anchor using current GPS position;
- manually define or edit anchor position if supported;
- set alarm radius;
- enable or disable anchor alarm;
- clear or reset track history.

Any control that changes the anchor reference or disables the alarm should require confirmation.

Example confirmation:

> Disable anchor alarm?
>
> The system will stop warning if the vessel moves outside the configured radius.

Use a large modal with explicit **Cancel** and **Disable** buttons.

### Plot update behaviour

- Update the boat position when new valid GPS data arrives.
- Do not animate every minor coordinate change at an unnecessarily high frame rate.
- A one-second visual refresh is sufficient for most values.
- Preserve a short trail using a bounded number of points.
- Clearly indicate stale or invalid GPS data.

## 11. Systems Screen

The Systems screen provides detail and control without overloading the Overview screen.

### Battery and solar

Provide more detailed values where available, including:

- battery state of charge;
- voltage;
- current;
- power;
- charging/discharging state;
- solar voltage;
- solar current;
- solar power;
- estimate quality or data age if relevant.

Do not add excluded electrical systems.

### Tanks

Provide larger cards or bars for:

- fresh water;
- diesel;
- LPG.

Display:

- percentage;
- optional calculated quantity if known and reliable;
- data age or sensor-fault state;
- configured low-level threshold.

### Relays

Provide six large controls, or the actual configured number if changed later.

Each relay control should show:

- human-readable relay name;
- icon;
- on/off state;
- disabled/unavailable state if communication has failed;
- optional confirmation for safety-sensitive loads.

Suggested initial labels may include:

- Cabin lights
- Cockpit lights
- Water pump
- Fridge
- Spare 1
- Spare 2

These names must be configuration-driven rather than embedded throughout the UI code.

Avoid ambiguous colour-only toggles. Include explicit **ON** or **OFF** text.

## 12. Visual Design Language

### Overall style

The interface should feel like a premium, production-ready marine information console.

Desired qualities:

- calm;
- restrained;
- highly legible;
- professional;
- functional;
- suitable for prolonged display below deck.

Avoid styling that resembles:

- a generic home-automation dashboard;
- a consumer tablet application;
- a racing-only instrument cluster;
- an engineering debug screen;
- a desktop web dashboard compressed onto a small display.

### Theme

Use a dark theme suitable for cabin use.

Recommended structure:

- screen background: very dark navy or charcoal;
- cards: slightly lighter dark surface;
- card borders: subtle and low contrast;
- primary text: off-white;
- secondary text: muted light grey;
- water and environmental data: blue or teal;
- healthy state: green;
- advisory or low state: amber;
- critical state: red.

Colour is semantic, not decorative.

### Night suitability

The visual design should support reduced brightness without losing hierarchy.

Avoid:

- large pure-white areas;
- excessively bright saturated panels;
- unnecessary animation;
- rapidly flashing alerts.

Critical alarms may pulse or alternate carefully, but should remain readable and should not create a distracting full-screen strobe effect.

## 13. Typography

Typography must be selected for legibility at 800 × 480 and from across a small cabin.

Recommended working sizes:

- major values: approximately 32–46 px;
- important secondary values: approximately 22–30 px;
- labels: approximately 18–22 px;
- smallest supporting text: approximately 16 px.

Do not shrink text below a comfortable readable size merely to reproduce all details shown in a concept image.

Use a compact, clean sans-serif font with sufficient numeric clarity. Confirm that:

- `0`, `6`, `8`, and `9` are distinguishable;
- decimal points are visible;
- degree, percent, amp, volt, watt, metre, knot, and nautical-mile units render correctly;
- coordinate symbols render correctly.

Use tabular or fixed-width numerals where feasible for values that update frequently, reducing visual jitter.

## 14. Icons

Use a consistent icon family and line weight.

Required icon categories include:

- boat;
- anchor;
- GPS / position;
- Wi-Fi;
- Signal K / data connection;
- alarm;
- depth;
- tide;
- weather;
- humidity;
- pressure;
- AIS vessel;
- battery;
- solar;
- fresh water;
- diesel;
- LPG;
- relay / electrical load;
- screen navigation.

Icons must support the label rather than replace it. Avoid obscure marine symbols without accompanying text.

Prefer LVGL symbols, compact monochrome image assets, or vector-like custom drawing where practical. Avoid large full-colour PNG assets unless they provide a clear benefit.

## 15. LVGL Implementation Guidance

### Native objects

Use standard LVGL objects for most of the interface:

- `lv_obj` for cards and containers;
- `lv_label` for text;
- `lv_bar` for tank and battery levels;
- `lv_btn` or button matrix structures for navigation and controls;
- `lv_arc` where appropriate;
- `lv_img` for compact icons;
- flex or grid layouts for predictable positioning.

### Anchor plot

Use one of the following approaches:

1. a custom widget with a draw event;
2. an `lv_canvas` with controlled redraws;
3. a combination of standard line, arc, image, and label objects.

Prefer the simplest approach that provides smooth updates and manageable code.

The anchor plot should be separated from the rest of the screen so its redraw does not force unnecessary repainting of static cards.

The plot uses a head-up frame: the own-vessel boat symbol remains upright.
Place the north marker at relative bearing `-navigation.headingTrue`. Any
AIS targets must first be converted from target position/bearing into
the same relative, head-up frame before plotting; never mix north-up target
coordinates with the head-up own-vessel presentation.

### Rendering constraints

Avoid or minimise:

- blur;
- glassmorphism;
- multilayer transparency;
- large soft shadows;
- high-resolution full-screen background images;
- unnecessary gradients;
- continuous animations;
- frequent full-screen invalidation.

Subtle single-colour gradients or small shadows may be used only if performance remains acceptable.

### Buffers and colour

Configure display buffers and colour format according to the supported Waveshare display driver and available PSRAM.

The developer should verify:

- LVGL colour depth;
- RGB565 compatibility;
- draw-buffer size;
- partial versus full rendering mode;
- double buffering where practical;
- memory use of fonts and images.

Do not assume that the concept images themselves will be used as full-screen backgrounds.

## 16. Data Model and Update Rules

The UI must not be tightly coupled to individual data-source implementations.

Create a view model or state layer with semantic fields, for example:

```c
typedef struct {
    bool valid;
    uint32_t age_ms;
    float value;
} numeric_value_t;
```

Suggested state groups:

- navigation / GPS state;
- anchor state;
- environmental state;
- AIS summary state;
- battery state;
- solar state;
- tank state;
- relay state;
- connectivity state;
- alarm state.

The UI should consume normalised application state rather than directly parse Signal K, network payloads, or sensor messages inside widget code.

### Update frequency

Use sensible update rates:

- clock: once per second or minute, depending on whether seconds are displayed;
- GPS / anchor position: when valid updates arrive, with visual refresh capped around 1 Hz;
- wind: approximately 1 Hz unless smoothing requires otherwise;
- depth: on data update, typically 1 Hz or slower;
- battery / solar: approximately 1–2 seconds;
- tanks: on change or at a low polling frequency;
- AIS summary: on relevant target update, not continuous full-list redraw.

Only update labels when their displayed value has actually changed.

## 17. Data Quality and Failure States

Every dynamic value must support at least these states:

- valid;
- stale;
- unavailable;
- fault / invalid.

Do not continue showing an old value indefinitely as though it were live.

Examples:

- `6.3 m` — valid
- `6.3 m · 12 s old` or muted stale indicator — stale
- `--` with `No depth data` — unavailable
- `Sensor fault` — fault

The precise stale threshold should be configuration-driven by data type.

### GPS failure

GPS degradation is particularly important for anchor watch.

If GPS becomes stale or invalid:

- show a prominent warning;
- stop implying that the anchor is secure;
- retain the last point only as historical information;
- display last-update age;
- do not silently clear the anchor alarm state.

## 18. Alarm Behaviour

Alarm severity levels:

- informational;
- warning;
- critical.

### Alarm presentation

- Informational: subtle, non-blocking
- Warning: amber, visible in top bar and relevant card
- Critical: red, prominent, with clear description and acknowledgement path

Alarm text must identify the condition, not merely show a generic symbol.

Examples:

- Anchor distance approaching limit
- Anchor alarm: vessel outside radius
- GPS data unavailable
- Battery level low
- Fresh-water level low
- LPG level low
- Depth below configured minimum

Use sound or external alert behaviour only if separately defined in firmware requirements.

## 19. Interaction and Safety

The Overview screen is primarily informational.

Permitted interactions may include:

- tapping the anchor panel to open Anchor Watch;
- tapping battery, solar, tank, or relay summary to open Systems;
- tapping AIS summary to open a simple target list if that feature is implemented;
- tapping an alarm to view detail.

Avoid placing frequently changing information directly beneath touch targets in a way that causes layout movement.

### Confirmations

Require confirmation for consequential actions, including:

- setting a new anchor position;
- disabling anchor alarm;
- clearing anchor history;
- switching configured safety-sensitive relays.

Do not require confirmation for normal navigation or routine lighting controls unless configured.

## 20. Layout Responsiveness and Determinism

Although the immediate target is fixed at 800 × 480, organise the UI using reusable components and layout constants rather than scattered absolute coordinates.

Use:

- central spacing constants;
- shared card styles;
- standard header heights;
- common typography styles;
- reusable status rows;
- common bar components;
- semantic colour tokens.

A fixed embedded UI still benefits from a simple design system.

Suggested style tokens:

```c
#define UI_SCREEN_W              800
#define UI_SCREEN_H              480
#define UI_TOP_BAR_H              40
#define UI_BOTTOM_NAV_H           54
#define UI_GAP                     8
#define UI_CARD_RADIUS            10
#define UI_TOUCH_MIN_H            50
```

The exact values should be tuned against the physical display.

## 21. Suggested Component Structure

A possible implementation structure is:

```text
ui/
  ui_app.c
  ui_app.h
  ui_theme.c
  ui_theme.h
  ui_state.c
  ui_state.h
  screens/
    overview_screen.c
    overview_screen.h
    anchor_watch_screen.c
    anchor_watch_screen.h
    systems_screen.c
    systems_screen.h
  components/
    top_status_bar.c
    bottom_navigation.c
    metric_card.c
    status_indicator.c
    tank_level_row.c
    connection_indicator.c
    anchor_plot.c
    alarm_modal.c
  assets/
    icons/
  fonts/
```

This is a recommendation, not a mandatory repository structure. Preserve existing project conventions where they are already established.

## 22. Overview Acceptance Criteria

The Overview screen is acceptable when:

- it renders natively at 800 × 480 without scaling from a larger mock-up;
- all primary values are readable on the physical 7-inch display;
- the anchor panel is the obvious focal point;
- the screen contains only the agreed scope;
- the top bar contains only operationally relevant status;
- the bottom bar contains exactly three navigation options;
- relay status is summarised, not exposed as six small buttons;
- colour conveys state consistently;
- stale and unavailable data are clearly represented;
- the UI remains responsive during data updates;
- there is no continuous unnecessary full-screen redraw;
- touch targets are usable with a finger in a marine environment.

## 23. Full Application Acceptance Criteria

The application is acceptable when:

- Overview, Anchor Watch, and Systems are accessible from persistent navigation;
- navigation state is visually clear;
- anchor-alarm state remains consistent across screens;
- consequential actions use confirmation dialogues;
- data source failure does not leave misleading live-looking values;
- cards and components use a consistent visual system;
- the display performs reliably for prolonged operation;
- memory use remains within the ESP32-S3 target limits;
- UI logic remains separate from Signal K, network, and sensor parsing;
- the physical display has been reviewed in both daylight cabin conditions and reduced night brightness.

## 24. Reference Images

The separate supplied images should be used to understand:

- visual hierarchy;
- dark marine styling;
- three-column Overview concept;
- central anchor-status emphasis;
- card grouping;
- semantic blue, green, amber, and red usage;
- bottom three-item navigation.

They must not be treated as exact measurements or copied as a single bitmap.

Where a reference image conflicts with this written specification, this document takes precedence.

## 25. Initial Development Sequence

Recommended delivery order:

1. Create the shared theme, typography, spacing, and colour tokens.
2. Implement top status bar and bottom navigation.
3. Build the Overview layout using static placeholder data.
4. Validate the Overview on the physical 800 × 480 display.
5. Implement the anchor plot as an isolated reusable component.
6. Connect normalised live state to Overview.
7. Add stale, unavailable, warning, and critical states.
8. Build the detailed Anchor Watch screen.
9. Build the Systems screen and full relay controls.
10. Test touch usability, long-running performance, and low-brightness operation.

Do not defer physical-device validation until all screens are complete. Typography and density should be checked on the Waveshare screen as soon as the first static Overview is available.

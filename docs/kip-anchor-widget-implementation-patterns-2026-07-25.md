# KIP Anchor Situation Widget: Implementation and Test Patterns

## Purpose

This note identifies the KIP `4.8.0` code patterns to reuse when implementing
the proposed Krishna Anchor Situation widget. It is based on read-only
inspection of the sibling repository:

```text
/home/antony-slack/Documents/repos/Kip
```

The inspected commit is:

```text
417348d9d5948e17ea9f8c715ab3d37cc3fea555
```

The same commit is exposed by the upstream repository as both `v4.0.8` and
`v4.8.0`. Krishna packaging must pin the commit as well as recording the
intended `v4.8.0` product baseline so the ambiguous tag does not silently move
the implementation onto a different source state.

No KIP source was changed during this review.

## Governing KIP Rules

Implementation must follow:

- `.github/instructions/project.instructions.md`
- `.github/instructions/angular.instructions.md`
- `.github/instructions/best-practices.instructions.md`
- `.agents/skills/kip-host2-widget/SKILL.md`
- `.agents/skills/kip-widget-creation/SKILL.md`
- `.agents/skills/angular-testing/SKILL.md`

The practical consequences are:

- create a Host2 widget, not a legacy base-widget subclass;
- start with `npm run generate:widget`;
- make `DEFAULT_CONFIG` complete and explicit;
- observe configured paths through `WidgetStreamsDirective`;
- keep temporary display state in signals rather than mutating configuration;
- use KIP units, theme roles and resize infrastructure;
- add domain tests beyond a creation test;
- put custom configuration UI under `src/app/widget-config/`.

## Recommended New Widget Shape

Use the schematic to create one Component-category widget:

```text
widget-krishna-anchor-situation/
  krishna-anchor-situation.component.ts
  krishna-anchor-situation.component.html
  krishna-anchor-situation.component.scss
  krishna-anchor-situation.component.spec.ts
  README.md
```

Suggested registration identity:

```text
title: Krishna Anchor Situation
selector: widget-krishna-anchor-situation
category: Component
icon: anchorWatch
```

The existing `anchorWatch` SVG symbol is already suitable. Do not create a
near-duplicate icon unless physical-screen review demonstrates a real need.

Use a separate pure TypeScript model/geometry module if the component begins
to accumulate coordinate, age and state rules:

```text
anchor-situation.model.ts
anchor-situation.geometry.ts
anchor-situation.geometry.spec.ts
```

The component should own stream-to-view-model coordination. Pure functions
should own bearing, distance, plot scaling, trail bounding and semantic-state
selection.

## Exact Runtime Patterns to Reuse

### Host2 inputs and runtime guards

Use `src/app/widgets/widget-gauge-ng-compass/widget-gauge-ng-compass.component.ts`
as the basic Host2 example:

- `input.required<string>()` for `id` and `type`;
- `input.required<ITheme | null>()` for `theme`;
- `ChangeDetectionStrategy.OnPush`;
- injected `WidgetRuntimeDirective` and `WidgetStreamsDirective`;
- effects that first guard `runtime.options()`, theme and path configuration;
- stream registration inside one `untracked()` block.

The anchor widget should register all deterministic paths together. Likely
logical keys include current position, anchor position, alarm radius and
state, heading, wind direction and wind speed.

Every path entry needs an explicit `description`, `path`, `source`,
`pathType`, `isPathConfigurable`, units and `sampleTime`. Optional
plugin-dependent paths should use `pathRequired: false`; no path should be
invented merely to make the configuration dialog pass.

### Stream sampling, conversion and timeout

Reuse `src/app/core/directives/widget-streams.directive.ts`.

It provides:

- immediate first data followed by sampled updates;
- numeric conversion through `UnitsService`;
- path/source signature tracking;
- subscription replacement when configuration changes;
- optional timeout and automatic cleanup.

Important constraint: `dataTimeout` is documented in
`widgets-interface.ts` as minutes, but `WidgetStreamsDirective` multiplies it
by `1000`, so runtime behaviour is seconds. Treat the current implementation
as seconds and add a regression test or resolve the documentation mismatch
before exposing this value as a user-facing anchor safety setting.

The single widget-level timeout also cannot express different GPS, wind and
anchor-state stale thresholds. Continue using `WidgetStreamsDirective`, but
track each packet timestamp in the widget view model and calculate semantic
freshness per field. A stale or invalid GPS input must override all other
conditions and must never produce `Anchor secure`.

### Responsive SVG rendering

Reuse these parts of
`src/app/widgets/widget-ais-radar/widget-ais-radar.component.ts`:

- `KipResizeObserverDirective` and a size signal;
- a render-state snapshot separate from live input signals;
- one queued `requestAnimationFrame`, avoiding multiple renders in a frame;
- bounded caches and removal of entries no longer in the source set;
- keyed SVG joins where D3 is used;
- normalized angles through a `wrapDegrees` helper;
- shortest-angle rotation where animation is appropriate;
- polar-to-Cartesian conversion;
- clearing scheduled frames and timers during `ngOnDestroy`.

The AIS widget is a useful rendering reference, not a component dependency.
Do not inject `AisProcessingService` merely to reuse its public bearing
method. Anchor geometry is a separate domain and should live in a small,
tested shared navigation utility or the anchor widget's pure geometry module.

The AIS implementation contains a few literal fallback colours in TypeScript.
Do not copy those literals. The KIP project rules require theme roles and CSS
variables.

### Compass and angle presentation

Reuse concepts from:

- `src/app/widgets/widget-gauge-ng-compass/`
- `src/app/widgets/svg-windsteer/`
- `src/app/widgets/widget-ais-radar/widget-ais-radar.component.ts`

Specifically:

- suppress the plot until essential inputs have arrived;
- render the first valid angle without animation;
- animate only subsequent changes;
- take the shortest path across `0/360`;
- distinguish a legitimate zero from missing data;
- use theme zone roles for warning/alarm value treatment.

Do not embed the existing canvas compass inside the anchor plot. Its
`ng-canvas-gauges` lifecycle, private drawing model and fixed gauge semantics
make it awkward to layer the boat, anchor, alarm radius, wind and trail. A
purpose-built SVG plot will be easier to test and closer to the LVGL design.

### AIS context

Reuse `AisProcessingService.targets` only if the future widget directly shows
nearby-target context. It already normalises Signal K AIS trees and throttles
target updates. Do not duplicate AIS tree parsing in the anchor widget.

For the first Anchor Situation implementation, AIS should remain outside the
widget. The separate AIS Radar or a later Krishna status-card widget can
provide target context without increasing anchor safety logic.

### Theme and state colours

Use:

- `src/app/core/utils/themeColors.utils.ts`;
- `getColors()`;
- `resolveZoneAwareColor()`;
- the supplied `ITheme` zone roles;
- KIP CSS variables in SCSS.

Do not hard-code colour hex values in TypeScript or SCSS. The component must
remain legible in default dark, Night Mode, Red-Only Night Mode and
High-Contrast modes.

## Existing Anchor Watch: What Not to Reuse

`src/app/widgets/widget-anchor-alarm/` is a same-origin iframe wrapper around:

```text
/signalk-anchoralarm-plugin/
```

It contains no native anchor state or plot logic. Its useful patterns are
limited to:

- validating a same-origin application URL before bypassing sanitisation;
- forwarding swipe/key gestures from an embedded page;
- removing window listeners and injected scripts on destroy;
- blocking iframe interaction while a dashboard is editable.

The new widget should not be derived from this component. It would retain the
internet-map dependency, inherit the external application's layout and make
semantic stale-data guarantees difficult to enforce.

The existing anchor iframe also has an empty `DEFAULT_CONFIG` and no direct
component spec. Neither is an acceptable precedent for the Krishna widget.

## Configuration UI Pattern

The root configuration dialog is:

```text
src/app/widget-config/root-modal-widget-config/
```

It recursively creates form groups from `DEFAULT_CONFIG` and conditionally
shows controls based on the presence and shape of properties. Standard path,
colour, timeout and zone controls therefore require no new UI.

Reuse:

- `PathControlConfigComponent` for path selection, source, unit and
  `pathRequired` validation;
- `PathsOptionsComponent` for timeout settings;
- the compass `gauge` conditionals as an example of nested-option handling;
- `AisTargetOptionsComponent` as the pattern for a dedicated nested form
  editor that adds missing controls defensively.

Add a dedicated `AnchorSituationOptionsComponent` only for properties the
generic dialog cannot express, such as:

- plot trail duration or maximum points;
- warning proportion of alarm radius;
- semantic stale thresholds;
- overview versus detailed presentation mode;
- optional wind overlay.

If such a group is added:

- define its type in
  `src/app/core/interfaces/widgets-interface.ts`;
- add a named root key such as `anchorSituation`;
- teach `RootModalWidgetConfigComponent.generateFormGroups()` to treat it as a
  nested group;
- add the options component to the root dialog imports and template;
- test missing-group migration and persistence of every option.

Anchor-setting and alarm-disable controls are deliberately out of scope for
the first read-only widget. Do not add PUT fields or confirmation UI until the
actual plugin contract has been verified.

## WidgetService and Icon Registration

`src/app/core/services/widget.service.ts` requires three aligned edits:

1. import the component;
2. add it to `_componentTypeMap`;
3. add a `WidgetDescription` to `_widgetDefinition`.

The schematic performs these edits when invoked with
`--register-widget Component`, but the result must still be reviewed.

Recommended initial constraints:

```text
minWidth: 4
minHeight: 4
defaultWidth: 10
defaultHeight: 12
requiredPlugins: []
```

Do not declare the existing `anchoralarm` plugin as required while the widget
can display navigation and unavailable anchor state without it. If verified
anchor paths are supplied only by that plugin, represent the dependency in
the description and runtime state until plugin-dependency behaviour is
explicitly decided.

The `anchorWatch` icon in `src/assets/svg/icons.svg` uses theme-aware
`currentColor` and can be reused. Icon tests are supported by `src/test.ts`,
which registers the real SVG icon set in the global TestBed environment.

## Test Pattern

### Component setup

Follow the structure in:

- `widget-bms.component.spec.ts`;
- `widget-solar-charger.component.spec.ts`.

Use:

- Vitest;
- standalone component imports in TestBed;
- signal inputs set with `fixture.componentRef.setInput()`;
- explicit `id`, `type` and `theme`;
- a runtime directive mock whose options value can change;
- a stream directive mock that records callbacks by logical path key;
- fixed timestamps;
- a complete theme mock containing normal and all zone roles.

KIP's `src/test.ts` already provides zoneless change detection,
`ResizeObserver`, canvas, icons and common service stubs globally. A local
provider should override the global `WidgetStreamsDirective` stub when tests
need to emit path updates.

### Required pure-logic cases

Test at minimum:

- degree wrapping for negative, `0`, `359`, `360` and values above `360`;
- shortest-angle transitions across north in both directions;
- distance and bearing for known coordinates;
- coincident anchor/boat positions;
- alarm-radius scaling and clamping;
- warning threshold below the alarm boundary;
- critical state outside the boundary;
- invalid, null and non-finite coordinates;
- stale GPS overriding secure/warning calculations;
- out-of-order timestamps being ignored or classified deterministically;
- bounded trail eviction and reset.

### Required component cases

Test at minimum:

- no subscription occurs until runtime config and required paths exist;
- all explicit path observers are registered together;
- a valid first fix renders immediately without a sweep animation;
- later heading/position changes queue at most one animation frame;
- zero heading, zero wind and zero distance remain visible;
- missing anchor position displays unavailable, not secure;
- stale GPS displays last-update age and suppresses secure state;
- warning, alarm and fault states use the corresponding theme roles;
- resizing updates the SVG viewport without losing trail state;
- repeated renders do not duplicate SVG boat, anchor, radius or trail nodes;
- destroy cancels pending animation frame/timer work.

Reuse the request-animation-frame spy pattern from
`svg-windsteer.component.spec.ts`. Reuse the repeated-render DOM-count
assertion from `widget-solar-charger.component.spec.ts`.

Do not use `fakeAsync()` or `tick()`. KIP is zoneless; use
`vi.useFakeTimers()` with `vi.advanceTimersByTimeAsync()` and always restore
real timers in `finally`.

### Configuration and registration cases

Extend:

- `root-modal-widget-config.component.spec.ts`;
- `path-control-config.component.spec.ts`;
- `widget.service.spec.ts`.

Assert:

- optional empty plugin paths keep the form valid;
- required navigation paths use existing path/source/unit validation;
- existing saved configurations missing newly introduced options receive
  defaults without data loss;
- save returns the full raw nested configuration, including disabled
  non-configurable fields;
- selector, class map, category, icon and size constraints are aligned;
- the `anchorWatch` icon resolves from the actual icon set.

There are currently no direct component specs for Anchor Watch, AIS Radar,
Compass, `AisProcessingService` or the AIS icon utilities. Their code can
inform the implementation, but the absence of tests means it must not be
treated as validated behaviour. New geometry should be directly testable
rather than hidden exclusively behind private D3/component methods.

## Validation Gates Before Boat Deployment

Run in the KIP repository:

```sh
npm test -- --include='**/krishna-anchor-situation*.spec.ts'
npm test -- --include='**/widget.service.spec.ts'
npm test -- --include='**/root-modal-widget-config.component.spec.ts'
npm run lint
npm run build:prod
```

Confirm the exact test-filter syntax against the installed Angular builder
before relying on the focused commands; the full `npm test` remains the
release gate.

Then validate:

- `800 x 480` Overview and detailed layouts;
- default dark, Night, Red-Only and High-Contrast modes;
- valid, stale, unavailable and alarm fixtures;
- one-Hz updates and an extended browser soak;
- no live anchor or relay writes in the read-only release.

## Recommended Implementation Order

1. Scaffold and register the Host2 widget with the existing icon.
2. Add pure geometry/state types and tests.
3. Add complete read-only `DEFAULT_CONFIG`.
4. Wire deterministic Host2 streams into a normalised signal view model.
5. Implement responsive SVG with first-frame and scheduled-update rules.
6. Add explicit unavailable/stale/warning/alarm presentation.
7. Add only the configuration UI that generic KIP controls cannot supply.
8. Complete component, config and registration tests.
9. Run full lint, tests and production build.
10. Package and visually validate without replacing the boat's stock KIP.

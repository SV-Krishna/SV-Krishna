# KIP Custom Development and Deployment Baseline

## Purpose

This note defines how the Krishna-specific KIP work will be developed without
copying the KIP source tree into this repository or changing the live boat
installation during development.

The dashboard design and delivery scope remain in:

- `docs/kip-lvgl-dashboard-implementation-plan.md`
- `docs/lvgl-marine-dashboard-specification.md`

## Source Layout

Keep the projects as sibling repositories:

```text
Documents/repos/
├── SV-Krishna/       # design, data contract, profile exports and operations
└── Kip/              # maintained fork of mxtommy/Kip
```

Do not add KIP as a Git submodule, subtree or vendored directory in
`SV-Krishna`. The two projects have different release cycles and KIP's Node
dependencies and build output would add substantial unrelated content here.

The KIP repository should have:

- `upstream` pointing to `https://github.com/mxtommy/Kip.git`;
- `origin` pointing to the maintained SV-Krishna fork;
- an immutable baseline tag, `v4.8.0`, at upstream commit
  `417348d9d5948e17ea9f8c715ab3d37cc3fea555`;
- a working branch such as `krishna/v4.8-lvgl-dashboard`;
- optional short-lived feature branches for the anchor widget, semantic cards
  and panel chrome.

Do not commit directly on the upstream tag. Keep Krishna commits above the
unchanged upstream baseline so that the patch series can be reviewed and
rebased onto later KIP releases.

## Version and Package Identity

The installed boat baseline is KIP `4.8.0`, served at
`/@mxtommy/kip/`. Initial custom builds must preserve KIP's existing package
identity, plugin id and base path because changing those would also change
URLs, plugin storage and deployment behaviour.

Use an explicit pre-release version for generated artifacts, for example:

```text
4.8.0-krishna.1
```

Never publish a Krishna build under the unmodified upstream version number.
Do not publish it to the public npm registry. Record the upstream commit,
Krishna commit and package checksum with every candidate.

Renaming the package to allow stock and custom KIP to run side by side is not
part of the first implementation. KIP currently assumes the
`/@mxtommy/kip/` base path and plugin id `kip`; safely changing that identity
would be a separate migration.

## Development Sequence

### 1. Configuration-only prototype

Build the first `Krishna LVGL` profile in the stock KIP `4.8.0` installation.
Keep the existing `Krishna` profile unchanged. Export the prototype as a
versioned JSON artifact with a checksum and record every configured Signal K
path in the data contract.

This phase answers layout, information hierarchy, path, units and touch-size
questions before a KIP fork becomes a runtime dependency.

### 2. Custom-widget development

Create widgets in the sibling KIP fork using KIP's Host2 schematic and
contracts:

```bash
npm ci
npm run generate:widget -- --name <name> --title "<title>" \
  --description "<description>" --icon <icon> \
  --register-widget Core
```

Custom widgets must use KIP runtime and stream directives, theme roles and
existing units services. They must not bypass KIP's Signal K data services.
The configuration-only dashboards should remain loadable; replace stock
placeholders with custom widgets incrementally rather than recreating all
three pages at once.

### 3. Optional shell work

Only after the three dashboards have been reviewed at `800 x 480`, add the
opt-in persistent top status and bottom navigation treatment. Keep this patch
isolated from Signal K services and preserve normal KIP behaviour when panel
mode is disabled.

## Build and Release Artifact

Run the upstream gates in the KIP fork:

```bash
npm ci
npm test -- --watch=false
npm run lint
npm run test:plugin
npm run build:all
npm pack
```

The release artifact is the resulting npm tarball, not a copied `dist/`
directory. Archive it with:

- the exact filename and SHA-256 checksum;
- upstream and Krishna Git commit ids;
- Node and npm versions;
- test/build results;
- the compatible `Krishna LVGL` profile export.

Build on the workstation. A clean checkout at the recorded commit must be able
to reproduce the package before it is considered a deployment candidate.

## Staged Installation

No custom package should first be installed on the live boat instance.

1. Back up the complete Signal K configuration and
   `/home/pi/.signalk/applicationData/global/kip/`.
2. Preserve a copy of the installed upstream KIP package/version and download
   or build an upstream `v4.8.0` rollback tarball.
3. Install the candidate through the Signal K-supported local package
   installation workflow on a test instance.
4. Restart Signal K and verify the service, `/@mxtommy/kip/`, all existing
   profiles and the new profile.
5. Test at `800 x 480`, including reconnect, null/stale data, night/red mode
   and browser restart.
6. Promote to the boat only after the test instance and rollback rehearsal
   succeed.

The exact local-package command is deliberately not fixed here until it has
been exercised against the target Signal K version. Record that verified
command in an execution log before live promotion.

## Rollback

Rollback has two independent layers:

1. **Application rollback:** reinstall the archived upstream KIP `v4.8.0`
   tarball using the same verified Signal K package workflow and restart
   Signal K.
2. **Configuration rollback:** restore the checksummed KIP application-data
   backup, or select the untouched `Krishna` profile if the stored data remains
   valid.

After rollback, verify:

- Signal K is active;
- KIP reports `4.8.0`;
- `/@mxtommy/kip/` loads;
- the original profile and dashboard count match the baseline;
- representative navigation and battery values update.

Do not call rollback complete based only on a successful package command.

## Upgrade Policy

For a later KIP release:

1. fetch and tag the new upstream release;
2. create a new `krishna/<version>-lvgl-dashboard` branch from that tag;
3. rebase or cherry-pick the Krishna patch series;
4. review Host2, `WidgetService`, dashboard shell, theme and plugin changes;
5. rerun unit, lint, plugin, production-build and `800 x 480` visual tests;
6. repeat staged installation and rollback rehearsal.

The stock profile export and data contract belong in `SV-Krishna`. Widget and
shell implementation belongs in the KIP fork. Deployment evidence belongs in
this repository's `execution-logs/`.

## Current Status

This is a documentation-only development baseline. The upstream tag and commit
were inspected, but no maintained fork/worktree was created, no package was
built, and neither the live KIP application nor Signal K was changed.

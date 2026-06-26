# Repository Working Conventions

## Purpose

This repository is the working codebase for the `SV Krishna` Raspberry Pi offline voice assistant and its associated marine-control integrations.

The primary objective is to keep a locally operable, debuggable voice stack on Raspberry Pi hardware using:

- local ASR (`Whisper`)
- local TTS (`Piper`)
- local intent / command handling
- thin local web and terminal control surfaces
- marine telemetry and control integrations where explicitly wired into the stack

Work in this repo should prefer operational clarity over novelty. Changes should preserve a clean path from:

1. local development on the workstation
2. deployment to the Test Pi
3. verification on-device with explicit evidence
4. promotion only after the Test Pi state is understood

This repo also contains supporting assets such as:

- deployment and runbooks in `docs/`
- hardware-related Python helpers in `python/`
- local device and tooling assets in `local/`
- firmware-related material in `firmware/`

## Deployment And Recovery Conventions

- Treat the Test Pi as the first deployment target for any meaningful runtime change.
- Prefer build-on-workstation, deploy-to-Pi workflows unless a document explicitly says otherwise.
- Keep deployment steps consistent with `docs/deploy-local-to-pi.md`.
- When changing runtime code used by the Pi service, deploy the built `dist/` output and any required Python/runtime helper files together.
- After deployment, restart the relevant service and verify:
  - service is `active`
  - preflight output is acceptable for the scope of change
  - the intended user-facing path can be smoke tested
- Do not describe a deployment as green unless the changed behavior has been verified on the Test Pi.
- When a change affects device state, hardware control, or audio routing, capture the exact observed state after restart rather than assuming defaults.
- If a runtime or deployment problem leaves the service in a degraded or misleading state, restore a known-safe state before signing off.
- Prefer additive recovery steps over destructive ones. Do not reset or overwrite unrelated Pi state unless explicitly required.
- Distinguish clearly between:
  - local code complete
  - deployed to Test Pi
  - smoke tested on Test Pi
  - promoted beyond Test Pi

## Evidence And Logging

- Maintain `docs/log.md` as the project change diary and execution log.
- For any meaningful analytical, schema, or deployment change, add a dated entry describing:
  - intent
  - files added or changed
  - whether a sandbox recovery step was taken
  - whether the work was executed or is documentation / code-preparation only
  - any follow-up actions
- Store execution evidence in `execution-logs/` when scripts are actually run.
- For Pi operations, preserve enough evidence that another agent can tell:
  - which host was targeted
  - which service was restarted
  - which smoke test was run
  - what the observed result was
- For hardware-facing changes, record concrete device observations where relevant, such as:
  - ALSA device names
  - USB identifiers
  - service preflight results
  - LED / relay / playback state observed after deployment

## Documentation Conventions

- Update `docs/README.md` when adding new handover or design notes.
- Keep the current-state narrative aligned with the assets locally and on the Test Pi.
- When assumptions are introduced, state them explicitly in the relevant note and in `docs/log.md`.
- Use `docs/` for runbooks, handovers, design notes, deployment notes, and operational findings.
- Keep handover notes concrete and stateful. A good handover should tell the next agent:
  - what changed
  - what was deployed
  - what was verified
  - what remains broken or uncertain
  - the next recommended action
- When documenting Pi behavior, separate:
  - verified live state
  - expected state from code
  - unresolved issues
- Prefer dated filenames for handovers and ops notes when they capture a point-in-time operational state.
- If a referenced convention file such as `docs/log.md` or `docs/README.md` does not yet exist or is incomplete, create or update it as part of the relevant work rather than leaving the convention implicit.

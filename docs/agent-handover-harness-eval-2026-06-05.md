# Agent Handover — Harness Evaluation — 2026-06-05

## Scope

- Repo: `/home/antony-slack/Documents/SV-Krishna`
- User goal: run a strict evaluation of the TejasQ harness approach from:
  - `https://github.com/TejasQ/basically-ai-harness`
- Most important requirement:
  - do **not** dilute the methodology with local rescue logic
  - do **not** mix in `Rasa`
  - do **not** mix in deterministic pre-parsing
  - do **not** mix in generic fallback LLM behavior

## Primary Objective

Build a separate voice-command route that follows the Tejas harness principles as faithfully as possible, so the team can later report empirical evidence about whether that harness pattern works well for this marine voice-control problem.

The route to evaluate is:

- `Whisper transcript -> harness -> SignalK / relay tools -> final answer`

The harness must be the decision-maker for supported commands.

## Why This Matters

The user explicitly wants a controlled experiment, not a hybrid.

If current local routing aids remain in the path, results will be contaminated and will not constitute valid evidence about the harness approach itself.

## What “Faithful Adoption” Means Here

The evaluation path must preserve these principles:

- the model operates inside a narrow tool environment
- the tool registry constrains what the model can do
- the system prompt constrains the model’s scope
- the model chooses whether to call a tool
- the harness owns the command-selection behavior for that route
- out-of-scope or ambiguous requests are rejected cleanly

The evaluation path must **not** include:

- `Rasa` transcript normalization
- deterministic telemetry parsing before the model
- deterministic relay parsing before the model
- generic fallback chat after harness failure
- hidden repair logic that improves outcomes without the harness owning that improvement

## External Repo Findings

The referenced repo is a model-first harness demo, not a domain-specific router.

What it demonstrates:

- tool registry
- scoped context
- model tool-calling loop
- constrained environment
- harness-managed lifecycle

Important nuance:

- the README describes a fuller harness than the current repo implementation actually contains
- `agent/5-loop.ts` is the key implemented artifact: model call, tool call execution, append tool result, repeat
- `agent/6-harness.ts` and `agent/4-guardrails.ts` are currently empty in the checked GitHub state on `2026-06-05`
- `agent/7-index.ts` currently performs the effective lifecycle wiring

This means the spirit to copy is:

- narrow tools
- narrow prompt
- model-first command choice
- explicit tool-call trace

not necessarily a large framework abstraction.

## Current Local State

Current local voice route is **not** suitable as the experiment route because it mixes multiple helpers before and after the harness.

### Current route order

In `src/controller.ts:322` onward the flow is currently:

- Whisper transcript
- `normalizeTranscriptWithRasa(...)`
- `tryHandleMarineHarnessCommand(...)`
- `tryHandleAnchorAlarmCommand(...)`
- `executeTelemetryQuery(...)`
- broader relay/chat fallbacks later in the controller

Relevant references:

- `src/controller.ts:322`
- `src/controller.ts:328`
- `src/controller.ts:346`
- `src/controller.ts:367`

### Current harness behavior

The current harness in `src/services/marineCommandHarness.ts` is also not a faithful Tejas experiment because it includes deterministic pre-model shortcuts:

- deterministic telemetry parse at `src/services/marineCommandHarness.ts:268`
- deterministic relay parse at `src/services/marineCommandHarness.ts:273`
- then only later model tool-calling at `src/services/marineCommandHarness.ts:301`

It also contains a specific early return for drop-anchor prompts without numbers:

- `src/services/marineCommandHarness.ts:259`

That may be appropriate for production safety, but it is still custom local routing behavior and must be treated carefully in the experiment design.

## Required Implementation Direction

Create a separate, isolated route or mode for strict harness evaluation.

Recommended shape:

- keep current production route intact
- add a new harness-only route for voice evaluation
- pass raw Whisper transcript directly into the harness
- expose only the intended SignalK / relay / anchor tools
- let the harness decide tool use
- return either:
  - tool-backed answer
  - explicit out-of-scope / ambiguous refusal

## Recommended Harness Contract

For the strict evaluation path:

- input:
  - raw Whisper text
- context:
  - minimal recent conversation only if truly needed
- tools:
  - only explicit marine tools
- output:
  - final answer text
  - tool-call trace
  - clear reason when no tool is called

## Recommended Tool Scope

The tools for the experiment should be narrow and explicit, for example:

- read current depth
- read current speed
- read current wind speed
- read battery voltage
- read cabin temperature
- read relay status
- set relay on/off
- set all relays on/off
- drop anchor / enable anchor alarm if that remains within evaluation scope

The key point is that the model chooses from a limited set rather than having a broad chat surface.

## Logging Requirements

The evaluation route must produce enough evidence to judge the approach honestly.

At minimum log:

- timestamp
- raw Whisper transcript
- harness system prompt version
- tool definitions exposed for that run
- each model iteration
- each tool call name
- tool call arguments
- tool result
- final answer
- no-tool outcome when applicable
- total latency

Without this, comparison against the Tejas approach will be anecdotal rather than empirical.

## Non-Negotiable Experiment Rules

These constraints come directly from the user’s stated goal.

Do not:

- silently normalize the transcript before the harness
- rewrite user phrasing into canonical prompts before the harness
- short-circuit common commands with deterministic parsers
- fall back to a general assistant when the harness does not know what to do
- describe the result as “harness success” if local code outside the harness produced the success

## Practical Risk

A strict harness-only route will probably perform worse than the current hybrid route on noisy ASR.

That is acceptable and expected in an experiment.

The purpose is not to make the harness look good. The purpose is to measure whether the approach works in this environment when adopted faithfully.

## Suggested Acceptance Criteria

The next agent should consider the experiment route ready when:

- raw Whisper text reaches the harness directly
- `Rasa` is not used on that route
- deterministic command parsers are not used on that route
- no generic fallback LLM is used on that route
- tool calls are limited to the defined marine tool set
- logs clearly show model decisions and tool traces
- the route can be exercised repeatedly from speech input on the Pi

## Recommended Next Steps

1. Add a dedicated harness-eval route or mode.
2. Wire raw Whisper transcript directly into that route.
3. Reuse existing SignalK and relay backends only as tool implementations.
4. Remove all helper routing logic from that route.
5. Add structured logging for transcript, tool calls, and latency.
6. Run repeated voice trials and collect results.

## Files Most Likely To Change

- `src/controller.ts`
- `src/services/marineCommandHarness.ts`
- `src/web/webServer.ts`
- possibly a new dedicated service file for a strict harness-eval path

## Files To Inspect First

- `src/controller.ts:322`
- `src/controller.ts:328`
- `src/controller.ts:346`
- `src/controller.ts:367`
- `src/services/marineCommandHarness.ts:254`
- `src/services/marineCommandHarness.ts:268`
- `src/services/marineCommandHarness.ts:273`
- `src/services/marineCommandHarness.ts:301`

## Final Instruction To The Next Agent

Treat this as a scientific comparison, not a product polish task.

The user’s most important requirement is methodological fidelity to the Tejas harness pattern. If a local convenience improves outcomes but violates that requirement, do not include it in the evaluation route.

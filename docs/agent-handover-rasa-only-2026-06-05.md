# Agent Handover — Rasa-Only Reset — 2026-06-05

## Scope

- Repo: `/home/antony-slack/Documents/SV-Krishna`
- Target Pi: `192.168.68.203`
- Direction change:
  - archive the recent LLM and harness-eval work
  - re-code the active solution to use:
    - wake word
    - Whisper
    - Rasa
    - existing action backends and TTS
- Remove from the active runtime:
  - Ollama
  - all LLM routes
  - all fallback LLM behavior
  - harness / harness-eval model-routing logic
  - RAG-dependent conversational fallback

## Decision

The project is drawing a line under the recent LLM exploration.

The active production direction is now:

- wake word detects the command window
- Whisper transcribes speech
- Rasa is the only decision engine
- backend services execute actions
- response text comes from Rasa and is spoken directly

This means there should be no remaining active code path where:

- a user utterance is sent to an LLM
- a fallback LLM is consulted
- a model paraphrases or rewrites a backend result

## Clarified Requirements

- Keep Whisper.
- Rasa is the decision engine for both voice input and typed input.
- Remove any LLM-based paraphrasing or rewriting layer.
- Disable LLM paths completely first, then remove dead code after the Rasa-only flow is green.
- Simplify the web UI so it reflects a Whisper + wake word + Rasa system rather than an LLM system.

## Target Runtime Flow

### Voice

- wake word
- audio capture
- Whisper transcription
- Rasa intent and entity handling
- backend action execution
- response text
- TTS playback

### Typed

- typed input
- Rasa intent and entity handling
- backend action execution
- response text

## Plan

### 1. Archive the LLM experiment state

- Move current LLM evaluation and handover material into a clearly marked archive area if needed.
- Preserve the historical notes for:
  - harness eval
  - model comparisons
  - Pi smoke runs
- Add a brief closure note stating that the LLM branch was exploratory and is superseded by a Rasa-only architecture.

### 2. Inventory every active LLM dependency

- Trace all code paths that touch:
  - Ollama
  - harness / harness-eval
  - fallback chat
  - tool-calling model logic
  - RAG-based conversational fallbacks
- Confirm where these paths enter the runtime:
  - controller
  - web endpoints
  - startup / preflight
  - status reporting
  - UI

### 3. Hard-disable all LLM paths first

- Put every LLM path behind a hard disable so it is unreachable in active runtime.
- Remove any routing logic that chooses between Rasa and an LLM.
- Ensure typed input and voice input both go only to Rasa.
- Ensure there is no silent fallback to Ollama or any model-backed reply path.

### 4. Rework the controller to a strict Rasa-only pipeline

- Voice path:
  - wake word -> Whisper -> Rasa -> action -> response -> TTS
- Typed path:
  - text -> Rasa -> action -> response
- Keep backend action execution in app code, but let Rasa drive the decision and response selection.

### 5. Simplify active API surfaces

- Keep only endpoints needed for:
  - status
  - typed command submission
  - voice run
  - wake-word-driven voice flow
  - health
- Remove or disable active exposure of:
  - harness-eval endpoints
  - model test endpoints
  - LLM-only chat routes

### 6. Simplify the web UI

- Remove model-oriented language and controls.
- Remove any display of:
  - model name
  - harness state
  - LLM fallback state
  - RAG/agent wording that no longer applies
- Present the system in terms of:
  - wake word status
  - Whisper status
  - Rasa status
  - transcript
  - detected intent
  - action result
  - spoken reply

### 7. Simplify startup and preflight

- Remove Ollama from active startup assumptions.
- Remove Ollama/model checks from the active preflight path.
- Preflight should focus on:
  - audio capture
  - audio playback
  - Whisper
  - Rasa
  - wake word service
  - TTS
  - relay/marine backends

### 8. Test in two phases

#### Local

- typed command -> Rasa intent -> correct backend action
- voice command -> Whisper -> Rasa intent -> correct backend action
- unsupported utterance -> deterministic Rasa fallback
- no LLM calls present in logs

#### Pi

- deploy to test Pi
- verify wake-word flow
- verify 2-3 core marine commands
- verify one unsupported request
- verify no Ollama or model traffic is used anywhere in the active path

### 9. Remove dead LLM code after green

- Once the Rasa-only path is stable:
  - remove Ollama config/defaults
  - remove harness / harness-eval services and routes
  - remove fallback chat and obsolete model-selection code
  - remove UI branches that exist only for LLM behavior

### 10. Refresh docs and runbooks

- Update deployment docs.
- Update architecture docs.
- Update speech pipeline docs.
- Document the supported runtime clearly as a Rasa-first system.

## Recommended Implementation Order

1. hard-disable LLM paths
2. force all inputs through Rasa only
3. simplify preflight and status reporting
4. simplify the web UI
5. run local tests
6. deploy to Pi and run smoke tests
7. remove dead LLM code once green

## Key Architectural Rule

There should be exactly one decision engine in the active stack:

- Rasa

Everything else should support that path only:

- wake word opens capture
- Whisper produces transcript
- app code executes actions
- TTS speaks the chosen response

## Primary Risk

Some existing “good sounding” responses may currently depend on LLM rewriting.

In the Rasa-only design, response quality will come from:

- Rasa intent coverage
- entity extraction
- rules/stories
- response templates
- deterministic app-side rendering where needed

That is acceptable, but it means conversational polish must be handled in Rasa content and application logic rather than by a model.

## Suggested First Step

Start with a code inventory and hard-disable pass:

- identify every active LLM entry point
- make those paths unreachable
- confirm typed and voice flows both route only to Rasa


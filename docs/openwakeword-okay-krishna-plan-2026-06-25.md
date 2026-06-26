# OpenWakeWord Plan - "Hey Krishna" (updated 2026-06-26)

This note captures the current recommendation for the next wake-word work now that the
ReSpeaker XVF3800 routing has been validated.

## Decision

Use `Hey Krishna` as the wake phrase.

Rationale:

- it is longer and more distinctive than `Krishna`
- it remains natural to say
- it matches the trained model files now provided for deployment
- current XVF routing tests support keeping the ASR path on the XVF `right` channel

## Validated audio front end

The current test-Pi routing work supports:

- `AUDIO_INPUT_DEVICE=plughw:CARD=Array,DEV=0`
- `AUDIO_INPUT_CHANNELS=2`
- `AUDIO_INPUT_CHANNEL_SELECT=right`
- `RESPEAKER_XVF_ENABLED=true`

Routing probe outcome on the ReSpeaker XVF3800:

- `right` transcribed correctly at the tested on-axis and off-axis positions
- `mix` also transcribed correctly
- `left` was louder but produced one recognition regression (`debt` instead of `depth`)

Conclusion:

- keep `AUDIO_INPUT_CHANNEL_SELECT=right`

## Training objective

Train and deploy a custom OpenWakeWord model for:

- `Hey Krishna`

The model only needs to work for a single user, so user-specific tuning is acceptable and preferred.

## Practical training guidance

1. Use the dedicated `Hey Krishna` model rather than reusing the old `Krishna` model.
2. Use the validated XVF path for all real-device evaluation.
3. Prefer single-utterance command tests during evaluation:
   - `Hey Krishna what is our current depth`
4. Also test the pause form:
   - `Hey Krishna`
   - pause
   - `what is our current depth`
5. Tune threshold on the real device rather than assuming the default is best.

## Current deployed artifacts

The current supplied model artifacts are:

- ONNX: `/home/antony-slack/Downloads/hey_krishna!.onnx`
- TFLite: `/home/antony-slack/Downloads/hey_krishna!.tflite`

The active runtime uses the ONNX artifact because the Pi wake-word helper already runs the ONNX path.

Deployed test-Pi model path:

- `/opt/svkrishna/models/openwakeword/hey-krishna.onnx`

## First evaluation matrix

After the new model exists, evaluate at minimum:

- threshold `0.35`
- threshold `0.45`
- threshold `0.55`

For each threshold, test:

- normal speaking position
- about `100` degrees off-axis
- about `180` degrees off-axis
- about `260` degrees off-axis
- realistic cockpit/background noise

Track:

- false accepts
- false rejects
- whether the follow-up transcript is empty
- whether Whisper captures `Hey Krishna` plus command correctly

## Acceptance criteria

Treat the phrase as good enough when:

- false accepts are rare in the real room
- normal and off-axis detections are reliable for the single user
- the wake-triggered command transcript remains stable through Whisper
- no alternative phrase materially outperforms `Hey Krishna`

## Suggested next implementation step

Current deployment steps:

1. upload the ONNX model to `/opt/svkrishna/models/openwakeword/`
2. set:
   - `WAKE_WORD_PHRASE=Hey Krishna`
   - `WAKE_WORD_MODEL_PATH=/opt/svkrishna/models/openwakeword/hey-krishna.onnx`
3. keep `AUDIO_INPUT_CHANNEL_SELECT=right`
4. run threshold sweeps on the test Pi
5. keep the best threshold before any further phrase experiments

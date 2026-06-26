# Harness Eval Results — 2026-06-05

## Scope

- Device: test Pi `192.168.68.203`
- Route under test:
  - wake word
  - Whisper
  - strict harness eval
  - marine tools
  - spoken reply
- Time window reviewed:
  - local Pi time `2026-06-05 18:00` to `19:00`
  - JSONL log timestamps are UTC (`Z`), one hour behind BST

## Source Logs

- `journalctl -u svkrishna.service`
- `/opt/svkrishna/logs/harness-eval.jsonl`

## Observed Runs

| Local time | Transcript | Final answer | Harness latency |
| --- | --- | --- | ---: |
| 18:28:36 | `Krishna was the current depth.` | `Krishna's current depth is 6.0 meters.` | 127,941 ms |
| 18:31:31 | `Krishna, what is our current depth?` | `Our current depth is 6.3 meters.` | 67,364 ms |
| 18:32:56 | `I wish I was our current speed.` | `Your current speed is 0.14 knots.` | 68,161 ms |
| 18:35:36 | `Krishna turn on relay one` | `Relay 1 is now on.` | 71,544 ms |
| 18:37:28 | `Krishna turn off relay one` | `Relay 1 is now off.` | 71,812 ms |
| 18:47:56 | `Prichner current depth.` | `The current vessel depth is 6.5 meters.` | 127,169 ms |

## Summary

- Runs observed: `6`
- Fastest latency: `67,364 ms`
- Slowest latency: `127,941 ms`
- Typical successful runs in this window clustered around `68-72 seconds`
- Two depth queries took roughly `127 seconds`

## Notes

- The wake-word-triggered route was confirmed to enter the strict harness eval path during this window.
- ASR remained noisy in several runs:
  - `Krishna was the current depth.`
  - `I wish I was our current speed.`
  - `Prichner current depth.`
- Despite the noisy transcripts, the harness still produced tool-backed marine answers for all six observed runs.

## Follow-Up After Switch To `qwen2.5:1.5b`

After the later runtime switch to `qwen2.5:1.5b`, additional strict harness checks were run on the same test Pi.

### Typed smoke checks

| UTC timestamp | Transcript | Final answer | Harness latency | Outcome |
| --- | --- | --- | ---: | --- |
| 2026-06-05T18:10:43.049Z | `tell me a joke` | `I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.` | 31,306 ms | correct refusal |
| 2026-06-05T18:11:15.875Z | `what is our current depth` | `The current depth of the vessel is 5.8 meters.` | 6,145 ms | tool-backed answer |

### Wake-word runs

| Local time | Transcript | Final answer | Harness latency | Wake-word detect -> final reply |
| --- | --- | --- | ---: | ---: |
| 19:11:42 | `Press that, what is our current depth?` | `The current depth of the vessel is 5.7 meters.` | 6,412 ms | 14.0 s |
| 19:13:06 | `Fresh note what is our current depth?` | `The current depth of the vessel is 4.7 meters.` | 33,442 ms | 41.2 s |
| 19:15:40 | `Krishna, what is our current depth?` | `The current depth of the vessel is 5.9 meters.` | 62,842 ms | 70.8 s |

### Observations

- The strict route remained active after the model swap:
  - wake word
  - Whisper
  - harness eval
  - marine tool call
  - spoken reply
- The earlier failure mode where a no-tool outcome still returned a joke was corrected in code before the final smoke checks above.
- Latency on `qwen2.5:1.5b` was inconsistent:
  - best observed depth answer: about `6.1 s`
  - slowest observed wake-word depth answer after the swap: about `70.8 s` end-to-end

## Latest Wake-Word Test

### Run details

- Local time:
  - wake word detected at `19:57:05`
  - harness eval started at `19:57:06`
  - final spoken reply at `19:57:45`
- Transcript:
  - `First, we'll start current depth.`
- Harness latency:
  - `33,323 ms`
- End-to-end wake-word detect -> final reply:
  - about `40.3 s`

### Tool trace

- Iteration 1:
  - tool call: `read_depth`
  - tool result: `Depth is 5.6 meters.`
- Iteration 2:
  - assistant final answer: `Next, let's check the speed of the vessel.`

### Evaluation

- Route correctness:
  - passed
  - wake word -> Whisper -> strict harness eval -> tool call -> spoken reply
- Behavioral correctness:
  - failed
  - the model ignored the depth tool result in its final answer and drifted into unrelated follow-on wording

### Latest result summary

| Local time | Transcript | Tool result | Final answer | Harness latency | Outcome |
| --- | --- | --- | --- | ---: | --- |
| 19:57:05 | `First, we'll start current depth.` | `Depth is 5.6 meters.` | `Next, let's check the speed of the vessel.` | 33,323 ms | failure |

### Repeat of the same intended prompt

The operator clarified that the intended spoken test for the failed run above was:

- `What is our current depth`

That run is therefore best classified as:

- ASR-corrupted transcript
- not a clean prompt-following trial

The prompt was repeated immediately afterwards.

| Local time | Transcript | Tool result | Final answer | Harness latency | Wake-word detect -> final reply | Outcome |
| --- | --- | --- | --- | ---: | ---: | --- |
| 20:26:55 | `Krishna, what is our current depth?` | `Depth is 5.1 meters.` | `The current vessel depth is 5.1 meters.` | 33,349 ms | about 40.8 s | success |

### Interpretation

- The repeat run shows the strict route behaving correctly when the transcript is clean:
  - wake word
  - Whisper
  - strict harness eval
  - `read_depth`
  - correct final spoken answer
- The earlier `19:57` run should be retained in the record as an ASR-corrupted failure case, not as a clean language-model failure on the intended prompt.

## Follow-Up After Switch To `qwen3:0.6b`

The test Pi was then switched to `qwen3:0.6b` with strict harness eval still enabled.

### Typed smoke checks

| Local time | Transcript | Final answer | Harness latency | Outcome |
| --- | --- | --- | ---: | --- |
| 20:49:03 | `tell me a joke` | `I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.` | 32,168 ms | correct refusal |
| 20:49:03 | `what is our current depth` | `The current depth is 5.4 meters.` | 41,662 ms | tool-backed answer |

### Interpretation

- Route correctness:
  - passed
  - typed prompt -> strict harness eval -> marine tool selection/refusal -> final reply
- Behavioral correctness:
  - passed on both typed smoke checks
  - unsupported prompt refused cleanly
  - supported depth query called `read_depth` and grounded the final answer in the tool result
- Speed on these first `qwen3:0.6b` typed checks was:
  - slower than the best `qwen2.5:1.5b` typed run seen earlier
  - faster than the very slow `qwen2.5:1.5b` wake-word cases

### Latest wake-word runs

| Local time | Transcript | Final answer | Harness latency | Wake-word detect -> final reply | Outcome |
| --- | --- | --- | ---: | ---: | --- |
| 20:50:53 | `I'll push my bodies on current depth.` | `I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.` | 23,000 ms | about 34.6 s | ASR-corrupted refusal |
| 20:51:50 | `Prisham, what is our current depth?` | `The current depth is 6.4 meters.` | 33,313 ms | about 40.5 s | success |

### Latest wake-word interpretation

- The strict wake-word route remains correct on `qwen3:0.6b`:
  - wake word
  - Whisper
  - strict harness eval
  - marine tool/refusal
  - spoken reply
- ASR is still the main source of instability in live runs:
  - the first run was refused because the transcript was too corrupted to map cleanly onto a marine command
  - the second run succeeded even though the wake word was mis-transcribed as `Prisham`

## Trial Of `lfm2.5-thinking:1.2b-q4_K_M`

The originally requested `lfm2.5:1.2b` tag was not available as a usable tool-calling model on this Pi. Two nearby 1.2B LFM2.5 variants were checked:

- `LiquidAI/lfm2.5-1.2b-instruct:q4_0`
  - pulls successfully
  - exposes `completion` only
  - not usable for the strict harness because the route requires tool calling
- `lfm2.5-thinking:1.2b-q4_K_M`
  - pulls successfully
  - exposes `completion`, `tools`, and `thinking`
  - used for the smoke test below

### Typed smoke checks

| Local time | Transcript | Final answer | Harness latency | Outcome |
| --- | --- | --- | ---: | --- |
| 20:56:25 | `what is our current depth` | `I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.` | 33,572 ms | failure: no tool call on supported prompt |
| 20:56:25 | `tell me a joke` | `I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.` | 46,790 ms | correct refusal |

### Evaluation

- Smoke status:
  - failed
- Failure reason:
  - the model did not select `read_depth` for a direct supported marine query
  - the JSONL log recorded `refusalReason: no_tool_called`
- Conclusion:
  - `lfm2.5-thinking:1.2b-q4_K_M` is not suitable for the strict harness route in its current behavior on the test Pi

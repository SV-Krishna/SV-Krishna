# Marine LLM Tool-Calling and Performance Report (Pi)

Date: 2026-04-29  
Scope: SV-Krishna marine telemetry path (`SignalK + Influx + MCP + Ollama`) on Raspberry Pi 5 (8GB)

## 1. Objective

Validate whether small local LLMs can reliably perform MCP tool-calling for marine telemetry before considering alternative architectures, and quantify real response latency for live depth queries.

Constraint agreed during testing:
- Keep the system model/tool-call driven.
- Do not add deterministic direct SignalK answer paths as the main solution.

## 2. Test Environment

Host tested:
- `cluster03` (Raspberry Pi 5)
- CPU: 4x Cortex-A76 @ up to 2.4GHz
- RAM: 8GB
- OS kernel: `6.12.47+rpt-rpi-2712`

Service and endpoints:
- `svkrishna.service` running Node app from `/opt/svkrishna/app/dist/index.js`
- Web UI/API on port `8080`
- SignalK reachable locally at `http://127.0.0.1:3300`
- Influx reachable locally at `http://127.0.0.1:8087`

Primary test prompt:
- `what is our current depth`

Success criterion:
- API response contains a valid depth answer sourced from MCP-backed telemetry.

## 3. Key Functional Findings (Tool-Calling Support)

### 3.1 Models checked for tool-call capability in practice

Observed during direct and end-to-end testing:
- `gemma3:1b`: rejected tool payload (`does not support tools`)
- `deepseek-r1:1.5b`: rejected tool payload (`does not support tools`)
- `granite3.1-dense:2b`: accepted tool payload, but often did not emit usable `tool_calls`
- `llama3.2:3b`: emitted tool calls, but frequently produced malformed `execute_code`
- `qwen2.5:1.5b`: can emit native tool calls in simple probes; unstable in full telemetry flow
- `qwen2.5:3b`: best overall reliability in this code path

### 3.2 Regression check outcome for `qwen2.5:1.5b`

We verified that `1.5b` behavior was not just endpoint outage:
- Backends healthy (SignalK/Influx reachable)
- Failures came from unusable tool-call mapping in app flow (`toolCalls=1` but mapped calls empty)

Conclusion:
- `qwen2.5:1.5b` is currently too fragile for production telemetry in this pipeline.

## 4. Latency Results

## 4.1 `qwen2.5:3b` repeated run (N=10)

Depth prompt repeated 10 times on Pi:
- Success: `10/10`
- Durations (s):
  - `100.76, 16.14, 16.78, 16.26, 16.04, 16.31, 15.99, 16.18, 15.96, 15.53`
- Min: `15.53s`
- Avg: `24.60s`
- P95: `100.76s`
- Max: `100.76s`

Interpretation:
- Warm-path can be ~16s.
- Cold-start outlier is ~100s.

## 4.2 Controlled cold-start check

Method:
- Force unload model via `ollama stop qwen2.5:3b`
- Wait until unloaded
- Run single depth query

Result:
- `OK`, `97.83s`

Interpretation:
- Cold-start remains ~98-101s and is reproducible.

## 4.3 `qwen2.5:1.5b` single-shot checks

Two immediate single-shot tests:
- Run 1: `FAIL`, `49.06s`
- Run 2: `FAIL`, `2.99s`

Interpretation:
- Not a pure cold-start issue; reliability failure in tool-calling path.

## 5. Performance Enhancement Attempts and Outcomes

### 5.1 Keep-alive + periodic warmup

Changes tested:
- Added `keep_alive` in Ollama chat/tool requests
- Added periodic warm ping (`OLLAMA_WARMUP_INTERVAL_MS`)

Observed:
- Warm request remained ~16s when model already loaded
- Cold-start after unload/restart remained ~98-101s

Conclusion:
- Useful for keeping warm state, but does not materially reduce first cold request latency.

### 5.2 Split-model approach (small model for tool-call phase)

Attempt:
- Primary model: `qwen2.5:3b`
- Tool-call model override: `qwen2.5:1.5b`

Observed:
- Frequent unmappable tool calls from `1.5b`
- Fallback path could add very large delay

Example timing breakdown observed in logs:
- `Marine timing: native-tool-llm=44533ms`
- `Marine mapped tool calls: []`
- `Marine timing: native-tool-llm-fallback=98512ms`

Conclusion:
- Split-model degraded reliability and often worsened latency.
- Reverted for stability.

### 5.3 Quantization variant checks for Qwen 2.5 3B

Baseline currently in use:
- `qwen2.5:3b`
- `ollama show` reports quantization: `Q4_K_M`

Variants tested:
- `qwen2.5:3b-instruct-q4_0`
  - Run 1: `OK`, `107.14s`
  - Run 2: `OK`, `105.50s`
- `qwen2.5:3b-instruct-q4_K_S`
  - Run 1: `OK`, `98.25s`
  - Run 2: `OK`, `93.04s`

Conclusion:
- In this telemetry flow on this Pi, tested alternate Q4 variants did not beat current practical behavior.
- Baseline `qwen2.5:3b (Q4_K_M)` remains the best available choice tested so far.

## 6. What Was Changed in Code During This Cycle

Implemented and retained:
- Native Ollama tool-calling path improvements and normalization handling
- Fast telemetry reply path when MCP result already contains requested metric
- Timing instrumentation in marine orchestrator
- Optional config support for keep-alive/warmup/tool-model (tool-model left disabled in runtime)

Attempted then backed out where harmful:
- Risky prompt/context tightening that reduced mapping success
- Split-tool-model runtime behavior as active strategy

Current runtime state restored to stable config:
- `OLLAMA_MODEL=qwen2.5:3b`
- `OLLAMA_TOOL_MODEL=` (disabled)

## 7. Final Conclusion

1. We have exhausted high-value testing of the small-model options currently available in this setup for tool-calling telemetry.
2. The primary blocker is model inference latency and occasional tool-call fragility, not MCP backend access.
3. `qwen2.5:3b` is currently the best-performing/reliable tested option in this code path.
4. The key unresolved usability issue is cold-start and high steady latency for interactive expectations.

## 8. Recommended Next Steps

1. Keep `qwen2.5:3b` as baseline for now.
2. Continue with instrumentation-led optimization (phase timing already in place).
3. Evaluate non-deterministic latency reductions that do not bypass model/tool flow, e.g. boot-time prewarm orchestration and request shaping.
4. If latency remains unacceptable, next decision point should be a model/runtime class change rather than more micro-tuning of current 3B Q4 variants.

---

### Appendix A: Representative log evidence

Examples observed during failure diagnostics:
- `Marine timing: native-tool-llm=44533ms`
- `Marine mapped tool calls: []`
- `Marine timing: native-tool-llm-fallback=98512ms`
- `Marine native tool-call fallback response: toolCalls=0, content=""`

These indicate latency is dominated by LLM inference/tool-call generation phases rather than MCP execution itself.

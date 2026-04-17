# RAG Comparison (gemma3:4b)

Same 6 benchmark questions, same two PDFs (BUKH DV20 manual + Clipper Duet manual).

- Baseline = our code (`src/scripts/benchmarkRag.ts`) using hybrid retrieval
- AnythingLLM = `/api/v1/workspace/sv-krishna-eval/chat` mode=query
- PrivateGPT = `/v1/chat/completions` with `use_context=true` and doc-id filtering

## BUKH

Where is the fuel injection pump described in the BUKH DV20 manual?

Baseline (hybrid):
```
The BUKH DV20 manual does not describe the fuel injection pump.  Sources: None.
```

AnythingLLM:
```
The BUKH DV20 manual describes the fuel injection pump on page 17.
```

PrivateGPT:
```
I cannot find any information about the fuel injection pump in the provided manuals.
```

## BUKH

What should be checked before dismantling the fuel injection pump on the BUKH DV20?

Baseline (hybrid):
```
The excerpts do not contain information about checking the fuel injection pump before dismantling.  Sources: None
```

AnythingLLM:
```
According to the BUKH DV20 manual, you should check for “Corrosion”, “Damage”, and “Loose Connections” before dismantling the fuel injection pump.
```

PrivateGPT:
```
I cannot find the answer to that question in the provided manuals.
```

## BUKH

What is the tightening torque for the cylinder head nuts on the BUKH DV20?

Baseline (hybrid):
```
The tightening torque for hexagon nut M20x1.5 on the output shaft on the input side is 100 Nm (10 Kpm). Sources: [1], Page 1
```

AnythingLLM:
```
The tightening torque for the cylinder head nuts on the BUKH DV20 is 11 Nm.
```

PrivateGPT:
```
I cannot find the tightening torque for the cylinder head nuts on the BUKH DV20 in the provided manuals.
```

## CLIPPER

According to the Clipper Duet manual, what does the depth display show?

Baseline (hybrid):
```
The Echo Sounder measures the depth from the transducer to the seabed. If the craft has a keel it is often more convenient to show the depth from the keel to the seabed. Sources: [2], 1
```

AnythingLLM:
```
The depth display shows “Minimum Depth Alarm”.
```

PrivateGPT:
```
According to the manual, the depth display shows depth at all times. If the echo is temporarily lost, the depth units will momentarily flash. If the echo is completely lost, the display will show OUT.
```

## CLIPPER

According to the Clipper Duet manual, how do you change the shallow alarm setting?

Baseline (hybrid):
```
To set the minimum depth alarm, press TRIP and TOTAL simultaneously. The display will briefly show CON to confirm the operation and then return to the SET ENG display. Sources: [2] p. 1
```

AnythingLLM:
```
According to the Clipper Duet manual, you change the shallow alarm setting by pressing the “SHIFT” button on the instrument.
```

PrivateGPT:
```
According to the manual, to change the shallow alarm setting:

1.  Select the required minimum depth setting.
2.  Press SPEED. This will enter the new value into memory and return to normal operation.

To arm the alarm, press TRIP and TOTAL simultaneously. Pressing TRIP and TOTAL simultaneously a second time will disable the alarm (without altering the alarm setting).
```

## CLIPPER

According to the Clipper Duet manual, what power supply voltage does the instrument use?

Baseline (hybrid):
```
The manual does not specify the power supply voltage.  Sources: [2] Page 1
```

AnythingLLM:
```
The instrument uses a 12V DC power supply.
```

PrivateGPT:
```
I cannot find the answer to that question in the provided manual.
```


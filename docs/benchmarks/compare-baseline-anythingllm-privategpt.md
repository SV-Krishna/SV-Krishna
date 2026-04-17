# RAG Comparison (gemma3:1b)

Same 6 benchmark questions, same two PDFs (BUKH DV20 manual + Clipper Duet manual).

- Baseline = our code (`src/scripts/benchmarkRag.ts`) using hybrid retrieval
- AnythingLLM = `/api/v1/workspace/sv-krishna-eval/chat` mode=query
- PrivateGPT = `/v1/chat/completions` with `use_context=true` and doc-id filtering

## BUKH

Where is the fuel injection pump described in the BUKH DV20 manual?

Baseline (hybrid):
```
The excerpt does not provide information about the fuel injection pump.  Sources: bukh-dv20.pdf, Page 1
```

AnythingLLM:
```
The fuel injection pump is described in the BUKH DV20 manual on page 17.
```

PrivateGPT:
```
The fuel injection pump is described in the BUKH DV20 manual under section 3.1.2.
```

## BUKH

What should be checked before dismantling the fuel injection pump on the BUKH DV20?

Baseline (hybrid):
```
The alarm function should be checked once or twice a year by short-circuiting the connections 1 and 2 on the plastic box No. 008E5840 placed on the engine next to the multiple plugs. Sources: bukh-dv20.pdf, Pages: 1
```

AnythingLLM:
```
According to the BUKH DV20 manual, before dismantling the fuel injection pump, you should check for:

*   “Corrosion”
*   “Damage”
*   “Loose Connections”
```

PrivateGPT:
```
According to the provided manual, before dismantling the fuel injection pump on the BUKH DV20, you should check the following:

*   Mark the adjusting washer(s) which lie below the bearing rings in proportion to the bore.
*   Loosen the nuts at the wheel and press out the bolt of the housing.
```

## BUKH

What is the tightening torque for the cylinder head nuts on the BUKH DV20?

Baseline (hybrid):
```
The excerpt does not specify the tightening torque for the cylinder head nuts on the BUKH DV20. However, it states “Torque of hexagon nut M20x1.5 on the output shaft on the output side 100 Nm (10 Kpm) Torque wrench Secure after having packed with liquid jointing on the contact face Torque of hexagon nut M20x1.5 on output shaft on the input side 100 Nm (10 Kpm) Torque wrench Secure after tightening Torque of hexagon nut M20x1.5 on” which indicates a torque of 100 Nm.  Sources: bukh-dv20.pdf, Pages: 1
```

AnythingLLM:
```
According to the BUKH DV20 manual, the tightening torque for the cylinder head nuts is 11 Nm.
```

PrivateGPT:
```
The provided manual states to secure the nut with a torque of 100 Nm (10 Kpm).
```

## CLIPPER

According to the Clipper Duet manual, what does the depth display show?

Baseline (hybrid):
```
The depth display shows the depth from the transducer to the seabed.  Sources: clipper-duet.pdf, Page 1
```

AnythingLLM:
```
According to the Clipper Duet manual, the depth display shows “Minimum Depth Alarm”.
```

PrivateGPT:
```
According to the Clipper Duet manual, the depth display shows depth at all times.
```

## CLIPPER

According to the Clipper Duet manual, how do you change the shallow alarm setting?

Baseline (hybrid):
```
To change the shallow alarm setting, you must press TRIP and TOTAL simultaneously.  Sources: clipper-duet.pdf, Page 1
```

AnythingLLM:
```
According to the Clipper Duet manual, you change the shallow alarm setting by pressing the “SHIFT” button on the instrument.
```

PrivateGPT:
```
According to the Clipper Duet manual, you use “T” to change the shallow alarm setting.
```

## CLIPPER

According to the Clipper Duet manual, what power supply voltage does the instrument use?

Baseline (hybrid):
```
The excerpt doesn’t state the power supply voltage. Sources: clipper-duet.pdf, Page 1. Sources: clipper-duet.pdf, Page 1.
```

AnythingLLM:
```
According to the Clipper Duet manual, the instrument uses a 12V DC power supply.
```

PrivateGPT:
```
The Clipper Duet manual does not specify the power supply voltage.
```


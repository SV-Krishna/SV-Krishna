#!/usr/bin/env python3

import json
import time
import urllib.request


ANYTHINGLLM_BASE = "http://127.0.0.1:3001/api"
API_KEY = "svkrishna-local-api-key"
WORKSPACE_SLUG = "sv-krishna-eval"
SESSION_ID = "svkrishna-eval"


CASES = [
    ("bukh", "Where is the fuel injection pump described in the BUKH DV20 manual?"),
    ("bukh", "What should be checked before dismantling the fuel injection pump on the BUKH DV20?"),
    ("bukh", "What is the tightening torque for the cylinder head nuts on the BUKH DV20?"),
    ("clipper", "According to the Clipper Duet manual, what does the depth display show?"),
    ("clipper", "According to the Clipper Duet manual, how do you change the shallow alarm setting?"),
    ("clipper", "According to the Clipper Duet manual, what power supply voltage does the instrument use?"),
]


def post_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{ANYTHINGLLM_BASE}{path}",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def main() -> int:
    results = []
    for manual, question in CASES:
        start = time.time()
        payload = post_json(
            f"/v1/workspace/{WORKSPACE_SLUG}/chat",
            {
                "message": question,
                "mode": "query",
                "sessionId": SESSION_ID,
                "reset": False,
            },
        )
        elapsed = time.time() - start
        results.append(
            {
                "manual": manual,
                "question": question,
                "seconds": round(elapsed, 2),
                "textResponse": payload.get("textResponse"),
                # Keep sources trimmed: AnythingLLM includes the entire chunk text.
                "sources": [
                    {
                        "title": src.get("title"),
                        "sourceDocument": (src.get("metadata") or {}).get("sourceDocument"),
                    }
                    for src in (payload.get("sources") or [])
                ],
            }
        )
        print(f"{manual.upper()} {elapsed:.2f}s: {question}")
        print(f"  {payload.get('textResponse','').strip()}\n")

    out_path = "/home/antony-slack/Documents/SV-Krishna/docs/benchmarks/anythingllm-gemma3-4b.json"
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump({"cases": results}, handle, indent=2)
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


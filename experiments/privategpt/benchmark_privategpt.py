#!/usr/bin/env python3

import json
import time
import urllib.request


BASE = "http://127.0.0.1:8001"

CASES = [
    ("bukh", "Where is the fuel injection pump described in the BUKH DV20 manual?"),
    ("bukh", "What should be checked before dismantling the fuel injection pump on the BUKH DV20?"),
    ("bukh", "What is the tightening torque for the cylinder head nuts on the BUKH DV20?"),
    ("clipper", "According to the Clipper Duet manual, what does the depth display show?"),
    ("clipper", "According to the Clipper Duet manual, how do you change the shallow alarm setting?"),
    ("clipper", "According to the Clipper Duet manual, what power supply voltage does the instrument use?"),
]


def load_doc_ids(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return [item["doc_id"] for item in payload.get("data", []) if item.get("doc_id")]


def post_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def main() -> int:
    clipper_ids = load_doc_ids(
        "/home/antony-slack/Documents/SV-Krishna/docs/benchmarks/privategpt-ingest-clipper.json"
    )
    bukh_ids = load_doc_ids("/home/antony-slack/Documents/SV-Krishna/docs/benchmarks/privategpt-ingest-bukh.json")

    results = []
    for manual, question in CASES:
        doc_ids = bukh_ids if manual == "bukh" else clipper_ids
        start = time.time()
        payload = post_json(
            "/v1/chat/completions",
            {
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Answer strictly from the provided manuals. "
                            "If the answer is not present, say you cannot find it."
                        ),
                    },
                    {"role": "user", "content": question},
                ],
                "use_context": True,
                "include_sources": True,
                "stream": False,
                "context_filter": {"docs_ids": doc_ids},
            },
        )
        elapsed = time.time() - start

        choice = (payload.get("choices") or [{}])[0]
        message = ((choice.get("message") or {}).get("content")) or ""
        sources = choice.get("sources") or []

        trimmed_sources = []
        for src in sources[:3]:
            doc = (src.get("document") or {}).get("doc_metadata") or {}
            trimmed_sources.append(
                {
                    "score": src.get("score"),
                    "file_name": doc.get("file_name"),
                    "page_label": doc.get("page_label"),
                    "window": (doc.get("window") or "")[:180],
                }
            )

        results.append(
            {
                "manual": manual,
                "question": question,
                "seconds": round(elapsed, 2),
                "answer": message.strip(),
                "sources": trimmed_sources,
            }
        )

        print(f"{manual.upper()} {elapsed:.2f}s: {question}")
        print(f"  {message.strip()}\n")

    out_path = "/home/antony-slack/Documents/SV-Krishna/docs/benchmarks/privategpt-gemma3-4b.json"
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump({"cases": results}, handle, indent=2)

    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


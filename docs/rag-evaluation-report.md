# RAG Evaluation Report (Docling + Hybrid Baseline)

This document summarizes the extraction + retrieval experiments performed so far, the benchmark results, and the current recommended workflow for Raspberry Pi deployment.

Scope note: this is a hobby/offline project. The benchmarks focus on grounded answers from manuals and avoiding confident wrong answers.

## Executive summary

- Best overall extractor for manuals tested so far: `docling`.
- Best retrieval mode tested so far: `hybrid` (lexical candidate generation + embedding rerank).
- Best embedding model tested so far (Ollama): `nomic-embed-text:latest`.
- Docling is often too expensive to run on the Raspberry Pi for large manuals. The recommended pattern is to build the RAG store on a more powerful machine and copy the resulting PDFs + stores to the Pi.

## What we built

### Storage

- `store.json`: extracted text split into chunks, including (when available) section headings and section paths.
- `embeddings.json`: `chunkId -> vector[]` for every chunk in `store.json`.

### Retrieval

- `lexical` retrieval for fast keyword matching.
- `embedding` retrieval for semantic similarity (currently gated by a "trusted sources" threshold).
- `hybrid` retrieval:
  - top-N lexical candidates are selected
  - those candidates are reranked using embedding similarity

### Documents tested

- BUKH manual: `bukh-dv20.pdf`
- Clipper Duet manual: `clipper-duet.pdf`

## Benchmarks

Benchmarks are intentionally small but repeatable.

Scripts:

- `src/scripts/benchmarkRag.ts` runs 6 questions (3 BUKH + 3 Clipper).
- `src/scripts/benchmarkClipperExtended.ts` runs 13 questions (3 baseline Clipper + 10 additional Clipper questions).

Saved outputs live under `docs/benchmarks/`.

## Key findings

### 1) Docling improved retrieval relevance on manuals

Docling extraction retains headings/structure much better than `pypdf`, which improves lexical candidate selection and reduces subsystem confusion (especially on the BUKH manual).

Reference:

- `docs/benchmarks/baseline-node-pypdf-gemma3-4b.txt`
- `docs/benchmarks/baseline-node-docling-gemma3-4b.txt`

### 2) Clipper failures were often ranking/synonym issues, not extraction failure

Example: the Clipper manual includes "12 volt battery" wording, but the query "power supply voltage" did not reliably retrieve that chunk in the top-3 results.

This suggests future improvements should focus on:

- synonym expansion / intent boosts for spec questions (voltage/torque/current)
- section-aware scoring and filtering

### 3) Docling extraction cost is a major operational constraint

Docling can pull heavy ML dependencies and can be slow, especially for large manuals. This makes Docling-on-Pi an unattractive default.

Practical recommendation:

- build `store.json` + `embeddings.json` off-Pi
- copy to the Pi for runtime querying

### 4) Pi performance vs local performance

For the same Docling store + hybrid retrieval + `gemma3:1b`, the Raspberry Pi is substantially slower than the local machine for LLM answer generation.

Clipper-only extended benchmark (13 questions, Docling, `gemma3:1b`):

- Local: `docs/benchmarks/clipper-extended-docling-gemma3-1b.txt`
  - hybrid retrieval_avg ~0.13s, answer_avg ~7.88s
- Pi: `docs/benchmarks/benchmark-pi-clipper-extended-docling-gemma3-1b-20260417-170338.txt`
  - hybrid retrieval_avg ~0.86s, answer_avg ~19.11s

Interpretation:

- retrieval slowed down primarily due to per-query embedding calls and generally slower CPU
- answering slowed down due to on-device LLM inference

## Recommended workflow: build machine -> Pi

1. On a build machine (x86 laptop/desktop):
   - Put PDFs into a local inbox (example: `local/rag/inbox/`)
   - Run Docling extraction and create:
     - `local/rag/store.json`
     - `local/rag/embeddings.json` (using `nomic-embed-text:latest`)
2. Copy to the Pi:
   - PDFs -> `/opt/svkrishna/rag/inbox/`
   - stores -> `/opt/svkrishna/rag/store.json` and `/opt/svkrishna/rag/embeddings.json`
3. Ensure the Pi has the embedding model available in Ollama:
   - `ollama pull nomic-embed-text:latest`
4. Preserve timestamps when copying PDFs if you want to avoid a rebuild on the Pi:
   - prefer `rsync -t` or `cp -p`

Implementation note:

The controller decides whether to rebuild by comparing the inbox signature (`fileName + mtimeMs + size`) to the values recorded in `store.json`.

## How to update the Pi RAG store (copy-paste)

The Pi is assumed to have:

- app at `/opt/svkrishna/app`
- RAG directory at `/opt/svkrishna/rag`
- inbox at `/opt/svkrishna/rag/inbox`

The build machine is assumed to have:

- PDFs at `local/rag/inbox/`
- stores at `local/rag/store.json` and `local/rag/embeddings.json`

### A) Recommended (rsync preserves timestamps)

On the build machine:

```bash
PI_HOST=admin@192.168.68.203

# 1) Copy PDFs (preserve mtimes)
rsync -av --progress -t local/rag/inbox/ "$PI_HOST:/opt/svkrishna/rag/inbox/"

# 2) Copy stores
rsync -av --progress local/rag/store.json local/rag/embeddings.json "$PI_HOST:/opt/svkrishna/rag/"
```

On the Pi:

```bash
# Ensure the embedding model exists (once per Pi install)
ollama pull nomic-embed-text:latest
```

### B) If you used scp and timestamps changed (update store signature on the Pi)

If the controller tries to rebuild on the Pi (because mtimes changed), you can update
the `store.json` document `mtimeMs` values to match the inbox.

On the Pi:

```bash
node <<'NODE'
const fs = require("fs");
const path = require("path");

const storePath = "/opt/svkrishna/rag/store.json";
const inboxDir = "/opt/svkrishna/rag/inbox";

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const docs = store.documents || [];
const byName = new Map(docs.map((d) => [d.fileName, d]));

const files = fs
  .readdirSync(inboxDir)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort();

for (const fileName of files) {
  const st = fs.statSync(path.join(inboxDir, fileName));
  const doc = byName.get(fileName);
  if (doc) {
    doc.mtimeMs = st.mtimeMs;
    doc.size = st.size;
  }
}

store.documents = docs.filter((d) => files.includes(d.fileName));
fs.writeFileSync(storePath, JSON.stringify(store));
console.log("Updated store.json document mtimes to match inbox.");
NODE
```

### C) Quick validation on the Pi (no rebuild expected)

On the Pi:

```bash
cd /opt/svkrishna/app

# Should run without triggering extraction if signatures match
node dist/scripts/benchmarkRag.js
```

## Current gaps / next improvements

- Fix Docling chunk scoring for certain Clipper questions (e.g. "depth display shows") so we consistently surface the "USING THE INSTRUMENT" excerpt rather than the keel offset text.
- Add query-intent boosts (SPEC vs PROCEDURAL) and synonyms (e.g. "power supply voltage" -> "12 volt", "battery", "powered").
- Reduce LLM burden with a stricter answer format: "extract + lightly format", especially for procedural responses.
- Evaluate a small local reranker strategy that stays cheap on Pi (keep lexical-first).

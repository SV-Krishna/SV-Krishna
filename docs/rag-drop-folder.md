# PDF Drop-Folder RAG

The controller can augment prompts with locally indexed PDF content.

## How it works

1. Copy PDF files into the configured inbox folder.
2. The controller extracts text from each PDF, splits it into chunks, and writes a local JSON store (`store.json`).
3. (Optional) The controller embeds each chunk and writes an embedding store (`embeddings.json`).
4. When you ask a question, the controller retrieves the most relevant chunks and prepends them to the Ollama prompt.

## Retrieval modes

The project supports three retrieval modes in benchmarks:

- `lexical` - keyword-based scoring over chunks
- `embedding` - cosine similarity over all chunk vectors (note: the current answer pipeline intentionally refuses if sources are not "trusted")
- `hybrid` - lexical candidate generation followed by embedding rerank (recommended baseline)

## Extractors

Text extraction is pluggable. Current extractor modes:

- `pypdf` - fast, lightweight, but weak structure/heading retention on manuals
- `docling` - best quality for structured PDFs/manuals (headings/sections), but heavy to run on a Raspberry Pi
- `opendataloader` - Java-backed extraction, relatively fast, but ranking/synonym issues still need addressing

## Recommended workflow (build machine -> Pi)

Docling can be expensive on a Pi 5 for large manuals. The recommended workflow is:

1. On a more powerful machine, run Docling extraction and build:
   - `store.json`
   - `embeddings.json` (using `nomic-embed-text:latest`)
2. Copy the resulting PDFs + stores to the Pi.

### Read-only ingest on the Pi (recommended)

For stability, the Pi is typically configured as **read-only** for RAG ingestion:

- uploads/reindexing are disabled in the Web UI
- if PDFs change on the Pi, the app keeps the existing `store.json` instead of attempting extraction locally

This avoids:

- long extraction times on the Pi
- extractor dependency drift (e.g. Docling not installed on the Pi)
- accidental downgrades of a high-quality Docling-built store to a low-quality `pypdf` store

Important: the controller decides whether to rebuild by comparing the inbox PDF signature
(`fileName + mtimeMs + size`) to what is recorded in `store.json`. If you copy PDFs to the Pi
without preserving timestamps, it may try to re-extract on the Pi.

Practical tips:

- prefer `rsync -t` or `cp -p` to preserve modification times
- if timestamps change anyway, update `store.json` document `mtimeMs` values to match the inbox on the target machine

## Default paths

- inbox: `/opt/svkrishna/rag/inbox`
- store: `/opt/svkrishna/rag/store.json`
- embeddings: `/opt/svkrishna/rag/embeddings.json`

## Terminal controls

- `t` enter typed prompt mode
- `r` rebuild the PDF RAG store immediately

The controller also checks the inbox on demand and rebuilds automatically if the PDF set changes.

## Environment variables

- `ENABLE_RAG=true`
- `RAG_ALLOW_INGEST=true|false`
- `RAG_SOURCE_DIR=/opt/svkrishna/rag/inbox`
- `RAG_STORE_PATH=/opt/svkrishna/rag/store.json`
- `RAG_CHUNK_SIZE=120`
- `RAG_CHUNK_OVERLAP=30`
- `RAG_TOP_K=3`
- `RAG_EXTRACTOR_PYTHON=python3`
- `RAG_EXTRACTOR_MODE=pypdf|docling|opendataloader`

Notes:

- Default: `RAG_ALLOW_INGEST=true` in development, `false` in production.
- On the Pi, keep `RAG_ALLOW_INGEST=false` and copy prebuilt `store.json` from the build machine.

Embedding/hybrid configuration:

- `ENABLE_EMBEDDING_POC=true`
- `EMBEDDING_MODEL=nomic-embed-text:latest`
- `EMBEDDING_STORE_PATH=/opt/svkrishna/rag/embeddings.json`
- `EMBEDDING_TOP_K=3`

## Current boundary

This is retrieval-augmented prompting, not a full knowledge graph or agent framework. It is good enough for:

- manuals
- checklists
- procedures
- wiring notes
- operating guides

If the corpus grows or retrieval quality becomes weak, the next step is to keep retrieval hybrid but improve:

- ranking (synonyms/intent boosts for specs like voltage/torque)
- section-aware scoring
- optional document filters in the UI

# Benchmarks

This folder contains saved benchmark outputs and comparisons for the offline RAG pipeline.

## Files of interest

Baseline (local machine)

- `baseline-node-pypdf-gemma3-4b.txt` - 6 questions (BUKH+Clipper), pypdf extraction, gemma3:4b
- `baseline-node-docling-gemma3-4b.txt` - 6 questions (BUKH+Clipper), docling extraction, gemma3:4b

Clipper-only extended (local machine)

- `clipper-extended-pypdf-gemma3-4b.txt` - 13 questions, pypdf extraction, gemma3:4b
- `clipper-extended-docling-gemma3-4b.txt` - 13 questions, docling extraction, gemma3:4b
- `clipper-extended-opendataloader-gemma3-4b.txt` - 13 questions, OpenDataLoader extraction, gemma3:4b
- `clipper-extended-docling-gemma3-1b.txt` - 13 questions, docling extraction, gemma3:1b

OpenDataLoader (Clipper-only sanity)

- `clipper-opendataloader-gemma3-4b.txt` - 3 Clipper baseline questions, OpenDataLoader extraction
- `compare-clipper-pypdf-docling-opendataloader-gemma3-4b.md` - side-by-side of the 3 Clipper baseline questions

Pi runs (Raspberry Pi 5)

- `benchmark-pi-rag-docling-gemma3-1b-20260417-165837.txt` - 6 questions (BUKH+Clipper), docling store + gemma3:1b on Pi
- `benchmark-pi-clipper-extended-docling-gemma3-1b-20260417-170338.txt` - 13 questions, docling store + gemma3:1b on Pi

## How to reproduce

The benchmark scripts are:

- `src/scripts/benchmarkRag.ts` (6 questions: BUKH+Clipper)
- `src/scripts/benchmarkClipperExtended.ts` (13 questions: Clipper-only)

Run (local) after `npm install`:

```bash
npm run build
node dist/scripts/benchmarkRag.js
node dist/scripts/benchmarkClipperExtended.js
```

You can override runtime options with environment variables:

- `RAG_SOURCE_DIR`, `RAG_STORE_PATH`, `EMBEDDING_STORE_PATH`
- `RAG_EXTRACTOR_MODE=pypdf|docling|opendataloader`
- `OLLAMA_MODEL=gemma3:1b|gemma3:4b|...`
- `EMBEDDING_MODEL=nomic-embed-text:latest`


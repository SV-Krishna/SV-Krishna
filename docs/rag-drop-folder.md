# PDF Drop-Folder RAG

The controller can augment prompts with locally indexed PDF content.

## How it works

1. Copy PDF files into the configured inbox folder.
2. The controller extracts text from each PDF, splits it into overlapping chunks, and writes a local JSON store.
3. When you ask a question, the controller retrieves the most relevant chunks and prepends them to the Ollama prompt.

This first implementation is intentionally simple:

- offline only
- file-based store
- PDF text extraction via `pypdf`
- lexical retrieval rather than vector embeddings

That keeps it light enough for a Raspberry Pi while giving us a clear upgrade path to embeddings later.

## Default paths

- inbox: `/opt/svkrishna/rag/inbox`
- store: `/opt/svkrishna/rag/store.json`

## Terminal controls

- `t` enter typed prompt mode
- `r` rebuild the PDF RAG store immediately

The controller also checks the inbox on demand and rebuilds automatically if the PDF set changes.

## Environment variables

- `ENABLE_RAG=true`
- `RAG_SOURCE_DIR=/opt/svkrishna/rag/inbox`
- `RAG_STORE_PATH=/opt/svkrishna/rag/store.json`
- `RAG_CHUNK_SIZE=120`
- `RAG_CHUNK_OVERLAP=30`
- `RAG_TOP_K=4`
- `RAG_EXTRACTOR_PYTHON=python3`

## Current boundary

This is retrieval-augmented prompting, not a full knowledge graph or agent framework. It is good enough for:

- manuals
- checklists
- procedures
- wiring notes
- operating guides

If the corpus grows or retrieval quality becomes weak, the next step is to add a local embedding model and switch to hybrid lexical + vector retrieval.

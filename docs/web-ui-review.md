# Web UI Review

This project now includes a built-in browser UI for local chat and PDF upload.

## Why not adopt a full third-party web UI directly?

There are mature local chat UIs already available, but most of them bring their own assumptions around:

- authentication
- containers
- vector databases
- embeddings
- document stores
- agent layers

That is useful in a larger setup, but it is heavier than phase one needs on a Raspberry Pi 5 8GB.

## Best existing option reviewed

If we wanted an off-the-shelf product instead of a thin project-specific UI, `AnythingLLM` is the strongest fit among the commonly used local chat UIs because it explicitly supports:

- Ollama as an LLM provider
- local embedders
- document upload
- RAG workflows

However, it is a larger platform than we need right now. It overlaps with the custom offline stack already running in this repo and would duplicate pieces we have intentionally kept simple.

## Decision

For this project, the right move is:

1. keep the current offline stack
2. expose it through a small purpose-built web UI
3. preserve the existing PDF drop-folder RAG path
4. avoid introducing a second orchestration platform until there is a clear need

## Result

The built-in web UI provides:

- local chat against the current Ollama model
- PDF upload directly into the RAG inbox
- visibility into indexed documents
- no dependency on an external vector DB or containerized chat platform
- voice trigger via a `Listen` button (headless-friendly)
- progress status during a voice run (recording/transcribing/thinking/speaking)

If the project later outgrows this UI, `AnythingLLM` is the best next candidate to evaluate as a replacement rather than as a parallel stack.

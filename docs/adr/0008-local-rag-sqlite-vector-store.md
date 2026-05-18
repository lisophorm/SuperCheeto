# ADR 0008: Local RAG with SQLite Vector Store

## Status
Accepted

## Context
We need document-grounded Q&A (CV and similar files) without introducing a remote vector database service. The desktop app already uses OpenAI for answering, and we need ingestion/retrieval to run locally with simple operations.

## Decision
Use a local SQLite-backed vector store in backend (`backend/app/rag_store.py`):
- Ingest `.txt`, `.md`, `.pdf`, `.docx`.
- Chunk document text by character windows with overlap.
- Generate embeddings via OpenAI embeddings API (`RAG_EMBEDDING_MODEL`, default `text-embedding-3-small`).
- Persist vectors/chunks/doc metadata in SQLite (`RAG_DB_PATH`, default `backend/data/rag.sqlite`).
- Retrieve top-K chunks via cosine similarity and append them to query context.
- Expose WebSocket operations: `rag_ingest`, `rag_list`, `rag_clear`.

## Alternatives considered
- Chroma/Qdrant local runtime: richer indexing but adds heavier dependencies/runtime surface.
- Pure keyword/BM25 retrieval: no embeddings and weaker semantic recall for resume-style phrasing.
- Remote managed vector DB: violates local-storage requirement and increases operational cost.

## Consequences
- Pros:
  - Data persistence remains local and simple to back up.
  - No additional service to run beyond backend process.
  - UI can ingest files/folders directly from Settings.
- Cons:
  - Retrieval uses brute-force cosine in SQLite rows; not optimized for very large corpora.
  - Embedding calls require `OPENAI_API_KEY` and network availability.
- Follow-ups:
  - Add background ingestion queue and progress updates for large document sets.
  - Add optional fully-local embedding model mode (no network dependency).

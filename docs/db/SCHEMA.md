# Schema

## `documents`
Purpose: Tracks each ingested source file and ingestion metadata.

Columns:
- `doc_id` (TEXT, PK) - stable id derived from file path.
- `file_path` (TEXT, UNIQUE, NOT NULL) - absolute source path.
- `title` (TEXT, NOT NULL) - filename label.
- `sha256` (TEXT, NOT NULL) - hash of extracted text to detect unchanged docs.
- `file_size` (INTEGER, NOT NULL) - source file size in bytes.
- `file_mtime` (REAL, NOT NULL) - source file mtime timestamp.
- `chunk_count` (INTEGER, NOT NULL) - number of indexed chunks.
- `updated_at` (REAL, NOT NULL) - ingest timestamp.

Indexes:
- `idx_documents_updated_at` - newest-first doc listing.

Notes:
- Upserted on re-ingest; unchanged docs are skipped by hash.

## `chunks`
Purpose: Stores chunk text and embedding vectors for retrieval.

Columns:
- `chunk_id` (TEXT, PK) - `<doc_id>:<chunk_index>`.
- `doc_id` (TEXT, FK -> `documents.doc_id`) - owning document id.
- `chunk_index` (INTEGER, NOT NULL) - sequence in source doc.
- `text` (TEXT, NOT NULL) - chunk text.
- `vector` (BLOB, NOT NULL) - float32 embedding bytes.
- `dim` (INTEGER, NOT NULL) - vector dimension.
- `norm` (REAL, NOT NULL) - vector L2 norm for cosine similarity.

Indexes:
- `idx_chunks_doc_id` - efficient chunk delete/rebuild per document.

Notes:
- Retrieval is cosine similarity over persisted vectors.

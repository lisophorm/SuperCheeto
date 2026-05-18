# Backend

Python asyncio service for local system-audio capture, near-real-time transcription, and OpenAI queries.

## Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run
```bash
cd backend
python -m app.main
```

## Test
```bash
cd backend
python -m unittest discover -s tests
```

## Webcam eye-tracking prototype (mock)
```bash
cd backend
python -m app.eye_tracking_prototype
```

Options:
- `--camera-index` (default `0`)
- `--width` / `--height` capture resolution
- `--no-mirror` to disable mirror preview

The prototype shows a live webcam overlay with coarse gaze direction labels (`left/right/up/down/center`, including diagonals).

## Configuration
- `OPENAI_API_KEY` must be set in the environment or a `.env` file in `backend/`.
- Optional overrides in `.env`:
  - `WS_HOST`, `WS_PORT`
  - `AUDIO_SOURCE` (exact Pulse/PipeWire monitor source name to force system-audio capture)
  - `AUDIO_MIC_SOURCE` (exact Pulse/PipeWire source name to force microphone capture)
  - `AUDIO_MODE` (`system` or `mic`, default `system`)
  - `STT_MODEL` (e.g. `base`, `small`)
  - `STT_DEVICE` (`cpu` default, or `cuda` when the CUDA runtime is installed), `STT_COMPUTE_TYPE` (`int8` for CPU, `float16` for CUDA)
  - `STT_VAD_FILTER` (`false` default; set `true` to suppress non-speech background)
  - `STT_MIC_LANGUAGE` (default `en`; stabilizes mic transcription for accented English)
  - `STT_SYSTEM_LANGUAGE` (default auto-detect for system audio)
  - `STT_LANGUAGE` (global fallback when mode-specific language is unset)
  - `STT_MIN_DECODE_RMS` (default `0.0010`; skips decoding on near-silent windows to reduce hallucinations)
  - `STT_NO_VAD_FALLBACK_MIN_RMS` (default `0.0025`; blocks no-VAD fallback on very low-energy windows)
  - `RAG_DB_PATH` (SQLite path for local vector DB, default `backend/data/rag.sqlite`)
  - `RAG_EMBEDDING_MODEL` (default `text-embedding-3-small`)
  - `RAG_TOP_K` (number of retrieved chunks injected into each query context)
  - `RAG_CHUNK_SIZE_CHARS`, `RAG_CHUNK_OVERLAP_CHARS` (ingest chunking strategy)

## Audio Notes (Ubuntu)
- Requires PulseAudio or PipeWire with Pulse shim.
- If routing is incorrect, install and run `pavucontrol` (`sudo apt install -y pavucontrol`) and switch the backend recording stream to a `Monitor of ...` source in the **Recording** tab.
- Startup source selection priority:
  1. `set_audio_mode` + `set_audio_source` / `set_mic_source` WebSocket messages from UI/client
  2. `AUDIO_SOURCE` / `AUDIO_MIC_SOURCE` in environment
  3. Active browser/media sink input monitor (for system mode)
  4. Default sink monitor and default source from `pactl info`
- If no monitor/mic sources are found, select one manually in the UI or pass it via WebSocket.

## Local RAG ingestion
- In Settings, use **Local RAG Documents** to ingest file/folder paths.
- Supported formats: `.txt`, `.md`, `.pdf`, `.docx`.
- RAG control messages:
  - `rag_ingest`: `{ paths: string[] }`
  - `rag_list`: `{}`
  - `rag_clear`: `{}`
- Backend emits:
  - `rag_documents`: indexed document list with chunk counts and timestamps.
  - `rag_ingest_result`: ingestion counters + error list.

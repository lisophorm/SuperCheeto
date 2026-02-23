# Live Transcript Desk (MVP)

Desktop app MVP that captures system audio locally, transcribes near-real-time with faster-whisper, and lets you run preset/custom prompts against selected transcript text.

## Architecture
- **Backend (Python)**: captures system monitor audio or microphone input via Pulse/PipeWire, streams to faster-whisper, serves a WebSocket API, and calls OpenAI.
- **Frontend (Electron + React)**: renders transcript, supports selection, and displays model responses.
- **Transport**: WebSocket on `ws://127.0.0.1:8765`.

## Repository Layout
```
backend/   # Python services
frontend/  # Electron + React UI
docs/      # Prompts and design briefs
```

## Quick Start
### Launch both services (recommended)
```bash
./scripts/dev.sh start
```

Stop both:
```bash
./scripts/dev.sh stop
```

Other helpers:
```bash
./scripts/dev.sh status
./scripts/dev.sh logs
./scripts/dev.sh restart
```

Notes:
- `./scripts/dev.sh stop` also cleans up lingering backend listeners on `127.0.0.1:${BACKEND_WS_PORT:-8765}` when no PID file is present.
- `./scripts/dev.sh stop` also cleans up lingering frontend dev processes for this repo (Vite/Electron toolchain) when no PID file is present.
- To run backend on a non-default WebSocket port with the launcher, set `BACKEND_WS_PORT` and `WS_PORT` together, for example:
  ```bash
  BACKEND_WS_PORT=8766 WS_PORT=8766 ./scripts/dev.sh start
  ```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

Set `OPENAI_API_KEY` in `backend/.env` or the environment. Use `backend/.env.example` as a template.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Audio Setup (Ubuntu)
- Requires PulseAudio or PipeWire (with Pulse shim).
- The backend resolves default monitor/mic sources using `pactl info`.
- If input routing is wrong, install and open `pavucontrol` (`sudo apt install -y pavucontrol`), then in the **Recording** tab set the backend (`python`) input to a `Monitor of ...` source.
- If no monitor/mic sources are found, select one manually in the UI or send it over WebSocket.

## WebSocket Messages
Backend → Frontend:
- `transcript_live`: `{ text, t, streamKind?, sourceName? }`
- `transcript_segment`: `{ segment }`
- `audio_level`: `{ rms, level, t, streamKind?, sourceName? }`
- `audio_sources`: `{ monitorSources?, micSources?, selectedMode?, ... }`
- `status`: `{ state, details }`
- `query_state`: `{ running, requestId?, cancelled? }`
- `query_chunk`: `{ requestId?, delta }` (streamed partial response text)
- `query_response`: `{ requestId, text, latencyMs?, model?, screenshotUsed? }`
- `error`: `{ message }`

Frontend → Backend:
- `set_audio_source`: `{ sourceName }`
- `set_mic_source`: `{ sourceName }`
- `set_audio_mode`: `{ mode: "system"|"mic" }`
- `start_transcription`
- `stop_transcription`
- `run_query`: `{ requestId, presetId|null, customInstruction|null, selectedText, selectionTimeRange|null }`
- `cancel_query`: `{ requestId? }`

## OpenAI
- Set `OPENAI_API_KEY` before running.
- Default model: `gpt-4o` (override with `OPENAI_MODEL`).

## Benchmarking (Settings page)
- Manage tests with simple CRUD in Settings (create, edit, delete).
- Benchmark test definitions are persisted in local storage and survive app restart.
- Each test uses a dedicated 5-row prompt textarea.
- Upload benchmark images with a reference id (for example `IMAGE_1`) and attach that ref to tests.
- A single benchmark run executes all combinations of `tests x selected models x repeats`.
- Benchmark history is retained in the app (local browser storage) so new runs do not overwrite prior results.
- Settings shows a "Latest Result Per Model" summary using the newest available benchmark data for each model.
- Runner telemetry includes:
  - Time-to-first-token and time-to-complete (TTC)
  - Input/output token usage
  - Estimated cost (when pricing is known)
  - Image capability success on image tests
  - Quality score and pass/fail checks
  - Speed-first aggregate score (0-100)
- Response pane includes an editable pre-send selected-text textarea (collapses/expands via env-configurable rows).
- Optional pricing override env var:
  - `OPENAI_MODEL_PRICING_JSON='{"model-id":{"input":1.25,"output":10.0}}'` (USD per 1M tokens)

## First Run Checklist
1) Start backend/frontend and confirm the System/Mic meters move with input (meters are active even before pressing Start).
2) If RMS stays near zero, open `pavucontrol` and route the backend recording stream to the intended monitor or microphone source.
3) Launch the frontend and wait for the status pill to show `ready` or `transcribing`.
4) Select text in the transcript pane, then run a preset prompt.

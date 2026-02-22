# Live Transcript Desk (MVP)

Desktop app MVP that captures system audio locally, transcribes near-real-time with faster-whisper, and lets you run preset/custom prompts against selected transcript text.

## Architecture
- **Backend (Python)**: captures system audio via Pulse/PipeWire monitor source, streams to faster-whisper, serves a WebSocket API, and calls OpenAI.
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
- The backend resolves the default monitor source using `pactl info`.
- If input routing is wrong, install and open `pavucontrol` (`sudo apt install -y pavucontrol`), then in the **Recording** tab set the backend (`python`) input to a `Monitor of ...` source.
- If no monitor sources are found, select one manually in the UI or send it over WebSocket.

## WebSocket Messages
Backend → Frontend:
- `transcript_live`: `{ text, t }`
- `transcript_segment`: `{ segment }`
- `status`: `{ state, details }`
- `query_response`: `{ requestId, text }`
- `error`: `{ message }`

Frontend → Backend:
- `set_audio_source`: `{ sourceName }`
- `start_transcription`
- `stop_transcription`
- `run_query`: `{ requestId, presetId|null, customInstruction|null, selectedText, selectionTimeRange|null }`

## OpenAI
- Set `OPENAI_API_KEY` before running.
- Default model: `gpt-4o` (override with `OPENAI_MODEL`).

## Benchmarking (Settings page)
- Manage tests with simple CRUD in Settings (create, edit, delete).
- Each test uses a dedicated 5-row prompt textarea.
- Upload benchmark images with a reference id (for example `IMAGE_1`) and attach that ref to tests.
- A single benchmark run executes all combinations of `tests x selected models x repeats`.
- Benchmark history is retained in the app (local browser storage) so new runs do not overwrite prior results.
- Settings shows a "Latest Result Per Model" summary using the newest available benchmark data for each model.

## First Run Checklist
1) Start the backend and confirm it prints `[audio] RMS=...` when system audio is playing.
2) If RMS stays near zero, open `pavucontrol` and route the backend recording stream to a `Monitor of ...` source.
3) Launch the frontend and wait for the status pill to show `ready` or `transcribing`.
4) Select text in the transcript pane, then run a preset prompt.

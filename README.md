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

## First Run Checklist
1) Start the backend and confirm it prints `[audio] RMS=...` when system audio is playing.
2) Launch the frontend and wait for the status pill to show `ready` or `transcribing`.
3) Select text in the transcript pane, then run a preset prompt.

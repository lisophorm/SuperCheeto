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

## Configuration
- `OPENAI_API_KEY` must be set in the environment or a `.env` file in `backend/`.
- Optional overrides in `.env`:
  - `WS_HOST`, `WS_PORT`
  - `STT_MODEL` (e.g. `base`, `small`)
  - `STT_DEVICE` (`cpu` or `cuda`), `STT_COMPUTE_TYPE` (`int8` for CPU)

## Audio Notes (Ubuntu)
- Requires PulseAudio or PipeWire with Pulse shim.
- Default monitor source is resolved from `pactl info`.
- If no monitor sources are found, select one manually in the UI or pass it via WebSocket.

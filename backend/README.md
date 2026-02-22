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
  - `AUDIO_SOURCE` (exact Pulse/PipeWire monitor source name to force capture device)
  - `STT_MODEL` (e.g. `base`, `small`)
  - `STT_DEVICE` (`cpu` or `cuda`), `STT_COMPUTE_TYPE` (`int8` for CPU)
  - `STT_VAD_FILTER` (`false` default; set `true` to suppress non-speech background)

## Audio Notes (Ubuntu)
- Requires PulseAudio or PipeWire with Pulse shim.
- If routing is incorrect, install and run `pavucontrol` (`sudo apt install -y pavucontrol`) and switch the backend recording stream to a `Monitor of ...` source in the **Recording** tab.
- Startup source selection priority:
  1. `set_audio_source` WebSocket message from UI/client
  2. `AUDIO_SOURCE` in environment
  3. Active browser/media sink input monitor (YouTube/Firefox/Chrome/etc.)
  4. Default sink monitor from `pactl info`
- If no monitor sources are found, select one manually in the UI or pass it via WebSocket.

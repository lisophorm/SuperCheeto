# Architecture

## High-level flow
- System audio output is captured locally on Ubuntu from Pulse/PipeWire monitor sources.
- Backend (`backend/app`) ingests PCM audio, transcribes with faster-whisper, and emits transcript updates over WebSocket.
- Frontend (`frontend/`) receives live/final transcript events, renders selectable text, and sends prompt queries to backend.
- Backend sends prompt responses back to frontend for display.

## Components and responsibilities
- `backend/app/audio_capture.py`: monitor source discovery and PCM capture process management.
- `backend/app/stt.py`: speech-to-text processing and live/final transcript generation.
- `backend/app/transcript.py`: transcript segment storage and context window handling.
- `backend/app/openai_client.py`: prompt execution against OpenAI text model.
- `backend/app/benchmark_harness.py`: standardized benchmark instruction and per-test payload formatting.
- `backend/app/ws_server.py`: WebSocket message routing and connection lifecycle.
- `frontend/src/`: transcript UI, prompt controls, output pane, and WS client behavior.
- `scripts/dev.sh`: local orchestration for backend/frontend process lifecycle.

## Runtime assumptions
- Ubuntu/Linux environment with PulseAudio or PipeWire (Pulse shim) for monitor capture.
- Local Python 3.11+ environment for backend dependencies.
- Node.js/npm environment for Electron + Vite frontend.
- `OPENAI_API_KEY` set in environment or `backend/.env`.

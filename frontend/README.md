# Frontend

Electron + React + Vite UI for streaming transcript, selection, and prompt execution.

## Setup
```bash
cd frontend
npm install
```

## Run (dev)
```bash
cd frontend
npm run dev
```
This starts Vite on `http://localhost:5173` and launches Electron.

## Notes
- Ensure the backend is running on `ws://127.0.0.1:8765` before hitting Start.
- Use the transcript pane to select text, then run a preset or custom prompt.
- Optional UI env in `frontend/.env`:
  - `VITE_MAX_ROWS` controls transcript pane max visible rows before scrolling (default `30`).

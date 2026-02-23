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
- Prompt bar supports switching between `System audio` and `Microphone`, with separate source selectors and meters.
- Use the transcript pane to select text, then run a preset or custom prompt.
- Optional UI env in `frontend/.env` and `frontend/.envb` (`.envb` is loaded by `vite.config.ts` and overrides duplicate keys):
  - `VITE_MAX_ROWS` controls transcript pane max visible rows before scrolling (default `30`).
  - `VITE_SELECTED_TEXT_ROWS_COLLAPSED` controls pre-send textarea rows when not focused (default `2`).
  - `VITE_SELECTED_TEXT_ROWS_FOCUSED` controls pre-send textarea rows when focused (default `10`).

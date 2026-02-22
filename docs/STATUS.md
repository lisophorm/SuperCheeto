# Status

## What works end-to-end
- Backend service runs via `python -m app.main` and serves WebSocket on `ws://127.0.0.1:8765`.
- Frontend Electron app connects to backend and supports transcript selection + prompt execution.
- Local audio capture + streaming transcription pipeline is wired through backend modules.
- Root launcher script `scripts/dev.sh` can start/stop/restart/status/logs for backend and frontend together, and now force-cleans lingering backend listeners on the WS port when PID files are missing.
- Benchmark runner now supports multi-test batches (`tests x models x repeats`) and keeps benchmark history in frontend local storage.
- Settings page now shows "Latest Result Per Model" from the newest run where each model appears.
- Settings benchmark flow now includes image upload/delete with reference ids (for example `IMAGE_1`), simple test CRUD, and live verbose runner logs.

## In progress
- No active in-progress items tracked in repo docs.

## Next 3 priorities
1. Add backend tests for benchmark validation rules and aggregate math (`runs`, `failures`, `jsonValidRuns`, latency stats).
2. Add frontend tests for benchmark history persistence and parsing (`test_id | prompt` lines).
3. Add optional export-to-JSON button for benchmark history in Settings.

## Known issues / blockers
- First startup fails if dependencies are missing in `backend/.venv` or `frontend/node_modules`; launcher does not auto-install deps.
  - Paths: `scripts/dev.sh`, `backend/requirements.txt`, `frontend/package.json`.
- Launcher manages frontend only by PID file; manually started frontend dev stacks are not auto-detected by `scripts/dev.sh stop`.
  - Paths: `scripts/dev.sh`, `frontend/package.json`.
- Audio routing can still require manual monitor selection in Ubuntu audio stack.
  - Paths: `backend/app/audio_capture.py`, `backend/README.md`.
- Benchmark history currently lives in browser local storage only; there is no backend persistence/export yet.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.
- Benchmark image assets are also local-storage-based and can grow large if many high-resolution images are uploaded.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.

## Quick verify checklist
1. Run `./scripts/dev.sh start`.
2. Run `./scripts/dev.sh status` and confirm both services are running.
3. Open the Electron UI and confirm backend connection state updates.
4. In Settings, run a benchmark using multiple `test_id | prompt` lines and confirm history keeps prior runs.
5. Run `./scripts/dev.sh stop` and confirm both services stop cleanly.

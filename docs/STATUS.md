# Status

## What works end-to-end
- Backend service runs via `python -m app.main` and serves WebSocket on `ws://127.0.0.1:8765`.
- Frontend Electron app connects to backend and supports transcript selection + prompt execution.
- Local audio capture + streaming transcription pipeline is wired through backend modules.
- Root launcher script `scripts/dev.sh` can start/stop/restart/status/logs for backend and frontend together, and now force-cleans lingering backend listeners and frontend dev processes when PID files are missing.
- Benchmark runner now supports multi-test batches (`tests x models x repeats`) and keeps benchmark history in frontend local storage.
- Benchmark history now de-duplicates entries by `benchmarkId`, preventing duplicate run cards/react-key collisions when repeat `benchmark_complete` events arrive.
- Settings page now shows "Latest Result Per Model" from the newest run where each model appears.
- "Latest Result Per Model" now hides models without benchmark results (no empty placeholder rows).
- Settings benchmark flow now includes image upload/delete with reference ids (for example `IMAGE_1`), simple test CRUD, and live verbose runner logs.
- Benchmark test CRUD entries now persist in local storage and reload after app restart/settings remount.
- Benchmark telemetry now records TTFT, final latency, token usage, estimated cost, modality success, and rubric-based quality checks.
- Benchmark telemetry now records explicit TTC (`ttcMs`) and includes a speed-first aggregate score (0-100) in benchmark results.
- Aggregate score weighting is tuned further toward speed (82% speed / 13% reliability / 5% quality) for faster model ranking decisions.
- Response pane now includes an editable pre-send selected-text textarea that expands on focus (rows configurable via `frontend/.envb`).
- Response pane pre-send textarea now includes a reset button ("Reset to selection") and transcript selection text now strips time/LIVE labels.
- Prompt bar now supports dual input modes (system monitor vs microphone), separate source dropdowns, and separate audio meters.
- Transcript events now carry source metadata and microphone transcript rows render in a distinct text color.
- Audio level bars now update at higher frequency and use combined RMS/peak scaling for faster response to transients.
- Audio meters are now always-on (even when transcription is stopped), enabling source troubleshooting before pressing Start.
- Benchmark image uploader now refreshes immediately after upload/replace and uses larger previews.
- Benchmark image previews are now clickable to open a full-size modal.
- Transcript pane now keeps LIVE at the bottom, appends new rows forward in time, and auto-scrolls to latest by default.
- Transcript selection handling now tracks selection inside the transcript container via `selectionchange`, with more stable time-range extraction.
- Transcript selection is now sticky (persists until explicitly cleared) and transcript row density is more compact (shorter line height/padding).
- Transcript height now respects `VITE_MAX_ROWS` more directly (without oversized minimum), and transcript text now uses `Roboto Condensed` 600.
- `Latest Result Per Model` now provides hover tooltips for headers (extended field descriptions) and data cells (column/value context).
- `Live Runner Log` preview cells are truncated to 100 characters with full text on hover.
- Query responses now stream live into the Response pane (`query_chunk`) with immediate partial text rendering.
- Response pane now includes `Stop` (cancel in-flight query) and `Do it again` (rerun last query payload) controls.

## In progress
- No active in-progress items tracked in repo docs.

## Next 3 priorities
1. Add backend tests for benchmark scoring math (usage/cost/quality/modality aggregates).
2. Add frontend tests for benchmark history + live log rendering with telemetry fields.
3. Add export/import JSON for benchmark history and image registry.

## Known issues / blockers
- First startup fails if dependencies are missing in `backend/.venv` or `frontend/node_modules`; launcher does not auto-install deps.
  - Paths: `scripts/dev.sh`, `backend/requirements.txt`, `frontend/package.json`.
- Frontend cleanup fallback matches the standard repo dev stack binaries (`concurrently`, `vite`, `tsc`, `wait-on`, `electron`); non-standard/custom frontend launch commands may still need manual stop.
  - Paths: `scripts/dev.sh`, `frontend/package.json`.
- Audio routing can still require manual monitor selection in Ubuntu audio stack.
  - Paths: `backend/app/audio_capture.py`, `backend/README.md`.
- Switching audio mode/source while already transcribing performs an automatic capture restart; this can reset in-flight live partial text.
  - Paths: `backend/app/main.py`, `backend/app/stt.py`.
- Benchmark history currently lives in browser local storage only; there is no backend persistence/export yet.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.
- Benchmark image assets are also local-storage-based and can grow large if many high-resolution images are uploaded.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.
- Model pricing defaults can drift as OpenAI pricing changes; keep `OPENAI_MODEL_PRICING_JSON` up to date.
  - Paths: `backend/app/model_pricing.py`, `README.md`.

## Quick verify checklist
1. Run `./scripts/dev.sh start`.
2. Run `./scripts/dev.sh status` and confirm both services are running.
3. Open the Electron UI and confirm backend connection state updates.
4. In Settings, create multiple benchmark tests via CRUD, run a benchmark, and confirm history keeps prior runs.
5. Run `./scripts/dev.sh stop` and confirm both services stop cleanly.

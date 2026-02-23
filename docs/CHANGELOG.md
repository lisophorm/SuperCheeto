# Changelog

## 2026-02-23 (audio meter responsiveness tuning)
- User-visible:
  - Audio level bars now react faster and with finer resolution (less “stale” jump behavior).
  - Audio level bars now work even before pressing `Start`, so input routing can be debugged without running transcription.
- Internal:
  - Backend meter emission cadence increased and now emits immediately on significant level jumps.
  - Meter level now uses combined RMS + peak-derived scaling to improve attack responsiveness.
  - Backend now runs dedicated always-on meter capture loops for system and mic sources, separate from STT capture.
  - Frontend meter width now uses fractional percentages instead of integer rounding.
  - Added optional meter-tuning env vars in backend:
    - `AUDIO_LEVEL_INTERVAL`
    - `AUDIO_LEVEL_RMS_REF`
    - `AUDIO_LEVEL_PEAK_REF`
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start transcription, produce short bursts of sound, and verify meter reflects spikes immediately with smoother detail.

## 2026-02-23 (dual audio mode: system + microphone)
- User-visible:
  - Added input mode switching between `System audio` and `Microphone`.
  - Added separate source dropdowns for system monitor and mic sources in the Prompt bar.
  - Added separate system/mic audio meters.
  - Transcript rows now carry source tags and microphone transcript text uses a distinct color.
- Internal:
  - Backend audio source discovery now returns both monitor sources and mic sources.
  - Added `set_mic_source` and `set_audio_mode` WebSocket messages and expanded `audio_sources` payload.
  - Switching source/mode while running now auto-restarts capture with model reuse to reduce switching overhead.
  - Transcript and audio-level WS events now include source metadata (`streamKind`/`sourceName`).
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start app, set mode to `System audio`, confirm system meter and transcript updates.
  - Switch mode to `Microphone`, speak, and confirm mic meter updates plus distinct transcript text color for mic rows.

## 2026-02-23 (speed-tuned aggregate score + editable pre-send text area)
- User-visible:
  - Tuned aggregate benchmark scoring to prioritize speed even more strongly.
  - Added an editable selected-text textarea in the Response column before output.
  - Selected-text textarea now collapses to 2 rows and expands to 10 rows on focus (configurable).
- Internal:
  - Updated score weights to `82% speed / 13% reliability / 5% quality` with tighter TTC/TTFT pivots.
  - Kept frontend fallback score calculation aligned with backend formula for older stored benchmark history rows.
  - Added `.envb` loader support in `frontend/vite.config.ts` and introduced:
    - `VITE_SELECTED_TEXT_ROWS_COLLAPSED`
    - `VITE_SELECTED_TEXT_ROWS_FOCUSED`
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Select transcript text, verify it appears in Response column textarea, edit it, and run query.
  - Focus/blur the textarea and verify row expansion/collapse behavior.

## 2026-02-23 (benchmark TTC + speed-first aggregate score)
- User-visible:
  - Benchmark logs/results now expose explicit `TTC` (time-to-complete) metrics.
  - Added `Agg Score` (0-100) in benchmark result tables, designed to prioritize speed.
- Internal:
  - Backend benchmark payload now includes `ttcMs` on attempts and `avgTtcMs|minTtcMs|maxTtcMs` plus `aggregateScore` on result rows.
  - Added a speed-first aggregate scoring formula (heavy TTC/TTFT weighting, with reliability and quality penalties).
  - Frontend latest/history/live benchmark tables now read TTC fields directly and render aggregate score.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a benchmark and verify TTC + Agg Score columns populate in Settings tables.

## 2026-02-23 (latest-result table hides empty models)
- User-visible:
  - "Latest Result Per Model" now renders only models that have benchmark results.
  - Models with no results are no longer shown as empty rows.
- Internal:
  - Frontend filters `latestPerModel` to `hasData` rows before rendering.
- How to test:
  - `cd frontend && npm run build`
  - Open Settings with models loaded but no benchmark history and confirm table shows the empty-state message.
  - Run benchmark for one model and confirm only that model appears in the table.

## 2026-02-23 (benchmark test persistence)
- User-visible:
  - Benchmark tests created/edited in Settings now persist across app restart and settings page remounts.
- Internal:
  - Added `benchmark-tests.v1` localStorage persistence for the editable test list.
  - Added safe load/normalize logic for stored test rows (invalid rows are filtered, row ids are rebuilt).
- How to test:
  - `cd frontend && npm run build`
  - Open Settings, create/edit/delete benchmark tests, then switch pages and restart app; confirm tests remain.

## 2026-02-23 (benchmark history de-dup + key warning fix)
- User-visible:
  - Fixed duplicate-key warnings in Settings benchmark history when the same benchmark run was recorded more than once.
- Internal:
  - Frontend now normalizes benchmark history by `benchmarkId` on localStorage load and on each `benchmark_complete` update.
  - Duplicate benchmark entries are dropped while preserving latest-first ordering and history cap.
- How to test:
  - `cd frontend && npm run build`
  - Run a benchmark, then trigger/observe repeated completion events for the same `benchmarkId` (or duplicate localStorage rows) and verify only one history card renders and no React duplicate-key warning appears.

## 2026-02-22 (query streaming + stop + rerun)
- User-visible:
  - Query responses now stream into the Response pane immediately instead of waiting for the full completion.
  - Added `Stop` button to cancel an in-flight query.
  - Added `Do it again` button to rerun the last query payload quickly.
- Internal:
  - Backend now executes `run_query` in a cancellable background task and emits `query_chunk` WebSocket events.
  - Added `cancel_query` frontend→backend WebSocket message handling.
  - Frontend now tracks active query request ids to merge streamed chunks safely and ignore stale responses.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a preset/custom query and confirm streamed text appears incrementally.
  - Click `Stop` mid-response and verify streaming halts with partial text preserved.
  - Click `Do it again` and verify the previous query re-runs.

## 2026-02-22 (dev launcher unmanaged frontend cleanup)
- User-visible:
  - `scripts/dev.sh stop` now also cleans up lingering frontend dev processes for this repo when no frontend PID file exists.
  - `scripts/dev.sh status` now reports unmanaged frontend dev process PIDs when detected.
  - `scripts/dev.sh start` now fails fast if an unmanaged frontend dev stack is already running.
- Internal:
  - Added frontend process discovery based on known repo dev toolchain executables (`concurrently`, `vite`, `tsc`, `wait-on`, `electron` under `frontend/node_modules`).
  - Added process-group fallback termination for unmanaged frontend stacks.
- How to test:
  - `bash -n scripts/dev.sh`
  - Start frontend manually (`cd frontend && npm run dev`)
  - `./scripts/dev.sh status` (should show unmanaged frontend PIDs)
  - `./scripts/dev.sh stop` (should clear unmanaged frontend processes)

## 2026-02-22 (dev launcher process cleanup)
- User-visible:
  - `scripts/dev.sh start` now fails fast with a clear message when the backend WS port is already occupied, including the blocking PID/command.
  - `scripts/dev.sh stop` now clears lingering backend listeners on the configured WS port (`BACKEND_WS_PORT`, default `8765`) even without a PID file.
- Internal:
  - Launcher now starts backend/frontend in separate process groups (`setsid`) and uses group-aware termination for managed processes.
  - Added listener discovery helpers using `lsof` (fallback `ss`) and unmanaged-listener reporting in `status`.
- How to test:
  - `bash -n scripts/dev.sh`
  - `./scripts/dev.sh start`
  - `./scripts/dev.sh restart`
  - `./scripts/dev.sh stop`
  - Start backend manually (`cd backend && ./.venv/bin/python -m app.main`), then run `./scripts/dev.sh stop` and confirm port `8765` is free.

## 2026-02-22
- User-visible:
  - Added `scripts/dev.sh` to quickly start/stop/restart both backend and frontend.
  - Added launcher utility commands: `status` and `logs`.
- Internal:
  - Added living docs set (`docs/INDEX.md`, `docs/STATUS.md`, `docs/API.md`, `docs/ARCHITECTURE.md`) and ADR index scaffold.
- How to test:
  - `./scripts/dev.sh start`
  - `./scripts/dev.sh status`
  - `./scripts/dev.sh logs`
  - `./scripts/dev.sh stop`

## 2026-02-22 (benchmark update)
- User-visible:
  - Benchmark now supports running multiple tests per run using `test_id | prompt` lines.
  - Benchmark history no longer gets overwritten on each run and is persisted in frontend local storage.
  - Benchmark results now show per-test/per-model rows and JSON-valid response count.
- Internal:
  - Backend `run_benchmark` now executes full `tests x models x repeats` matrix and emits richer progress/complete payloads.
  - Added shared benchmark harness prompt and structured test-case input builder in `backend/app/benchmark_harness.py`.
  - Kept backward compatibility for legacy benchmark requests using `selectedText`.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start app, open Settings, add 2+ test lines, run benchmark twice, and verify both runs remain in history.

## 2026-02-22 (benchmark summary by model)
- User-visible:
  - Added "Latest Result Per Model" table in Settings, showing newest available benchmark metrics per model.
- Internal:
  - Computes per-model summary from benchmark history in descending run order.
  - Persisted approach remains JSON/localStorage-based for MVP (no Prisma DB introduced).
- How to test:
  - `cd frontend && npm run build`
  - Run benchmarks using at least two models, then verify the summary table updates with latest rows for each model.

## 2026-02-22 (benchmark images + CRUD + verbose logs)
- User-visible:
  - Added benchmark image upload/replace/delete with explicit reference ids (for example `IMAGE_1`).
  - Added simple test CRUD UI in Settings (create/update/delete/select).
  - Test prompt editor now uses a dedicated 5-row textarea.
  - Added live verbose benchmark log table with per-attempt status, JSON validity, latency, error, and response preview.
- Internal:
  - Backend benchmark payload now carries `imageRef` and emits `benchmark_log` events during execution.
  - Benchmark progress payload now includes rolling success/failure counters.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Upload an image with ref `IMAGE_1`, create a test that references it, run a benchmark, and verify live logs + history rows.

## 2026-02-22 (benchmark telemetry: latency usage cost quality)
- User-visible:
  - Benchmark logs and results now include TTFT, final latency, token usage, estimated cost, image-capability outcome, and quality score/checks.
  - Settings tables now surface those metrics per attempt and per model/test rollup.
- Internal:
  - Benchmark requests now use streaming Responses API path to capture time-to-first-token.
  - Added backend model pricing catalog with `OPENAI_MODEL_PRICING_JSON` override support for cost estimation.
  - Added rubric evaluator for pass/fail quality checks and image-modality success tracking.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a benchmark and verify `benchmark_log` rows include TTFT/tokens/cost/quality fields.

## 2026-02-22 (benchmark image uploader UI refresh + larger preview)
- User-visible:
  - Benchmark image upload now reliably updates UI after upload/replace.
  - Benchmark image previews are now 3x larger for easier verification.
- Internal:
  - Uploader now reads file from input ref as fallback and clears the native file input value after successful upload.
- How to test:
  - `cd frontend && npm run build`
  - Upload/replace an image ref (including re-uploading the same file) and confirm table updates immediately.

## 2026-02-22 (benchmark image full-size modal)
- User-visible:
  - Clicking an image preview now opens a larger modal preview.
  - Modal closes on backdrop click or Close button.
- Internal:
  - Added modal state in Settings benchmark image section.
  - Added modal/backdrop CSS styles with responsive max-height behavior.
- How to test:
  - `cd frontend && npm run build`
  - In Settings > Benchmark Images, click a thumbnail and verify full-size modal opens/closes.

## 2026-02-22 (transcript direction + selection flow)
- User-visible:
  - Transcript LIVE row is now anchored at the bottom of the transcript pane.
  - New transcript rows now progress forward and push older rows upward instead of rendering in reverse order.
  - Transcript action button now scrolls to latest (bottom).
  - Text selection behavior is more consistent for transcript-only selection and time-range extraction.
- Internal:
  - Live row buffering now appends instead of prepending.
  - Transcript pane now renders in chronological order and auto-scrolls to bottom when not paused.
  - Selection tracking moved to `selectionchange` listener constrained to transcript container rows.
- How to test:
  - `cd frontend && npm run build`
  - Start transcription, confirm live text stays at bottom and newest finalized lines appear below older ones.
  - Select text across multiple transcript rows and verify selection remains stable.

## 2026-02-22 (sticky selection + compact transcript rows)
- User-visible:
  - Transcript selection is now sticky and no longer clears on incidental outside clicks.
  - Added explicit `Clear Selection` action in transcript controls.
  - Transcript row presentation is denser (shorter line-height/padding) for faster scanning.
- Internal:
  - Selection handler now ignores collapsed/non-transcript selections instead of clearing selected text state.
  - `clear_transcript` action now resets selected text/time range state in app.
- How to test:
  - `cd frontend && npm run build`
  - Select transcript text, click elsewhere, confirm selection context remains until pressing `Clear Selection` or `Clear`.
  - Verify transcript rows are visually more compact.

## 2026-02-22 (transcript max rows + typeface)
- User-visible:
  - Transcript viewport height now honors `VITE_MAX_ROWS` much more closely (including small values like `10`).
  - Transcript row text now uses `Roboto Condensed` at weight `600`.
- Internal:
  - Replaced oversized `maxHeight` minimum with a tighter rows-based height calculation.
  - Applied `Roboto Condensed` font style to transcript and LIVE row text only.
- How to test:
  - Set `VITE_MAX_ROWS=10`, restart frontend dev server, and verify only around ~10 rows are visible before scroll.
  - Verify transcript text face/weight changed to Roboto Condensed 600.

## 2026-02-22 (latest result table hover tooltips)
- User-visible:
  - Added descriptive tooltips to `Latest Result Per Model` header cells.
  - Added per-cell hover titles so each value shows its column label/value.
- Internal:
  - Implemented native `title` attributes for header and data cells in the latest result table.
- How to test:
  - Hover over table headers and data cells in `Latest Result Per Model` and verify tooltip text appears.

## 2026-02-22 (live log preview truncation)
- User-visible:
  - `Live Runner Log` preview column now shows only the first 100 characters.
  - Hovering preview cells shows full preview text in tooltip.
- Internal:
  - Added preview truncation helper and full-text `title` on preview cells.
- How to test:
  - Run benchmark, confirm Preview column is truncated and full text appears on hover.

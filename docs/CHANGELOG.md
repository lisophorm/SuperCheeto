# Changelog

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

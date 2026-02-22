# ADR 0001: Benchmark Batch Protocol and History Retention

## Status
Accepted

## Context
The original benchmark flow handled one input text per run and replaced previous results when a new run completed.
This made it hard to benchmark multiple test cases consistently and impossible to compare historical runs in the UI.
We also needed to align benchmark instructions with a standardized harness prompt that requires JSON output for easier scoring.

## Decision
- Extend `run_benchmark` request to support `tests` array payload:
  - `{ testId, userPrompt, imageDataUrl? }`
- Execute benchmark as full matrix:
  - `tests x models x repeats`
- Keep a single shared benchmark instruction per run (harness prompt default on backend).
- Extend benchmark events:
  - `benchmark_progress` includes `testId`, `model`, and `run`
  - `benchmark_complete` includes metadata (`createdAt`, `instruction`, `tests`) plus aggregate rows and attempt rows
- Preserve prior benchmark runs in frontend state and local storage instead of replacing previous run output.
- Maintain backward compatibility by accepting legacy `selectedText` payload as a single fallback test.

## Alternatives considered
- Option A: Keep single-test payload and ask users to run tests manually one by one.
  - Pros: minimal code changes.
  - Cons: poor usability, no run-level comparability, easy operator error.
- Option B: Store benchmark history only in backend memory.
  - Pros: centralized state.
  - Cons: state lost on backend restart, additional API needed to fetch history, more coupling.

## Consequences
- Benchmark protocol is richer and now requires frontend/backend schema alignment.
- Frontend can run and retain multiple benchmark suites without data loss on each run.
- Local storage persistence is client-local and not shared across machines/users.
- Follow-up: add export/import (JSON) and optional backend persistence for long-term tracking.

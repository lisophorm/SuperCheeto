# ADR 0003: Benchmark Image Reference Registry and Verbose Runner Logs

## Status
Accepted

## Context
Benchmark tests need reusable image references (`IMAGE_1`, etc.) and users need clearer runtime visibility while benchmarks execute.
The prior benchmark input model did not provide first-class image id management or live per-attempt diagnostics.

## Decision
- Add frontend-managed benchmark image registry with upload/replace/delete by reference id.
- Add simple CRUD for benchmark tests where each test can attach an optional `imageRef`.
- Resolve `imageRef -> imageDataUrl` in frontend before dispatching `run_benchmark`.
- Extend backend benchmark protocol:
  - Accept/retain `imageRef` in test payload.
  - Emit `benchmark_log` event per attempt with status, latency, json validity, errors, and response preview.
  - Include running `successes`/`failures` counters in `benchmark_progress`.

## Alternatives considered
- Option A: Keep line-based test text format only.
  - Pros: less UI code.
  - Cons: hard to maintain, weak validation, poor ergonomics for image references.
- Option B: Emit only final benchmark result events.
  - Pros: lower event volume.
  - Cons: poor observability for long runs and failure triage.

## Consequences
- Benchmark execution is more transparent and debuggable.
- Frontend state/model complexity increases (image registry + test CRUD + live logs).
- Local storage size can increase due to base64 image persistence.

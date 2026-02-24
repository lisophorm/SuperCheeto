# ADR 0004: Benchmark Telemetry (TTFT, Usage, Cost, Quality)

## Status
Accepted

## Context
Benchmarking needed more than latency-only metrics. We now need operational telemetry (TTFT, usage, cost), modality success on image tests, and rubric-based quality checks to compare model behavior, not just speed.

## Decision
- Extend benchmark attempt telemetry to include:
  - Time to first token (`timeToFirstTokenMs`)
  - Final latency (`latencyMs`)
  - Usage (`inputTokens`, `outputTokens`, `totalTokens`)
  - Estimated cost (`costUsd`)
  - Modality result (`imageCapabilityClaim`, `imageWorked`)
  - Quality (`qualityScore`, `qualityPassed`, `qualityChecks`)
- Execute benchmark calls through streaming `Responses` API to capture TTFT.
- Aggregate and expose per test/model rollups for usage, cost, modality, and quality.
- Add backend pricing catalog with optional `OPENAI_MODEL_PRICING_JSON` override for mutable pricing.

## Alternatives considered
- Option A: Keep only final latency and error counts.
  - Pros: simpler implementation.
  - Cons: cannot evaluate cost, modality reliability, or output quality.
- Option B: Capture telemetry client-side only in frontend.
  - Pros: fewer backend changes.
  - Cons: weaker source-of-truth, harder to reuse across clients.

## Consequences
- Better benchmarking quality and decision support across models.
- More protocol surface area and larger history payloads.
- Cost estimates depend on pricing catalog freshness; override mechanism is required for currency.

# ADR 0006: Speed-First Aggregate Score and TTC Benchmark Field

## Status
Accepted

## Context
Benchmark output already included TTFT, latency, and quality signals, but result tables lacked an explicit time-to-complete label (`TTC`) and had no single ranking score. We need a defensible aggregate score that strongly favors speed while still penalizing unstable or low-quality responses.

## Decision
- Introduce explicit `ttcMs` on benchmark attempt logs.
- Introduce explicit TTC rollups on benchmark results:
  - `avgTtcMs`
  - `minTtcMs`
  - `maxTtcMs`
- Keep legacy latency fields (`avgLatencyMs`, etc.) for compatibility.
- Add `aggregateScore` (0-100) on benchmark result rows using a speed-first formula:
  - 82% speed (`TTC` + `TTFT`)
  - 13% reliability (success rate + JSON validity)
  - 5% quality/image behavior
  - plus a failure penalty multiplier to prevent fast-but-broken runs from ranking high.

## Alternatives considered
- Option A: Use quality-only aggregate score.
  - Pros: pushes correctness first.
  - Cons: ignores primary requirement that benchmark ranking should prioritize speed.
- Option B: Use raw latency-only ranking.
  - Pros: simple and highly speed-focused.
  - Cons: can over-rank unstable outputs with parse/runtime failures.

## Consequences
- Result tables now surface TTC explicitly and can be sorted/compared by a single score.
- Score behavior is more aligned with speed-sensitive workloads.
- Weighting is policy and may require tuning as workload characteristics evolve.

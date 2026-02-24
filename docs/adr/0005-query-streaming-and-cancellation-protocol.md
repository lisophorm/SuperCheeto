# ADR 0005: Query Streaming and Cancellation Protocol

## Status
Accepted

## Context
Interactive query UX was waiting for full completion before rendering output. This made long responses feel blocked and offered no way to stop expensive or irrelevant runs mid-generation. We also needed a quick way to rerun the same query payload without reselecting transcript text or rebuilding the prompt setup.

## Decision
- Keep `run_query` as the primary request message, but execute it asynchronously in backend so control messages can be handled while a query is in progress.
- Add backend-to-frontend `query_chunk` events carrying incremental deltas for live response rendering.
- Extend `query_state` to include optional `cancelled` so UI can distinguish user stop from normal completion.
- Add frontend-to-backend `cancel_query` message with optional `requestId`.
- Frontend tracks active `requestId` and only applies chunks/final responses for that active request.
- UI adds `Stop` (cancel active query) and `Do it again` (rerun last sent query payload).

## Alternatives considered
- Option A: keep non-streaming responses only.
  - Pros: simpler protocol and less frontend state.
  - Cons: poor latency perception and no incremental visibility.
- Option B: stream through a second dedicated WebSocket channel.
  - Pros: clearer separation between control and content streams.
  - Cons: extra connection complexity without meaningful MVP benefit.

## Consequences
- Better perceived latency and control for live desk workflow.
- WebSocket protocol expanded (`query_chunk`, `cancel_query`, `query_state.cancelled`) and requires frontend/backend compatibility.
- Backend query path now maintains active-task lifecycle and cancellation cleanup.

# API

## Transport
- Protocol: WebSocket
- Endpoint: `ws://127.0.0.1:8765`
- Reconnect: frontend client retries connection; backend accepts reconnects and repeated start/stop cycles.

## Backend -> Frontend messages
- `transcript_live`
  - Payload: `{ "text": string, "t": number }`
- `transcript_segment`
  - Payload: `{ "segment": { "id": string|number, "t0": number, "t1": number, "text": string, "is_final": boolean } }`
- `status`
  - Payload: `{ "state": string, "details": object|string|null }`
- `query_response`
  - Payload: `{ "requestId": string, "text": string }`
- `error`
  - Payload: `{ "message": string }`

## Frontend -> Backend messages
- `set_audio_source`
  - Payload: `{ "sourceName": string }`
- `start_transcription`
  - Payload: none
- `stop_transcription`
  - Payload: none
- `run_query`
  - Payload:
    - `{ "requestId": string, "presetId": string|null, "customInstruction": string|null, "selectedText": string, "selectionTimeRange": { "start": number, "end": number }|null, "model"?: string|null, "includeScreenshot"?: boolean, "screenshotDataUrl"?: string|null }`
- `run_benchmark`
  - Payload:
    - `{ "benchmarkId": string, "models": string[], "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef"?: string|null, "imageDataUrl"?: string|null }>, "repeats": number }`
  - Backward compatibility:
    - Legacy single-test payload with `selectedText` is still accepted.

## Benchmark backend -> frontend messages
- `benchmark_progress`
  - Payload:
    - `{ "benchmarkId": string, "completed": number, "total": number, "testId": string, "model": string, "run": number, "successes": number, "failures": number }`
- `benchmark_log`
  - Payload:
    - `{ "benchmarkId": string, "testId": string, "model": string, "run": number, "success": boolean, "jsonValid": boolean, "latencyMs": number|null, "responsePreview": string, "error": string|null, "imageRef": string|null }`
- `benchmark_complete`
  - Payload:
    - `{ "benchmarkId": string, "createdAt": number, "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef": string|null, "hasImage": boolean }>, "results": Array<{ "testId": string, "model": string, "runs": number, "failures": number, "jsonValidRuns": number, "avgLatencyMs": number|null, "minLatencyMs": number|null, "maxLatencyMs": number|null }>, "attempts": Array<{ "testId": string, "model": string, "run": number, "success": boolean, "jsonValid": boolean, "latencyMs": number|null, "responsePreview": string, "error": string|null, "imageRef": string|null }> }`

## Versioning notes
- No explicit protocol version field is currently enforced.
- Any schema or event-name change should add a protocol version and a new ADR.

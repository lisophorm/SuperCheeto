# ADR 0007: Dual Audio Mode (System Monitor + Microphone)

## Status
Accepted

## Context
The desk workflow previously captured only system monitor audio. Users also need direct microphone transcription and fast switching between the two inputs without manually restarting the app.

Constraints:
- Keep existing monitor workflow working for current clients.
- Avoid full model reload on every source switch to limit switch delay.
- Keep transcript output understandable when both modes are used in one session.

## Decision
- Extend backend source discovery to return both monitor sources and microphone sources.
- Add protocol messages:
  - `set_audio_mode` (`system` or `mic`)
  - `set_mic_source`
- Keep `set_audio_source` as monitor-source message for backward compatibility.
- Add source metadata (`streamKind`, `sourceName`) to `transcript_live` and `audio_level`, and source fields on `transcript_segment`.
- In frontend, add:
  - input-mode dropdown,
  - system source dropdown,
  - mic source dropdown,
  - separate system/mic meters,
  - source-based transcript styling (mic rows in distinct color).
- On runtime mode/source change, restart capture/transcription loops automatically while reusing loaded Whisper model state to reduce handoff delay.

## Alternatives considered
- Option A: Keep one source only and require manual stop/start for mic.
  - Pros: minimal changes.
  - Cons: poor UX and frequent manual intervention.
- Option B: Run simultaneous dual transcribers (system + mic) always.
  - Pros: no switching delay; both streams always available.
  - Cons: higher CPU/GPU cost and higher latency risk under load.

## Consequences
- Protocol surface grew; docs/frontend/backend needed coordinated updates.
- Switching is faster because model load is reused, but capture restart still causes a short transition window.
- Transcript rows now include source metadata, enabling source-aware UI features.

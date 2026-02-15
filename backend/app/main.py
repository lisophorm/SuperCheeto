from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Optional

import numpy as np
from dotenv import load_dotenv

from .audio_capture import AudioCapture, discover_audio_sources
from .openai_client import OpenAIClient, preset_by_id
from .settings import Settings
from .stt import Segment, StreamingTranscriber
from .transcript import SelectionRange, TranscriptStore
from .ws_server import WebSocketHub


@dataclass
class AppState:
    audio_source: Optional[str] = None
    running: bool = False


class AppController:
    def __init__(self) -> None:
        load_dotenv()
        self.settings = Settings()
        self.state = AppState()
        self.transcript = TranscriptStore()
        self.hub = WebSocketHub(self.settings.ws_host, self.settings.ws_port, self._handle_message)
        self._capture: Optional[AudioCapture] = None
        self._transcriber: Optional[StreamingTranscriber] = None
        self._audio_task: Optional[asyncio.Task] = None
        self._stt_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._openai_client: Optional[OpenAIClient] = None

    async def start(self) -> None:
        await self.hub.start()
        await self.hub.broadcast("status", {"state": "ready", "details": "WebSocket ready"})

    async def stop(self) -> None:
        await self.stop_transcription()
        await self.hub.stop()
        if self._openai_client:
            await self._openai_client.close()

    async def _handle_message(self, data: dict) -> None:
        msg_type = data.get("type")
        if msg_type == "set_audio_source":
            self.state.audio_source = data.get("sourceName")
            await self.hub.broadcast("status", {"state": "source_set", "details": self.state.audio_source})
        elif msg_type == "start_transcription":
            await self.start_transcription()
        elif msg_type == "stop_transcription":
            await self.stop_transcription()
        elif msg_type == "run_query":
            await self.run_query(data)
        elif msg_type == "clear_transcript":
            self.transcript = TranscriptStore()
            await self.hub.broadcast("status", {"state": "cleared", "details": "Transcript cleared"})

    async def start_transcription(self) -> None:
        if self.state.running:
            return
        sources = discover_audio_sources()
        chosen = self.state.audio_source or sources.default_monitor
        if not chosen:
            await self.hub.broadcast(
                "error",
                {
                    "message": "No monitor sources found. Start audio, ensure Pulse/PipeWire is running, or set source manually.",
                    "sources": sources.monitor_sources,
                },
            )
            return
        self._capture = AudioCapture(chosen, self.settings.chunk_bytes)
        try:
            await self._capture.start()
        except Exception as exc:
            await self.hub.broadcast("error", {"message": str(exc)})
            return
        self._transcriber = StreamingTranscriber(
            sample_rate=self.settings.sample_rate,
            model_name=self.settings.stt_model,
            device=self.settings.stt_device,
            compute_type=self.settings.stt_compute_type,
            partial_window=self.settings.partial_window_seconds,
            partial_interval=self.settings.partial_interval_seconds,
            final_window=self.settings.final_window_seconds,
            final_interval=self.settings.final_interval_seconds,
            final_lag=self.settings.final_lag_seconds,
            on_live=self._on_live_text,
            on_segment=self._on_segment,
        )
        try:
            await self._transcriber.load_model()
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Failed to load model: {exc}"})
            return
        self._stop_event.clear()
        self._audio_task = asyncio.create_task(self._audio_loop())
        self._stt_task = asyncio.create_task(self._transcriber.run(self._stop_event))
        self.state.running = True
        await self.hub.broadcast("status", {"state": "transcribing", "details": f"Using {chosen}"})

    async def stop_transcription(self) -> None:
        if not self.state.running:
            return
        self._stop_event.set()
        tasks = [task for task in (self._audio_task, self._stt_task) if task]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if self._capture:
            await self._capture.stop()
        self.state.running = False
        await self.hub.broadcast("status", {"state": "stopped", "details": "Transcription stopped"})

    async def _audio_loop(self) -> None:
        assert self._capture is not None
        assert self._transcriber is not None
        last_rms_at = 0.0
        try:
            async for chunk in self._capture.stream():
                samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
                await self._transcriber.add_audio(samples)
                now = asyncio.get_event_loop().time()
                if now - last_rms_at >= 1.0:
                    rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
                    print(f"[audio] RMS={rms:.4f}")
                    last_rms_at = now
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Audio capture error: {exc}"})

    async def _on_live_text(self, text: str, timestamp: float) -> None:
        await self.hub.broadcast("transcript_live", {"text": text, "t": timestamp})

    async def _on_segment(self, segment: Segment) -> None:
        self.transcript.add_segment(segment)
        await self.hub.broadcast("transcript_segment", {"segment": segment.__dict__})

    async def run_query(self, data: dict) -> None:
        request_id = data.get("requestId")
        selected_text = (data.get("selectedText") or "").strip()
        if not selected_text:
            await self.hub.broadcast("error", {"message": "No selected text provided."})
            return
        preset_id = data.get("presetId")
        custom_instruction = (data.get("customInstruction") or "").strip()
        instruction = custom_instruction
        if preset_id:
            preset = preset_by_id(preset_id)
            if not preset:
                await self.hub.broadcast("error", {"message": f"Unknown preset {preset_id}."})
                return
            instruction = preset.instruction
        if not instruction:
            await self.hub.broadcast("error", {"message": "Instruction missing."})
            return

        selection_range = None
        selection_payload = data.get("selectionTimeRange")
        if selection_payload and "start" in selection_payload and "end" in selection_payload:
            selection_range = SelectionRange(
                start=float(selection_payload["start"]),
                end=float(selection_payload["end"]),
            )

        context_text = self.transcript.build_context(
            selection_range,
            before_seconds=self.settings.context_before_seconds,
            after_seconds=self.settings.context_after_seconds,
        )

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            await self.hub.broadcast("error", {"message": "OPENAI_API_KEY is missing."})
            return
        if not self._openai_client:
            self._openai_client = OpenAIClient(
                api_key=api_key,
                model=self.settings.openai_model,
                timeout_seconds=self.settings.openai_timeout_seconds,
            )
        try:
            response_text = await self._openai_client.run_query(
                instruction=instruction,
                selected_text=selected_text,
                context_text=context_text,
            )
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"OpenAI request failed: {exc}"})
            return
        await self.hub.broadcast(
            "query_response",
            {"requestId": request_id, "text": response_text},
        )


async def main() -> None:
    controller = AppController()
    await controller.start()
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await controller.stop()


if __name__ == "__main__":
    asyncio.run(main())

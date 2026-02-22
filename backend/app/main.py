from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from time import time
from typing import Optional

import numpy as np
from dotenv import load_dotenv

from .audio_capture import AudioCapture, discover_audio_sources
from .benchmark_harness import BENCHMARK_HARNESS_PROMPT, build_benchmark_case_input
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
        backend_dir = Path(__file__).resolve().parents[1]
        load_dotenv(backend_dir / ".env", override=False)
        load_dotenv(backend_dir / ".env.local", override=True)
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
            await self._broadcast_audio_sources()
        elif msg_type == "get_audio_sources":
            await self._broadcast_audio_sources()
        elif msg_type == "get_models":
            await self._broadcast_models()
        elif msg_type == "get_model_details":
            await self._broadcast_model_details()
        elif msg_type == "start_transcription":
            await self.start_transcription()
        elif msg_type == "stop_transcription":
            await self.stop_transcription()
        elif msg_type == "run_query":
            await self.run_query(data)
        elif msg_type == "run_benchmark":
            await self.run_benchmark(data)
        elif msg_type == "clear_transcript":
            self.transcript = TranscriptStore()
            await self.hub.broadcast("status", {"state": "cleared", "details": "Transcript cleared"})

    async def _broadcast_audio_sources(self) -> None:
        sources = discover_audio_sources()
        selected_source = self.state.audio_source or self.settings.audio_source or sources.preferred_monitor
        await self.hub.broadcast(
            "audio_sources",
            {
                "sources": sources.monitor_sources,
                "defaultSource": sources.default_monitor,
                "selectedSource": selected_source,
            },
        )

    async def _broadcast_models(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            await self.hub.broadcast("models_list", {"models": [], "selectedModel": self.settings.openai_model})
            return
        if not self._openai_client:
            self._openai_client = OpenAIClient(
                api_key=api_key,
                model=self.settings.openai_model,
                timeout_seconds=self.settings.openai_timeout_seconds,
            )
        try:
            models = await self._openai_client.list_models()
        except Exception:
            models = [self.settings.openai_model]
        if self.settings.openai_model and self.settings.openai_model not in models:
            models.insert(0, self.settings.openai_model)
        await self.hub.broadcast("models_list", {"models": models, "selectedModel": self.settings.openai_model})

    async def _broadcast_model_details(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            await self.hub.broadcast("models_details", {"models": []})
            return
        if not self._openai_client:
            self._openai_client = OpenAIClient(
                api_key=api_key,
                model=self.settings.openai_model,
                timeout_seconds=self.settings.openai_timeout_seconds,
            )
        try:
            models = await self._openai_client.list_model_details()
        except Exception:
            models = []
        await self.hub.broadcast("models_details", {"models": models})

    async def start_transcription(self) -> None:
        if self.state.running:
            return
        sources = discover_audio_sources()
        chosen = self.state.audio_source or self.settings.audio_source or sources.preferred_monitor
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
            vad_filter=self.settings.stt_vad_filter,
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
        self._stt_task = asyncio.create_task(self._stt_loop())
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
        loop = asyncio.get_event_loop()
        last_rms_print_at = 0.0
        last_level_broadcast_at = 0.0
        try:
            async for chunk in self._capture.stream():
                samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
                await self._transcriber.add_audio(samples)
                now = loop.time()
                rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
                # Compress RMS into a stable 0..1 visual meter.
                level = min(1.0, max(0.0, rms / 0.08))
                if now - last_level_broadcast_at >= 0.12:
                    await self.hub.broadcast("audio_level", {"rms": rms, "level": level, "t": now})
                    last_level_broadcast_at = now
                if now - last_rms_print_at >= 1.0:
                    print(f"[audio] RMS={rms:.4f}")
                    last_rms_print_at = now
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Audio capture error: {exc}"})

    async def _stt_loop(self) -> None:
        assert self._transcriber is not None
        try:
            await self._transcriber.run(self._stop_event)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"STT processing error: {exc}"})

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
        requested_model = (data.get("model") or "").strip() or self.settings.openai_model
        include_screenshot = bool(data.get("includeScreenshot"))
        screenshot_data_url = (data.get("screenshotDataUrl") or "").strip() or None
        if screenshot_data_url and not screenshot_data_url.startswith("data:image/"):
            screenshot_data_url = None
        if not include_screenshot:
            screenshot_data_url = None

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
        await self.hub.broadcast("query_state", {"running": True, "requestId": request_id})
        try:
            result = await self._openai_client.run_query(
                instruction=instruction,
                selected_text=selected_text,
                context_text=context_text,
                model=requested_model,
                screenshot_data_url=screenshot_data_url,
            )
        except Exception as exc:
            await self.hub.broadcast("query_state", {"running": False, "requestId": request_id})
            await self.hub.broadcast("error", {"message": f"OpenAI request failed: {exc}"})
            return
        await self.hub.broadcast("query_state", {"running": False, "requestId": request_id})
        await self.hub.broadcast(
            "query_response",
            {
                "requestId": request_id,
                "text": result.text,
                "latencyMs": result.latency_ms,
                "model": requested_model,
                "screenshotUsed": bool(screenshot_data_url),
            },
        )

    @staticmethod
    def _normalize_benchmark_tests(data: dict) -> list[dict]:
        raw_tests = data.get("tests")
        normalized: list[dict] = []
        if isinstance(raw_tests, list):
            for index, item in enumerate(raw_tests, start=1):
                if not isinstance(item, dict):
                    continue
                test_id = str(item.get("testId") or f"test_{index}").strip()
                user_prompt = str(item.get("userPrompt") or "").strip()
                image_ref = str(item.get("imageRef") or "").strip() or None
                image_data_url = str(item.get("imageDataUrl") or "").strip() or None
                if image_data_url and not image_data_url.startswith("data:image/"):
                    image_data_url = None
                if not user_prompt:
                    continue
                normalized.append(
                    {
                        "testId": test_id,
                        "userPrompt": user_prompt,
                        "imageRef": image_ref,
                        "imageDataUrl": image_data_url,
                    }
                )

        # Backward compatibility for the old single-input benchmark payload.
        if not normalized:
            selected_text = str(data.get("selectedText") or "").strip()
            if selected_text:
                normalized = [
                    {
                        "testId": "test_1",
                        "userPrompt": selected_text,
                        "imageRef": None,
                        "imageDataUrl": None,
                    }
                ]
        if not normalized:
            return []

        # Ensure unique test ids in case callers submit duplicates.
        seen_ids: set[str] = set()
        for test in normalized:
            base_id = test["testId"]
            candidate = base_id
            suffix = 2
            while candidate in seen_ids:
                candidate = f"{base_id}_{suffix}"
                suffix += 1
            test["testId"] = candidate
            seen_ids.add(candidate)
        return normalized

    async def run_benchmark(self, data: dict) -> None:
        benchmark_id = str(data.get("benchmarkId") or "")
        models = [str(model).strip() for model in data.get("models", []) if str(model).strip()]
        instruction = str(data.get("instruction") or "").strip() or BENCHMARK_HARNESS_PROMPT
        tests = self._normalize_benchmark_tests(data)
        repeats_raw = data.get("repeats", 1)
        try:
            repeats = int(repeats_raw)
        except (TypeError, ValueError):
            repeats = 1
        repeats = max(1, min(repeats, 10))

        if not benchmark_id:
            await self.hub.broadcast("error", {"message": "Benchmark id is required."})
            return
        if not models:
            await self.hub.broadcast("error", {"message": "Select at least one model for benchmark."})
            return
        if not instruction:
            await self.hub.broadcast("error", {"message": "Benchmark instruction is required."})
            return
        if not tests:
            await self.hub.broadcast("error", {"message": "At least one benchmark test is required."})
            return

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

        total = len(tests) * len(models) * repeats
        completed = 0
        success_count = 0
        failure_count = 0
        aggregate: dict[tuple[str, str], dict] = {}
        attempts: list[dict] = []

        for test in tests:
            test_id = test["testId"]
            user_prompt = test["userPrompt"]
            image_data_url = test["imageDataUrl"]
            image_ref = test["imageRef"]
            for model in models:
                key = (test_id, model)
                row = aggregate.setdefault(
                    key,
                    {
                        "testId": test_id,
                        "model": model,
                        "runs": 0,
                        "failures": 0,
                        "jsonValidRuns": 0,
                        "latencies": [],
                    },
                )
                for run_index in range(1, repeats + 1):
                    try:
                        selected_text = build_benchmark_case_input(
                            test_id=test_id,
                            user_prompt=user_prompt,
                            image_ref_id=image_ref if image_data_url else None,
                        )
                        result = await self._openai_client.run_query(
                            instruction=instruction,
                            selected_text=selected_text,
                            context_text="",
                            model=model,
                            screenshot_data_url=image_data_url,
                        )
                        row["runs"] += 1
                        row["latencies"].append(result.latency_ms)
                        response_text = result.text.strip()
                        json_valid = False
                        parse_error = None
                        try:
                            parsed = json.loads(response_text)
                            json_valid = isinstance(parsed, dict)
                            if not json_valid:
                                parse_error = "Response was valid JSON but not an object."
                        except json.JSONDecodeError as exc:
                            parse_error = f"{exc.msg} (pos {exc.pos})"
                        if json_valid:
                            row["jsonValidRuns"] += 1
                        attempts.append(
                            {
                                "testId": test_id,
                                "model": model,
                                "run": run_index,
                                "success": True,
                                "jsonValid": json_valid,
                                "latencyMs": result.latency_ms,
                                "responsePreview": response_text[:500],
                                "error": parse_error,
                                "imageRef": image_ref,
                            }
                        )
                    except Exception as exc:
                        row["failures"] += 1
                        failure_count += 1
                        attempts.append(
                            {
                                "testId": test_id,
                                "model": model,
                                "run": run_index,
                                "success": False,
                                "jsonValid": False,
                                "latencyMs": None,
                                "responsePreview": "",
                                "error": str(exc),
                                "imageRef": image_ref,
                            }
                        )
                    else:
                        success_count += 1
                    await self.hub.broadcast(
                        "benchmark_log",
                        {
                            "benchmarkId": benchmark_id,
                            **attempts[-1],
                        },
                    )
                    completed += 1
                    await self.hub.broadcast(
                        "benchmark_progress",
                        {
                            "benchmarkId": benchmark_id,
                            "completed": completed,
                            "total": total,
                            "testId": test_id,
                            "model": model,
                            "run": run_index,
                            "successes": success_count,
                            "failures": failure_count,
                        },
                    )

        rows: list[dict] = []
        for row in aggregate.values():
            latencies = row["latencies"]
            rows.append(
                {
                    "testId": row["testId"],
                    "model": row["model"],
                    "runs": row["runs"],
                    "failures": row["failures"],
                    "jsonValidRuns": row["jsonValidRuns"],
                    "avgLatencyMs": mean(latencies) if latencies else None,
                    "minLatencyMs": min(latencies) if latencies else None,
                    "maxLatencyMs": max(latencies) if latencies else None,
                }
            )

        rows.sort(
            key=lambda row: (
                row["testId"],
                row["avgLatencyMs"] if row["avgLatencyMs"] is not None else float("inf"),
            )
        )
        await self.hub.broadcast(
            "benchmark_complete",
            {
                "benchmarkId": benchmark_id,
                "createdAt": int(time()),
                "instruction": instruction,
                "tests": [
                    {
                        "testId": test["testId"],
                        "userPrompt": test["userPrompt"],
                        "imageRef": test["imageRef"],
                        "hasImage": bool(test["imageDataUrl"]),
                    }
                    for test in tests
                ],
                "results": rows,
                "attempts": attempts,
            },
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

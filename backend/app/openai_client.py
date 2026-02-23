from __future__ import annotations

import json
import inspect
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx


@dataclass(frozen=True)
class PresetPrompt:
    id: str
    label: str
    instruction: str


@dataclass(frozen=True)
class QueryResult:
    text: str
    latency_ms: float
    first_token_latency_ms: Optional[float]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]


PRESET_PROMPTS: List[PresetPrompt] = [
    PresetPrompt(
        id="fact_check",
        label="Fact check (no browsing)",
        instruction="Identify claims that may be wrong; explain uncertainty; suggest what to verify.",
    ),
    PresetPrompt(
        id="answer_question",
        label="Answer the question",
        instruction="Answer clearly and concisely.",
    ),
    PresetPrompt(
        id="write_js",
        label="Write JavaScript code",
        instruction="Write JavaScript code to satisfy the request; include edge cases.",
    ),
    PresetPrompt(
        id="action_items",
        label="Extract action items",
        instruction="List action items with any owners/dates mentioned.",
    ),
]


def preset_by_id(preset_id: str) -> Optional[PresetPrompt]:
    for preset in PRESET_PROMPTS:
        if preset.id == preset_id:
            return preset
    return None


class OpenAIClient:
    def __init__(self, api_key: str, model: str, timeout_seconds: float = 30.0) -> None:
        self.api_key = api_key
        self.default_model = model
        self._client = httpx.AsyncClient(
            base_url="https://api.openai.com/v1",
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def run_query(
        self,
        instruction: str,
        selected_text: str,
        context_text: str,
        model: Optional[str] = None,
        screenshot_data_url: Optional[str] = None,
        stream: bool = False,
        on_stream_delta: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> QueryResult:
        prompt = self._build_prompt(selected_text, context_text)
        if screenshot_data_url:
            input_payload = [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": screenshot_data_url},
                    ],
                }
            ]
        else:
            input_payload = prompt
        payload = {
            "model": model or self.default_model,
            "instructions": instruction,
            "input": input_payload,
        }
        if stream:
            payload["stream"] = True
            data, first_token_latency_ms = await self._run_streaming(payload, on_stream_delta=on_stream_delta)
        else:
            data = await self._run_non_streaming(payload)
            first_token_latency_ms = None
        latency_ms = float(data.get("_latency_ms", 0.0))
        usage = extract_usage(data)
        return QueryResult(
            text=extract_output_text(data) or "(No response text returned.)",
            latency_ms=latency_ms,
            first_token_latency_ms=first_token_latency_ms,
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            total_tokens=usage.get("total_tokens"),
        )

    async def _run_non_streaming(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        started = perf_counter()
        response = await self._client.post("/responses", json=payload)
        latency_ms = (perf_counter() - started) * 1000.0
        response.raise_for_status()
        data = response.json()
        data["_latency_ms"] = latency_ms
        return data

    async def _run_streaming(
        self,
        payload: Dict[str, Any],
        on_stream_delta: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> tuple[Dict[str, Any], Optional[float]]:
        started = perf_counter()
        first_token_latency_ms: Optional[float] = None
        final_response: Dict[str, Any] = {}
        output_chunks: List[str] = []
        latest_usage: Dict[str, Any] = {}
        saw_delta = False

        async with self._client.stream("POST", "/responses", json=payload) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                if not raw_line:
                    continue
                line = raw_line.strip()
                if not line.startswith("data:"):
                    continue
                data_line = line[5:].strip()
                if not data_line or data_line == "[DONE]":
                    continue
                try:
                    event = json.loads(data_line)
                except json.JSONDecodeError:
                    continue
                event_type = str(event.get("type") or "")
                if event_type == "response.output_text.delta":
                    if first_token_latency_ms is None:
                        first_token_latency_ms = (perf_counter() - started) * 1000.0
                    delta = event.get("delta")
                    if isinstance(delta, str) and delta:
                        saw_delta = True
                        output_chunks.append(delta)
                        await _maybe_await(on_stream_delta, delta)
                elif event_type == "response.output_text.done":
                    if first_token_latency_ms is None:
                        first_token_latency_ms = (perf_counter() - started) * 1000.0
                    text = event.get("text")
                    if isinstance(text, str) and text and not saw_delta:
                        output_chunks.append(text)
                        await _maybe_await(on_stream_delta, text)
                elif event_type == "response.completed":
                    response_obj = event.get("response")
                    if isinstance(response_obj, dict):
                        final_response = response_obj
                usage = event.get("usage")
                if isinstance(usage, dict):
                    latest_usage = usage

        latency_ms = (perf_counter() - started) * 1000.0
        if final_response:
            data = dict(final_response)
        else:
            data = {}
        if "output_text" not in data and output_chunks:
            data["output_text"] = "".join(output_chunks).strip()
        if "usage" not in data and latest_usage:
            data["usage"] = latest_usage
        data["_latency_ms"] = latency_ms
        return data, first_token_latency_ms

    async def list_models(self) -> List[str]:
        response = await self._client.get("/models")
        response.raise_for_status()
        data = response.json()
        items = data.get("data", [])
        ids = [item.get("id", "") for item in items if isinstance(item, dict)]
        models = sorted(model_id for model_id in ids if model_id)
        return models

    async def list_model_details(self) -> List[Dict[str, Any]]:
        response = await self._client.get("/models")
        response.raise_for_status()
        data = response.json()
        items = data.get("data", [])
        details: List[Dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id")
            if not model_id:
                continue
            details.append(
                {
                    "id": str(model_id),
                    "object": str(item.get("object", "model")),
                    "created": item.get("created"),
                    "owned_by": str(item.get("owned_by", "")),
                }
            )
        details.sort(key=lambda row: row["id"])
        return details

    @staticmethod
    def _build_prompt(selected_text: str, context_text: str) -> str:
        sections = ["Selected text:\n" + selected_text.strip()]
        if context_text:
            sections.append("Context:\n" + context_text.strip())
        return "\n\n".join(sections).strip()


def extract_output_text(data: Dict) -> str:
    if "output_text" in data and data["output_text"]:
        return str(data["output_text"]).strip()
    output = data.get("output", [])
    parts: List[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") in {"output_text", "text"}:
                    text = content.get("text", "")
                    if text:
                        parts.append(text)
        elif item.get("type") in {"output_text", "text"}:
            text = item.get("text", "")
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def extract_usage(data: Dict[str, Any]) -> Dict[str, Optional[int]]:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return {"input_tokens": None, "output_tokens": None, "total_tokens": None}
    input_tokens = _safe_int(usage.get("input_tokens"))
    output_tokens = _safe_int(usage.get("output_tokens"))
    total_tokens = _safe_int(usage.get("total_tokens"))
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


async def _maybe_await(
    callback: Optional[Callable[[str], Awaitable[None] | None]],
    delta: str,
) -> None:
    if not callback:
        return
    result = callback(delta)
    if inspect.isawaitable(result):
        await result

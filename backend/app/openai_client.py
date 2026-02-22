from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any, Dict, List, Optional

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
        started = perf_counter()
        response = await self._client.post("/responses", json=payload)
        latency_ms = (perf_counter() - started) * 1000.0
        response.raise_for_status()
        data = response.json()
        return QueryResult(
            text=extract_output_text(data) or "(No response text returned.)",
            latency_ms=latency_ms,
        )

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

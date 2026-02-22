from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _default_compute_type() -> str:
    configured_device = os.getenv("STT_DEVICE", "cuda").strip().lower()
    return "float16" if configured_device == "cuda" else "int8"


@dataclass(frozen=True)
class Settings:
    ws_host: str = os.getenv("WS_HOST", "127.0.0.1")
    ws_port: int = int(os.getenv("WS_PORT", "8765"))
    audio_source: str | None = os.getenv("AUDIO_SOURCE")

    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("CHANNELS", "1"))
    chunk_bytes: int = int(os.getenv("CHUNK_BYTES", "1600"))

    stt_model: str = os.getenv("STT_MODEL", "tiny")
    stt_device: str = os.getenv("STT_DEVICE", "cuda")
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", _default_compute_type())
    stt_vad_filter: bool = _env_bool("STT_VAD_FILTER", False)

    partial_window_seconds: float = float(os.getenv("STT_PARTIAL_WINDOW", "2.0"))
    partial_interval_seconds: float = float(os.getenv("STT_PARTIAL_INTERVAL", "0.25"))
    final_window_seconds: float = float(os.getenv("STT_FINAL_WINDOW", "6.0"))
    final_interval_seconds: float = float(os.getenv("STT_FINAL_INTERVAL", "1.2"))
    final_lag_seconds: float = float(os.getenv("STT_FINAL_LAG", "0.35"))

    context_before_seconds: float = float(os.getenv("CONTEXT_BEFORE", "30"))
    context_after_seconds: float = float(os.getenv("CONTEXT_AFTER", "15"))

    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    openai_timeout_seconds: float = float(os.getenv("OPENAI_TIMEOUT", "30"))

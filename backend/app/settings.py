from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    ws_host: str = os.getenv("WS_HOST", "127.0.0.1")
    ws_port: int = int(os.getenv("WS_PORT", "8765"))

    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("CHANNELS", "1"))
    chunk_bytes: int = int(os.getenv("CHUNK_BYTES", "3200"))

    stt_model: str = os.getenv("STT_MODEL", "base")
    stt_device: str = os.getenv("STT_DEVICE", "cpu")
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", "int8")

    partial_window_seconds: float = float(os.getenv("STT_PARTIAL_WINDOW", "5"))
    partial_interval_seconds: float = float(os.getenv("STT_PARTIAL_INTERVAL", "0.5"))
    final_window_seconds: float = float(os.getenv("STT_FINAL_WINDOW", "10"))
    final_interval_seconds: float = float(os.getenv("STT_FINAL_INTERVAL", "3"))
    final_lag_seconds: float = float(os.getenv("STT_FINAL_LAG", "0.6"))

    context_before_seconds: float = float(os.getenv("CONTEXT_BEFORE", "30"))
    context_after_seconds: float = float(os.getenv("CONTEXT_AFTER", "15"))

    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    openai_timeout_seconds: float = float(os.getenv("OPENAI_TIMEOUT", "30"))

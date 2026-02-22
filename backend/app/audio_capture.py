from __future__ import annotations

import asyncio
import shutil
import subprocess
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


@dataclass
class AudioSourceInfo:
    default_sink: Optional[str]
    default_monitor: Optional[str]
    preferred_monitor: Optional[str]
    monitor_sources: List[str]


def _run_command(command: List[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Command failed")
    return result.stdout


def get_default_sink() -> Optional[str]:
    try:
        output = _run_command(["pactl", "info"])
    except Exception:
        return None
    for line in output.splitlines():
        if line.strip().startswith("Default Sink:"):
            return line.split(":", 1)[1].strip() or None
    return None


def list_monitor_sources() -> List[str]:
    try:
        output = _run_command(["pactl", "list", "short", "sources"])
    except Exception:
        return []
    sources = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            name = parts[1]
            if ".monitor" in name:
                sources.append(name)
    return sources


def _list_sinks_by_index() -> Dict[str, str]:
    try:
        output = _run_command(["pactl", "list", "short", "sinks"])
    except Exception:
        return {}
    sinks: Dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            sinks[parts[0].strip()] = parts[1].strip()
    return sinks


def _extract_prop_value(line: str) -> Optional[str]:
    if "=" not in line:
        return None
    _, value = line.split("=", 1)
    value = value.strip().strip('"')
    return value or None


def get_active_browser_sink() -> Optional[str]:
    try:
        output = _run_command(["pactl", "list", "sink-inputs"])
    except Exception:
        return None

    sinks_by_index = _list_sinks_by_index()
    browser_hints = ("firefox", "chrome", "chromium", "brave", "edge", "youtube")

    current_sink: Optional[str] = None
    context_tokens: List[str] = []

    def pick_from_current() -> Optional[str]:
        if not current_sink:
            return None
        context = " ".join(context_tokens).lower()
        if any(hint in context for hint in browser_hints):
            return sinks_by_index.get(current_sink)
        return None

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if line.startswith("Sink Input #"):
            sink_name = pick_from_current()
            if sink_name:
                return sink_name
            current_sink = None
            context_tokens = []
            continue
        if line.startswith("Sink:"):
            current_sink = line.split(":", 1)[1].strip()
            continue
        if (
            "application.name" in line
            or "application.process.binary" in line
            or "media.name" in line
            or "media.title" in line
        ):
            value = _extract_prop_value(line)
            if value:
                context_tokens.append(value)

    return pick_from_current()


def discover_audio_sources() -> AudioSourceInfo:
    default_sink = get_default_sink()
    default_monitor = f"{default_sink}.monitor" if default_sink else None
    monitor_sources = list_monitor_sources()
    browser_sink = get_active_browser_sink()
    browser_monitor = f"{browser_sink}.monitor" if browser_sink else None
    preferred_monitor = browser_monitor if browser_monitor in monitor_sources else None
    if not preferred_monitor and default_monitor in monitor_sources:
        preferred_monitor = default_monitor
    if not preferred_monitor and monitor_sources:
        preferred_monitor = monitor_sources[0]
    return AudioSourceInfo(
        default_sink=default_sink,
        default_monitor=default_monitor,
        preferred_monitor=preferred_monitor,
        monitor_sources=monitor_sources,
    )


def _build_parec_command(source_name: Optional[str]) -> List[str]:
    cmd = [
        "parec",
        "--format=s16le",
        "--rate=16000",
        "--channels=1",
    ]
    if source_name:
        cmd.extend(["-d", source_name])
    return cmd


def _build_pwcat_command() -> List[str]:
    return ["pw-cat", "--record", "--rate", "16000", "--channels", "1", "--format", "s16le"]


def _candidate_commands(source_name: Optional[str]) -> Iterable[List[str]]:
    if shutil.which("parec"):
        yield _build_parec_command(source_name)
    if shutil.which("pw-cat"):
        yield _build_pwcat_command()


class AudioCapture:
    def __init__(self, source_name: Optional[str], chunk_bytes: int) -> None:
        self.source_name = source_name
        self.chunk_bytes = chunk_bytes
        self._process: Optional[asyncio.subprocess.Process] = None

    async def start(self) -> None:
        last_error: Optional[str] = None
        for cmd in _candidate_commands(self.source_name):
            try:
                self._process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.sleep(0.2)
                if self._process.returncode is not None:
                    stderr = await self._process.stderr.read()
                    last_error = stderr.decode().strip() or "Capture process exited"
                    continue
                return
            except FileNotFoundError as exc:
                last_error = str(exc)
            except Exception as exc:
                last_error = str(exc)
        raise RuntimeError(
            last_error
            or "No audio capture command available. Install 'parec' or 'pw-cat'."
        )

    async def stop(self) -> None:
        if not self._process:
            return
        self._process.terminate()
        try:
            await asyncio.wait_for(self._process.wait(), timeout=1.5)
        except asyncio.TimeoutError:
            self._process.kill()
            await self._process.wait()
        self._process = None

    async def stream(self):
        if not self._process or not self._process.stdout:
            raise RuntimeError("Audio capture not started")
        while True:
            chunk = await self._process.stdout.read(self.chunk_bytes)
            if not chunk:
                break
            yield chunk

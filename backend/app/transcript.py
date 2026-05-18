from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from .stt import Segment


@dataclass
class SelectionRange:
    start: float
    end: float


class TranscriptStore:
    def __init__(self) -> None:
        self._segments: List[Segment] = []

    @staticmethod
    def _normalized_text(text: str) -> str:
        words = re.findall(r"[a-z0-9']+", text.lower())
        return " ".join(words)

    @staticmethod
    def _word_count(normalized_text: str) -> int:
        if not normalized_text:
            return 0
        return len(normalized_text.split())

    def _is_recent_duplicate(self, segment: Segment, recent_seconds: float = 3.0) -> bool:
        normalized = self._normalized_text(segment.text)
        if not normalized:
            return False
        word_count = self._word_count(normalized)
        if word_count < 3:
            return False

        for previous in reversed(self._segments):
            if segment.t0 - previous.t1 > recent_seconds:
                break
            if previous.source_kind != segment.source_kind:
                continue
            previous_normalized = self._normalized_text(previous.text)
            if not previous_normalized:
                continue
            if normalized == previous_normalized:
                return True
            if (
                word_count >= 5
                and len(normalized) < len(previous_normalized)
                and normalized in previous_normalized
            ):
                return True
        return False

    def add_segment(self, segment: Segment) -> bool:
        if self._is_recent_duplicate(segment):
            return False
        self._segments.append(segment)
        return True

    def segments(self) -> List[Segment]:
        return list(self._segments)

    def build_context(
        self,
        selection_range: Optional[SelectionRange],
        before_seconds: float,
        after_seconds: float,
    ) -> str:
        if not self._segments:
            return ""
        if selection_range:
            start = max(0.0, selection_range.start - before_seconds)
            end = selection_range.end + after_seconds
        else:
            last_t1 = self._segments[-1].t1
            start = max(0.0, last_t1 - before_seconds)
            end = last_t1 + after_seconds
        context_segments = [
            seg.text for seg in self._segments if seg.t1 >= start and seg.t0 <= end
        ]
        return " ".join(context_segments).strip()

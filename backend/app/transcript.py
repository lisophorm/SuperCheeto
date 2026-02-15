from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from .stt import Segment


@dataclass
class SelectionRange:
    start: float
    end: float


class TranscriptStore:
    def __init__(self) -> None:
        self._segments: List[Segment] = []

    def add_segment(self, segment: Segment) -> None:
        self._segments.append(segment)

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

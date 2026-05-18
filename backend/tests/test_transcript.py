import unittest

from app.stt import Segment
from app.transcript import TranscriptStore


def segment(segment_id: int, t0: float, t1: float, text: str, source_kind: str = "system") -> Segment:
    return Segment(id=segment_id, t0=t0, t1=t1, text=text, source_kind=source_kind)


class TranscriptStoreTests(unittest.TestCase):
    def test_suppresses_recent_exact_duplicate_from_same_source(self) -> None:
        store = TranscriptStore()

        self.assertTrue(store.add_segment(segment(1, 1.0, 2.0, "How many child processes do they initiate?")))
        self.assertFalse(store.add_segment(segment(2, 2.4, 3.4, "How many child processes do they initiate?")))

        self.assertEqual([seg.text for seg in store.segments()], ["How many child processes do they initiate?"])

    def test_normalizes_case_punctuation_and_whitespace_for_duplicate_check(self) -> None:
        store = TranscriptStore()

        self.assertTrue(store.add_segment(segment(1, 1.0, 2.0, "It's the riddle?")))
        self.assertFalse(store.add_segment(segment(2, 2.2, 3.0, "  it's   the riddle ")))

        self.assertEqual(len(store.segments()), 1)

    def test_suppresses_recent_fragment_contained_in_longer_segment(self) -> None:
        store = TranscriptStore()

        self.assertTrue(
            store.add_segment(
                segment(
                    1,
                    1.0,
                    4.0,
                    "processes today initiate. What? Please make sure your solution runs in linear time.",
                )
            )
        )
        self.assertFalse(store.add_segment(segment(2, 4.4, 5.2, "Please make sure your solution runs in linear time.")))

        self.assertEqual(len(store.segments()), 1)

    def test_keeps_short_repeated_text(self) -> None:
        store = TranscriptStore()

        self.assertTrue(store.add_segment(segment(1, 1.0, 2.0, "What?")))
        self.assertTrue(store.add_segment(segment(2, 2.3, 3.0, "What?")))

        self.assertEqual(len(store.segments()), 2)

    def test_keeps_same_long_text_after_recent_window(self) -> None:
        store = TranscriptStore()

        self.assertTrue(store.add_segment(segment(1, 1.0, 2.0, "Please make sure your solution runs in linear time.")))
        self.assertTrue(store.add_segment(segment(2, 6.2, 7.0, "Please make sure your solution runs in linear time.")))

        self.assertEqual(len(store.segments()), 2)

    def test_keeps_same_text_from_different_source(self) -> None:
        store = TranscriptStore()

        self.assertTrue(store.add_segment(segment(1, 1.0, 2.0, "One child, right?", "system")))
        self.assertTrue(store.add_segment(segment(2, 2.1, 3.0, "One child, right?", "mic")))

        self.assertEqual(len(store.segments()), 2)


if __name__ == "__main__":
    unittest.main()

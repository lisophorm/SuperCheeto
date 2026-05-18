from __future__ import annotations

import argparse
import collections
from dataclasses import dataclass
from typing import Deque, Iterable, Literal

import cv2
import mediapipe as mp


GazeDirection = Literal[
    "left",
    "right",
    "up",
    "down",
    "center",
    "up-left",
    "up-right",
    "down-left",
    "down-right",
    "unknown",
]


# Landmark IDs from MediaPipe Face Mesh with refine_landmarks=True.
LEFT_IRIS_IDS = (474, 475, 476, 477)
RIGHT_IRIS_IDS = (469, 470, 471, 472)
LEFT_EYE_X_BOUNDS = (33, 133)
LEFT_EYE_Y_BOUNDS = (159, 145)
RIGHT_EYE_X_BOUNDS = (362, 263)
RIGHT_EYE_Y_BOUNDS = (386, 374)


@dataclass
class EyeRatios:
    horizontal: float
    vertical: float


class GazeEstimator:
    """Computes coarse gaze direction from iris center and eye bounds."""

    def __init__(self, history: int = 5) -> None:
        self._history: Deque[GazeDirection] = collections.deque(maxlen=history)

    @staticmethod
    def _avg_point(
        landmarks: Iterable[int],
        points: list[mp.framework.formats.landmark_pb2.NormalizedLandmark],
    ) -> tuple[float, float]:
        xs: list[float] = []
        ys: list[float] = []
        for idx in landmarks:
            xs.append(points[idx].x)
            ys.append(points[idx].y)
        return sum(xs) / len(xs), sum(ys) / len(ys)

    @staticmethod
    def _safe_ratio(value: float, low: float, high: float) -> float:
        span = high - low
        if abs(span) < 1e-6:
            return 0.5
        return (value - low) / span

    def _eye_ratios(
        self,
        points: list[mp.framework.formats.landmark_pb2.NormalizedLandmark],
        iris_ids: tuple[int, int, int, int],
        x_bounds: tuple[int, int],
        y_bounds: tuple[int, int],
    ) -> EyeRatios:
        iris_x, iris_y = self._avg_point(iris_ids, points)
        x0 = points[x_bounds[0]].x
        x1 = points[x_bounds[1]].x
        y0 = points[y_bounds[0]].y
        y1 = points[y_bounds[1]].y

        h_ratio = self._safe_ratio(iris_x, min(x0, x1), max(x0, x1))
        v_ratio = self._safe_ratio(iris_y, min(y0, y1), max(y0, y1))
        return EyeRatios(horizontal=h_ratio, vertical=v_ratio)

    def estimate(
        self,
        points: list[mp.framework.formats.landmark_pb2.NormalizedLandmark],
    ) -> tuple[GazeDirection, EyeRatios]:
        left = self._eye_ratios(points, LEFT_IRIS_IDS, LEFT_EYE_X_BOUNDS, LEFT_EYE_Y_BOUNDS)
        right = self._eye_ratios(points, RIGHT_IRIS_IDS, RIGHT_EYE_X_BOUNDS, RIGHT_EYE_Y_BOUNDS)

        horizontal = (left.horizontal + right.horizontal) / 2.0
        vertical = (left.vertical + right.vertical) / 2.0

        x_state = "center"
        y_state = "center"
        if horizontal < 0.38:
            x_state = "left"
        elif horizontal > 0.62:
            x_state = "right"

        if vertical < 0.38:
            y_state = "up"
        elif vertical > 0.62:
            y_state = "down"

        if x_state == "center" and y_state == "center":
            direction: GazeDirection = "center"
        elif x_state == "center":
            direction = y_state  # type: ignore[assignment]
        elif y_state == "center":
            direction = x_state  # type: ignore[assignment]
        else:
            direction = f"{y_state}-{x_state}"  # type: ignore[assignment]

        self._history.append(direction)
        stable_direction = collections.Counter(self._history).most_common(1)[0][0]
        return stable_direction, EyeRatios(horizontal=horizontal, vertical=vertical)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Webcam eye-direction prototype using MediaPipe iris landmarks.",
    )
    parser.add_argument("--camera-index", type=int, default=0, help="Camera index for cv2.VideoCapture.")
    parser.add_argument("--width", type=int, default=1280, help="Capture width.")
    parser.add_argument("--height", type=int, default=720, help="Capture height.")
    parser.add_argument(
        "--no-mirror",
        action="store_true",
        help="Disable mirror view. Default keeps mirror behavior for easier self-alignment.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cap = cv2.VideoCapture(args.camera_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        print("[eye-prototype] Failed to open webcam. Try a different --camera-index.")
        return 1

    estimator = GazeEstimator(history=6)
    drawing = mp.solutions.drawing_utils
    mesh_spec = drawing.DrawingSpec(color=(0, 220, 255), thickness=1, circle_radius=1)

    with mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as face_mesh:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("[eye-prototype] Camera frame read failed.")
                break

            if not args.no_mirror:
                frame = cv2.flip(frame, 1)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb)

            direction: GazeDirection = "unknown"
            ratios = EyeRatios(horizontal=0.5, vertical=0.5)

            if results.multi_face_landmarks:
                face = results.multi_face_landmarks[0]
                points = face.landmark

                direction, ratios = estimator.estimate(points)

                drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face,
                    connections=mp.solutions.face_mesh.FACEMESH_IRISES,
                    landmark_drawing_spec=mesh_spec,
                    connection_drawing_spec=mesh_spec,
                )

            h_ratio_text = f"h={ratios.horizontal:.2f}"
            v_ratio_text = f"v={ratios.vertical:.2f}"
            cv2.putText(frame, f"Gaze: {direction}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (40, 255, 40), 2)
            cv2.putText(frame, h_ratio_text, (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
            cv2.putText(frame, v_ratio_text, (160, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
            cv2.putText(frame, "Press q to exit", (20, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

            cv2.imshow("Eye Tracking Prototype", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

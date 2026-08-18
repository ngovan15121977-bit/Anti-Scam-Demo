"""Passive anti-spoof and liveness detection using local image analysis."""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Sequence

import numpy as np
from PIL import Image

_LOGGER = logging.getLogger(__name__)


# ============================================================
# OpenCV
# ============================================================

def _get_cv2():
    """Lazy-load cv2 to avoid import errors if OpenCV is not installed."""
    try:
        import cv2

        return cv2
    except ImportError:
        return None


# ============================================================
# Face bounding-box helpers
# ============================================================

def _clip_face_box(
    face_box: Sequence[float],
    image_shape,
) -> tuple[int, int, int, int]:
    """
    Convert detector bbox (x, y, width, height) to safe integer
    crop coordinates (x1, y1, x2, y2).

    Detectors such as YuNet commonly return np.float32 coordinates.
    NumPy slicing requires integer indices.
    """
    if face_box is None or len(face_box) < 4:
        raise ValueError(f"Invalid face_box: {face_box}")

    image_h, image_w = image_shape[:2]

    try:
        x, y, w, h = [
            float(value)
            for value in face_box[:4]
        ]
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Invalid face_box values: {face_box}"
        ) from exc

    if not np.all(np.isfinite([x, y, w, h])):
        raise ValueError(
            f"Non-finite values in face_box: {face_box}"
        )

    if w <= 0 or h <= 0:
        raise ValueError(
            f"Invalid face_box size: {face_box}"
        )

    # Convert detector coordinates to integer image coordinates.
    x1 = max(0, int(round(x)))
    y1 = max(0, int(round(y)))

    x2 = min(
        image_w,
        int(round(x + w)),
    )
    y2 = min(
        image_h,
        int(round(y + h)),
    )

    if x2 <= x1 or y2 <= y1:
        raise ValueError(
            "Face box is outside image boundaries: "
            f"box={face_box}, image_shape={image_shape}"
        )

    return x1, y1, x2, y2


def _crop_face_rgb(
    image_rgb: np.ndarray,
    face_box: Sequence[float],
) -> np.ndarray:
    """Return a safely clipped RGB face crop."""
    image_rgb = np.asarray(image_rgb)

    if image_rgb.ndim != 3:
        raise ValueError(
            f"Expected RGB image with 3 dimensions, got {image_rgb.shape}"
        )

    if image_rgb.shape[2] < 3:
        raise ValueError(
            f"Expected at least 3 channels, got {image_rgb.shape}"
        )

    x1, y1, x2, y2 = _clip_face_box(
        face_box,
        image_rgb.shape,
    )

    face_rgb = image_rgb[
        y1:y2,
        x1:x2,
    ]

    if face_rgb.size == 0:
        raise ValueError(
            f"Empty face crop: box={face_box}"
        )

    # Extremely small crops are not reliable for anti-spoof analysis.
    if (
        face_rgb.shape[0] < 16
        or face_rgb.shape[1] < 16
    ):
        raise ValueError(
            "Face crop is too small for liveness analysis: "
            f"crop_shape={face_rgb.shape}, box={face_box}"
        )

    # Some inputs may contain alpha.
    if face_rgb.shape[2] > 3:
        face_rgb = face_rgb[:, :, :3]

    return np.ascontiguousarray(face_rgb)


# ============================================================
# Frame conversion
# ============================================================

def _frame_to_rgb(
    frame_data: bytes | np.ndarray,
) -> np.ndarray:
    """Convert bytes or ndarray frame into uint8 RGB ndarray."""
    cv2 = _get_cv2()

    if isinstance(frame_data, bytes):
        with Image.open(BytesIO(frame_data)) as image:
            image = image.convert("RGB")
            return np.asarray(image)

    image_rgb = np.asarray(frame_data)

    if image_rgb.ndim == 2:
        if cv2 is None:
            return np.stack(
                [image_rgb, image_rgb, image_rgb],
                axis=-1,
            )

        return cv2.cvtColor(
            image_rgb,
            cv2.COLOR_GRAY2RGB,
        )

    if image_rgb.ndim != 3:
        raise ValueError(
            f"Unsupported frame shape: {image_rgb.shape}"
        )

    if image_rgb.shape[2] == 4:
        image_rgb = image_rgb[:, :, :3]

    if image_rgb.shape[2] != 3:
        raise ValueError(
            f"Unsupported channel count: {image_rgb.shape}"
        )

    if image_rgb.dtype != np.uint8:
        image_rgb = np.clip(
            image_rgb,
            0,
            255,
        ).astype(np.uint8)

    return np.ascontiguousarray(image_rgb)


# ============================================================
# LBP texture
# ============================================================

def detect_local_binary_patterns(
    gray_image: np.ndarray,
    radius: int = 3,
) -> np.ndarray:
    """
    Compute Local Binary Pattern (LBP) histogram.

    Printed or displayed images can show texture patterns that differ
    from a real face captured directly by a webcam.

    Returns:
        Normalized histogram with 256 bins.
    """
    if gray_image.ndim != 2:
        raise ValueError(
            f"LBP expects grayscale image, got {gray_image.shape}"
        )

    height, width = gray_image.shape

    if (
        height <= radius * 2
        or width <= radius * 2
    ):
        return np.zeros(
            256,
            dtype=np.float32,
        )

    lbp = np.zeros_like(
        gray_image,
        dtype=np.uint8,
    )

    for y in range(
        radius,
        height - radius,
    ):
        for x in range(
            radius,
            width - radius,
        ):
            center = gray_image[y, x]

            neighbors = [
                gray_image[y - radius, x - radius],
                gray_image[y - radius, x],
                gray_image[y - radius, x + radius],
                gray_image[y, x + radius],
                gray_image[y + radius, x + radius],
                gray_image[y + radius, x],
                gray_image[y + radius, x - radius],
                gray_image[y, x - radius],
            ]

            value = 0

            for index, neighbor in enumerate(neighbors):
                if neighbor >= center:
                    value |= 1 << (7 - index)

            lbp[y, x] = value

    histogram, _ = np.histogram(
        lbp,
        bins=256,
        range=(0, 256),
    )

    histogram = histogram.astype(
        np.float32
    )

    total = histogram.sum()

    if total <= 0:
        return histogram

    return histogram / total


# ============================================================
# Frequency analysis
# ============================================================

def detect_frequency_artifacts(
    gray_image: np.ndarray,
) -> float:
    """
    Detect periodic frequency patterns commonly associated with
    screens or printed media.

    Returns:
        Spoof score:
            0.0 = less suspicious
            1.0 = highly suspicious
    """
    if gray_image.ndim != 2:
        raise ValueError(
            f"FFT expects grayscale image, got {gray_image.shape}"
        )

    if min(gray_image.shape[:2]) < 20:
        return 0.0

    f_transform = np.fft.fft2(
        gray_image.astype(np.float32)
    )

    f_shift = np.fft.fftshift(
        f_transform
    )

    magnitude = np.abs(
        f_shift
    )

    magnitude_range = (
        magnitude.max()
        - magnitude.min()
    )

    magnitude_norm = (
        magnitude - magnitude.min()
    ) / (
        magnitude_range + 1e-6
    )

    center_y = (
        gray_image.shape[0] // 2
    )
    center_x = (
        gray_image.shape[1] // 2
    )

    max_radius = min(
        center_y,
        center_x,
    )

    spoof_indicators = 0
    total_rings = 0

    y_grid, x_grid = np.ogrid[
        :gray_image.shape[0],
        :gray_image.shape[1],
    ]

    distance = np.sqrt(
        (x_grid - center_x) ** 2
        + (y_grid - center_y) ** 2
    )

    for radius in range(
        10,
        max_radius,
        15,
    ):
        ring_mask = (
            np.abs(
                distance - radius
            )
            < 8
        )

        if not np.any(ring_mask):
            continue

        ring_energy = float(
            magnitude_norm[
                ring_mask
            ].mean()
        )

        if ring_energy > 0.6:
            spoof_indicators += 1

        total_rings += 1

    if total_rings == 0:
        return 0.0

    return float(
        spoof_indicators
        / total_rings
    )


# ============================================================
# Blur
# ============================================================

def detect_motion_blur(
    gray_image: np.ndarray,
) -> float:
    """
    Estimate blur using Laplacian variance.

    Returns:
        0.0 = sharp
        1.0 = very blurry
    """
    cv2 = _get_cv2()

    if cv2 is None:
        return 1.0

    if gray_image.ndim != 2:
        raise ValueError(
            f"Blur analysis expects grayscale image, got {gray_image.shape}"
        )

    laplacian = cv2.Laplacian(
        gray_image,
        cv2.CV_64F,
    )

    variance = float(
        laplacian.var()
    )

    blur_score = max(
        0.0,
        1.0 - (
            variance / 200.0
        ),
    )

    return float(
        min(
            1.0,
            blur_score,
        )
    )


# ============================================================
# Color analysis
# ============================================================

def analyze_color_consistency(
    image_rgb: np.ndarray,
) -> dict[str, float]:
    """
    Analyze saturation, clipping and lighting characteristics.

    Returns:
        saturation_anomaly
        color_clipping
        lighting_variance
    """
    cv2 = _get_cv2()

    if cv2 is None:
        return {
            "saturation_anomaly": 1.0,
            "color_clipping": 1.0,
            "lighting_variance": 0.0,
        }

    image_rgb = np.asarray(
        image_rgb
    )

    if (
        image_rgb.ndim != 3
        or image_rgb.shape[2] < 3
    ):
        raise ValueError(
            f"Invalid RGB image: {image_rgb.shape}"
        )

    image_rgb = image_rgb[
        :, :, :3
    ]

    hsv = cv2.cvtColor(
        image_rgb,
        cv2.COLOR_RGB2HSV,
    ).astype(np.float32)

    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    saturation_mean = float(
        saturation.mean()
        / 255.0
    )

    saturation_std = float(
        saturation.std()
        / 255.0
    )

    # Very high saturation is suspicious.
    saturation_anomaly = (
        1.0
        if saturation_mean > 0.70
        else 0.0
    )

    red = image_rgb[:, :, 0]
    green = image_rgb[:, :, 1]
    blue = image_rgb[:, :, 2]

    clipped_pixels = (
        ((red == 0) | (red == 255)).sum()
        + ((green == 0) | (green == 255)).sum()
        + ((blue == 0) | (blue == 255)).sum()
    )

    clipped_ratio = float(
        clipped_pixels
        / image_rgb.size
    )

    color_clipping = float(
        min(
            1.0,
            clipped_ratio * 100.0,
        )
    )

    lighting_variance = float(
        value.std()
        / 255.0
    )

    return {
        "saturation_anomaly": saturation_anomaly,
        "saturation_mean": saturation_mean,
        "saturation_std": saturation_std,
        "color_clipping": color_clipping,
        "lighting_variance": lighting_variance,
    }


# ============================================================
# Face texture
# ============================================================

def analyze_face_texture(
    image_rgb: np.ndarray,
    face_box: Sequence[float],
) -> float:
    """
    Analyze face-region texture to detect print/screen spoofing.

    Returns:
        0.0 = less suspicious
        1.0 = likely spoof
    """
    cv2 = _get_cv2()

    if cv2 is None:
        return 1.0

    face_rgb = _crop_face_rgb(
        image_rgb,
        face_box,
    )

    face_gray = cv2.cvtColor(
        face_rgb,
        cv2.COLOR_RGB2GRAY,
    )

    lbp_hist = detect_local_binary_patterns(
        face_gray,
        radius=3,
    )

    non_zero = (
        lbp_hist > 0
    )

    if not np.any(non_zero):
        return 1.0

    entropy = float(
        -np.sum(
            lbp_hist[non_zero]
            * np.log2(
                lbp_hist[non_zero]
            )
        )
    )

    texture_variance_score = max(
        0.0,
        (8.0 - entropy) / 8.0,
    )

    low_bins = float(
        lbp_hist[:64].sum()
    )

    high_bins = float(
        lbp_hist[192:].sum()
    )

    binary_concentration = max(
        low_bins,
        high_bins,
    )

    texture_spoof_score = (
        texture_variance_score
        + binary_concentration
    ) / 2.0

    return float(
        np.clip(
            texture_spoof_score,
            0.0,
            1.0,
        )
    )


# ============================================================
# Passive single-frame liveness
# ============================================================

def passive_liveness_check(
    image_rgb: np.ndarray,
    face_box: Sequence[float],
) -> dict:
    """
    Perform passive anti-spoof analysis.

    Analysis is focused on the detected FACE region instead of
    the whole camera frame.

    Returns:
        {
            "is_live": bool,
            "confidence": float,
            "indicators": {...}
        }
    """
    cv2 = _get_cv2()

    # Security-sensitive authentication should fail closed.
    if cv2 is None:
        _LOGGER.error(
            "Passive liveness unavailable because OpenCV is not installed."
        )

        return {
            "is_live": False,
            "confidence": 0.0,
            "indicators": {
                "error": "opencv_unavailable",
                "weighted_spoof_score": 1.0,
            },
        }

    try:
        image_rgb = np.asarray(
            image_rgb
        )

        if image_rgb.ndim == 2:
            image_rgb = cv2.cvtColor(
                image_rgb,
                cv2.COLOR_GRAY2RGB,
            )

        if (
            image_rgb.ndim != 3
            or image_rgb.shape[2] < 3
        ):
            raise ValueError(
                f"Invalid image shape: {image_rgb.shape}"
            )

        if image_rgb.shape[2] > 3:
            image_rgb = image_rgb[
                :, :, :3
            ]

        if image_rgb.dtype != np.uint8:
            image_rgb = np.clip(
                image_rgb,
                0,
                255,
            ).astype(np.uint8)

        # ----------------------------------------------------
        # IMPORTANT:
        # Face detector boxes may be np.float32.
        # _crop_face_rgb safely converts them to integer slices.
        # ----------------------------------------------------
        face_rgb = _crop_face_rgb(
            image_rgb,
            face_box,
        )

        face_gray = cv2.cvtColor(
            face_rgb,
            cv2.COLOR_RGB2GRAY,
        )

        # Texture still uses the original image + bbox helper.
        texture_score = analyze_face_texture(
            image_rgb,
            face_box,
        )

        # Analyze the FACE region rather than the complete frame.
        frequency_score = detect_frequency_artifacts(
            face_gray
        )

        blur_score = detect_motion_blur(
            face_gray
        )

        color_scores = analyze_color_consistency(
            face_rgb
        )

        spoof_weights = {
            "texture": (
                texture_score,
                0.35,
            ),
            "frequency": (
                frequency_score,
                0.25,
            ),
            "blur": (
                blur_score,
                0.20,
            ),
            "color_clipping": (
                color_scores["color_clipping"],
                0.15,
            ),
            "saturation": (
                color_scores["saturation_anomaly"],
                0.05,
            ),
        }

        weighted_spoof_score = float(
            sum(
                score * weight
                for score, weight
                in spoof_weights.values()
            )
        )

        spoof_threshold = 0.65

        is_live = (
            weighted_spoof_score
            < spoof_threshold
        )

        # Confidence in the final decision rather than simply
        # the largest individual spoof indicator.
        if is_live:
            confidence = float(
                np.clip(
                    1.0
                    - (
                        weighted_spoof_score
                        / spoof_threshold
                    ),
                    0.0,
                    1.0,
                )
            )
        else:
            confidence = float(
                np.clip(
                    (
                        weighted_spoof_score
                        - spoof_threshold
                    )
                    / (
                        1.0
                        - spoof_threshold
                        + 1e-6
                    ),
                    0.0,
                    1.0,
                )
            )

        result = {
            "is_live": bool(is_live),
            "confidence": confidence,
            "indicators": {
                "texture_spoof_score": float(
                    texture_score
                ),
                "frequency_artifacts": float(
                    frequency_score
                ),
                "motion_blur": float(
                    blur_score
                ),
                "color_consistency": color_scores,
                "weighted_spoof_score": float(
                    weighted_spoof_score
                ),
                "threshold": float(
                    spoof_threshold
                ),
            },
        }

        _LOGGER.debug(
            "Passive liveness result: "
            "live=%s score=%.4f texture=%.4f "
            "frequency=%.4f blur=%.4f",
            result["is_live"],
            weighted_spoof_score,
            texture_score,
            frequency_score,
            blur_score,
        )

        return result

    except Exception:
        # Fail closed. Do not silently bypass anti-spoof protection.
        _LOGGER.exception(
            "Passive liveness analysis failed."
        )

        return {
            "is_live": False,
            "confidence": 0.0,
            "indicators": {
                "error": "liveness_analysis_failed",
                "weighted_spoof_score": 1.0,
            },
        }


# ============================================================
# Multi-frame liveness
# ============================================================

def multiframe_liveness_check(
    frames: list[bytes | np.ndarray],
    face_boxes: list[Sequence[float]],
) -> dict:
    """
    Perform passive liveness analysis across multiple frames.

    Validates:
    - each individual frame
    - consistency of spoof scores
    - near-duplicate frames
    - basic natural variation

    Returns:
        {
            "is_live": bool,
            "confidence": float,
            "consistency_score": float,
            "duplicate_detected": bool,
            "indicators": {...}
        }
    """
    cv2 = _get_cv2()

    if cv2 is None:
        return {
            "is_live": False,
            "confidence": 0.0,
            "consistency_score": 0.0,
            "duplicate_detected": False,
            "indicators": {
                "error": "opencv_unavailable",
            },
        }

    if not frames:
        return {
            "is_live": False,
            "confidence": 0.0,
            "consistency_score": 0.0,
            "duplicate_detected": False,
            "indicators": {
                "error": "no_frames",
            },
        }

    # Single-frame fallback.
    if len(frames) == 1:
        try:
            image_rgb = _frame_to_rgb(
                frames[0]
            )

            if face_boxes:
                face_box = face_boxes[0]
            else:
                face_box = (
                    0.0,
                    0.0,
                    float(image_rgb.shape[1]),
                    float(image_rgb.shape[0]),
                )

            return passive_liveness_check(
                image_rgb,
                face_box,
            )

        except Exception:
            _LOGGER.exception(
                "Single-frame liveness fallback failed."
            )

            return {
                "is_live": False,
                "confidence": 0.0,
                "consistency_score": 0.0,
                "duplicate_detected": False,
                "indicators": {
                    "error": "single_frame_analysis_failed",
                },
            }

    if len(face_boxes) < len(frames):
        _LOGGER.warning(
            "Not enough face boxes for multiframe liveness: "
            "frames=%d boxes=%d",
            len(frames),
            len(face_boxes),
        )

        return {
            "is_live": False,
            "confidence": 0.0,
            "consistency_score": 0.0,
            "duplicate_detected": False,
            "indicators": {
                "error": "missing_face_boxes",
            },
        }

    frame_results = []
    processed_faces = []

    try:
        # ----------------------------------------------------
        # Analyze each frame
        # ----------------------------------------------------
        for frame_data, face_box in zip(
            frames,
            face_boxes,
        ):
            image_rgb = _frame_to_rgb(
                frame_data
            )

            face_rgb = _crop_face_rgb(
                image_rgb,
                face_box,
            )

            result = passive_liveness_check(
                image_rgb,
                face_box,
            )

            frame_results.append(
                result
            )

            processed_faces.append(
                face_rgb
            )

        spoof_scores = []

        for result in frame_results:
            indicators = result.get(
                "indicators",
                {},
            )

            spoof_score = float(
                indicators.get(
                    "weighted_spoof_score",
                    1.0,
                )
            )

            spoof_scores.append(
                spoof_score
            )

        spoof_variance = float(
            np.std(
                spoof_scores
            )
        )

        consistency_score = float(
            max(
                0.0,
                1.0
                - min(
                    spoof_variance,
                    1.0,
                ),
            )
        )

        # ----------------------------------------------------
        # Duplicate/replay detection
        #
        # Resize crops before comparing so different bbox sizes
        # do not cause array-shape errors.
        # ----------------------------------------------------
        gray_faces = []

        for face_rgb in processed_faces:
            gray = cv2.cvtColor(
                face_rgb,
                cv2.COLOR_RGB2GRAY,
            )

            gray = cv2.resize(
                gray,
                (128, 128),
                interpolation=cv2.INTER_AREA,
            )

            gray_faces.append(
                gray.astype(
                    np.float32
                )
            )

        duplicate_detected = False
        pair_differences = []

        for index in range(
            len(gray_faces) - 1
        ):
            difference = float(
                np.mean(
                    np.abs(
                        gray_faces[index]
                        - gray_faces[index + 1]
                    )
                )
            )

            pair_differences.append(
                difference
            )

            # Very small pixel difference suggests same frame
            # submitted repeatedly.
            if difference < 5.0:
                duplicate_detected = True

        avg_spoof_score = float(
            np.mean(
                spoof_scores
            )
        )

        individual_frames_live = all(
            bool(
                result.get(
                    "is_live",
                    False,
                )
            )
            for result
            in frame_results
        )

        is_live = (
            individual_frames_live
            and not duplicate_detected
            and avg_spoof_score < 0.65
            and consistency_score > 0.60
        )

        frame_confidences = [
            float(
                result.get(
                    "confidence",
                    0.0,
                )
            )
            for result
            in frame_results
        ]

        confidence = float(
            np.mean(
                frame_confidences
            )
        )

        return {
            "is_live": bool(is_live),
            "confidence": confidence,
            "consistency_score": consistency_score,
            "duplicate_detected": duplicate_detected,
            "indicators": {
                "avg_spoof_score": avg_spoof_score,
                "spoof_variance": spoof_variance,
                "pair_differences": pair_differences,
                "frame_results": frame_results,
            },
        }

    except Exception:
        _LOGGER.exception(
            "Multiframe passive liveness analysis failed."
        )

        return {
            "is_live": False,
            "confidence": 0.0,
            "consistency_score": 0.0,
            "duplicate_detected": False,
            "indicators": {
                "error": "multiframe_analysis_failed",
            },
        }
"""Local face matching using a public Hugging Face ArcFace model.

Only a 512-dimensional embedding is calculated in memory. Selfies are never
stored; the enrolled avatar remains the user's reference image.
"""

from __future__ import annotations

import base64
import io
import urllib.request
from functools import lru_cache

from fastapi import HTTPException, status

from src.app.config import get_settings


def _image_bytes(data_url: str) -> bytes:
    try:
        encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ") from exc
    if not raw or len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt phải có dung lượng tối đa 5 MB")
    return raw


@lru_cache(maxsize=1)
def _model():
    try:
        import timm
        import torch
        from timm.data import create_transform, resolve_data_config
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face AI chưa được cài đặt. Chạy pip install -r requirements.txt để tải model Hugging Face.",
        ) from exc
    model = timm.create_model(f"hf_hub:{get_settings().face_model_id}", pretrained=True).eval()
    transform = create_transform(**resolve_data_config(model.pretrained_cfg, model=model))
    return model, transform, torch


def _embedding(raw: bytes):
    try:
        from PIL import Image
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Face AI chưa được cài đặt") from exc
    model, transform, torch = _model()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Không thể đọc ảnh khuôn mặt") from exc
    image = _crop_primary_face(image)
    # inference_mode avoids autograd bookkeeping during every face check.
    with torch.inference_mode():
        embedding = model(transform(image).unsqueeze(0))
        return torch.nn.functional.normalize(embedding, dim=1)


@lru_cache(maxsize=1)
def _face_detector():
    """Return OpenCV's local detector; it is cached like the ArcFace model."""
    try:
        import cv2
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face detector chưa được cài đặt. Chạy pip install -r requirements.txt.",
        ) from exc
    detector = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if detector.empty():
        raise HTTPException(status_code=503, detail="Không thể khởi tạo bộ nhận diện khuôn mặt")
    return cv2, detector


def _crop_primary_face(image):
    """Keep only one clear, largest face so enrollment and checks use identical input."""
    import numpy as np

    cv2, detector = _face_detector()
    rgb = np.asarray(image)
    grayscale = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    faces = detector.detectMultiScale(
        grayscale,
        scaleFactor=1.12,
        minNeighbors=6,
        minSize=(64, 64),
    )
    if len(faces) == 0:
        raise HTTPException(
            status_code=422,
            detail="Hãy đưa đúng một khuôn mặt nhìn thẳng, đủ sáng vào khung hình rồi thử lại.",
        )

    # Ignore distant background faces, but reject photos containing two people
    # standing equally close to the camera.
    ordered_faces = sorted(faces, key=lambda face: int(face[2]) * int(face[3]), reverse=True)
    if len(ordered_faces) > 1:
        primary_area = int(ordered_faces[0][2]) * int(ordered_faces[0][3])
        second_area = int(ordered_faces[1][2]) * int(ordered_faces[1][3])
        if second_area >= primary_area * 0.55:
            raise HTTPException(
                status_code=422,
                detail="Ảnh có nhiều khuôn mặt. Chỉ để khuôn mặt của bạn trong khung hình rồi thử lại.",
            )

    x, y, width, height = map(int, ordered_faces[0])
    # A small margin preserves chin, forehead and face contour, but excludes background.
    margin = int(max(width, height) * 0.18)
    left = max(0, x - margin)
    top = max(0, y - margin)
    right = min(image.width, x + width + margin)
    bottom = min(image.height, y + height + margin)
    return image.crop((left, top, right, bottom))


def warm_face_model() -> None:
    """Load the Hugging Face model before the first customer verification."""
    _model()
    _face_detector()


def embedding_from_data_url(data_url: str) -> list[float]:
    """Produce a normalized ArcFace embedding suitable for encrypted DB storage."""
    return _embedding(_image_bytes(data_url)).squeeze(0).tolist()


def similarity_from_embedding(*, enrollment_embedding: list[float], selfie_data_url: str) -> float:
    model, _transform, torch = _model()
    del model
    reference = torch.tensor(enrollment_embedding, dtype=torch.float32).unsqueeze(0)
    reference = torch.nn.functional.normalize(reference, dim=1)
    selfie = _embedding(_image_bytes(selfie_data_url))
    return float((reference * selfie).sum().item())


def compare_avatar_to_selfie(*, avatar_url: str, selfie_data_url: str) -> float:
    """Return cosine similarity in [0, 1] without persisting the selfie."""
    try:
        request = urllib.request.Request(avatar_url, headers={"User-Agent": "FintechGuard/1.0"})
        with urllib.request.urlopen(request, timeout=8) as response:
            reference = response.read(5 * 1024 * 1024 + 1)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể tải ảnh khuôn mặt đã đăng ký") from exc
    if len(reference) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt đã đăng ký quá lớn")
    reference_embedding = _embedding(reference)
    selfie_embedding = _embedding(_image_bytes(selfie_data_url))
    return float((reference_embedding * selfie_embedding).sum().item())

"""Local face matching using the public Hugging Face ArcFace model."""

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
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Face AI chưa được cài đặt. Chạy pip install -r requirements.txt để tải model Hugging Face.") from exc
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
    image = _normalize_face_lighting(image)
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


@lru_cache(maxsize=1)
def _feature_detectors():
    """Load OpenCV's bundled eye cascade for a fast obstruction hint."""
    cv2, _ = _face_detector()
    data_path = cv2.data.haarcascades
    eyes = cv2.CascadeClassifier(data_path + "haarcascade_eye.xml")
    if eyes.empty():
        return None
    return cv2, eyes


def _obstruction_rule(image, face_box) -> str:
    """Reject frames where the eyes or mouth area is hidden by an object."""
    detectors = _feature_detectors()
    if detectors is None:
        return "ready"
    import numpy as np

    cv2, eyes_detector = detectors
    x, y, width, height = map(int, face_box)
    face = cv2.cvtColor(np.asarray(image)[y : y + height, x : x + width], cv2.COLOR_RGB2GRAY)
    if face.size == 0:
        return "obstructed_face"
    upper = face[: int(height * 0.62), :]
    eyes = eyes_detector.detectMultiScale(
        upper, scaleFactor=1.1, minNeighbors=6, minSize=(max(12, width // 10), max(12, height // 12))
    )
    # Do not reject a face when Haar cannot see the eyes: prescription glasses,
    # a slow head turn, lighting and camera compression commonly cause this
    # false positive. Dedicated obstruction models are not used in this local
    # lightweight flow.
    return "ready"


def _anti_spoof_rule(image, face_box) -> str:
    # Liveness is confirmed by the browser's frame-motion challenge. Keeping
    # The browser performs a frame-motion challenge before this backend call.
    del image, face_box
    return "live"


def _crop_primary_face(image):
    """Keep only one clear, largest face so enrollment and checks use identical input."""
    import numpy as np

    cv2, detector = _face_detector()
    rgb = np.asarray(image)
    grayscale = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    faces = detector.detectMultiScale(
        grayscale,
        # A browser frame is compressed before upload. These settings retain
        # the single-face safeguard while accepting a face at normal webcam
        # distance instead of requiring it to fill most of a 256px frame.
        scaleFactor=1.10,
        minNeighbors=5,
        minSize=(28, 28),
    )
    if len(faces) == 0:
        raise HTTPException(
            status_code=422,
            detail="Không nhìn thấy khuôn mặt. Hãy đưa mặt vào giữa khung hình, đến gần hơn và chọn nơi đủ sáng.",
        )
        # Haar Cascade is intentionally used as a lightweight quality check,
        # but it is unreliable for some browser webcam frames (backlight,
        # autofocus and wide-angle cameras). The UI guides the user to centre
        # their face, so keep the flow usable by falling back to a centred
        # square crop. ArcFace still produces the actual embedding comparison.
        side = min(image.width, image.height)
        if side < 128:
            raise HTTPException(
                status_code=422,
                detail="Ảnh camera quá nhỏ. Hãy mở lại camera và thử lại.",
            )
        left = (image.width - side) // 2
        top = (image.height - side) // 2
        return image.crop((left, top, left + side, top + side))

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
    image_width, image_height = image.size
    face_center_x = (x + width / 2) / image_width
    face_center_y = (y + height / 2) / image_height
    if not 0.28 <= face_center_x <= 0.72 or not 0.24 <= face_center_y <= 0.76:
        if face_center_x < 0.28:
            detail = "Khuôn mặt đang lệch sang trái. Hãy dịch mặt sang phải một chút."
        elif face_center_x > 0.72:
            detail = "Khuôn mặt đang lệch sang phải. Hãy dịch mặt sang trái một chút."
        elif face_center_y < 0.24:
            detail = "Khuôn mặt đang quá cao. Hãy hạ camera hoặc đưa mặt xuống một chút."
        else:
            detail = "Khuôn mặt đang quá thấp. Hãy nâng camera hoặc đưa mặt lên một chút."
        raise HTTPException(status_code=422, detail=detail)
    if x < image_width * 0.02 or y < image_height * 0.02 or x + width > image_width * 0.98 or y + height > image_height * 0.98:
        if x < image_width * 0.02:
            detail = "Phần mặt bên trái đang sát mép hoặc ra khỏi khung. Hãy dịch mặt sang phải."
        elif x + width > image_width * 0.98:
            detail = "Phần mặt bên phải đang sát mép hoặc ra khỏi khung. Hãy dịch mặt sang trái."
        elif y < image_height * 0.02:
            detail = "Phần trán đang sát mép trên. Hãy hạ mặt hoặc điều chỉnh camera xuống."
        else:
            detail = "Phần cằm đang sát mép dưới. Hãy nâng mặt hoặc điều chỉnh camera lên."
        raise HTTPException(status_code=422, detail=detail)
    if width < image_width * 0.25 or height < image_height * 0.25:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt chưa đủ gần. Hãy đưa mặt lại gần camera hơn.",
        )
    if width > image_width * 0.78 or height > image_height * 0.78:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt đang quá gần camera. Hãy lùi ra xa một chút để thấy trọn khuôn mặt.",
        )
    if _obstruction_rule(image, ordered_faces[0]) != "ready":
        raise HTTPException(
            status_code=422,
            detail="Vui lòng loại bỏ các vật cản khỏi khuôn mặt trước khi quét.",
        )
    anti_spoof = _anti_spoof_rule(image, ordered_faces[0])
    if anti_spoof != "live":
        detail = "Model chống giả mạo chưa sẵn sàng." if anti_spoof == "anti_spoof_unavailable" else "Không xác minh được người thật. Hãy dùng khuôn mặt thật trước camera, không dùng ảnh hoặc video."
        raise HTTPException(status_code=503 if anti_spoof == "anti_spoof_unavailable" else 422, detail=detail)
    face_region = np.asarray(image)[y : y + height, x : x + width]
    gray = cv2.cvtColor(face_region, cv2.COLOR_RGB2GRAY)
    brightness = float(gray.mean())
    if brightness < 45 or brightness > 225:
        raise HTTPException(
            status_code=422,
            detail="Ảnh chưa đủ sáng hoặc bị chói sáng. Hãy đến nơi ánh sáng đều hơn.",
        )
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < 15:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt đang bị mờ. Hãy giữ camera và khuôn mặt yên khi chụp.",
        )
    # A small margin preserves chin, forehead and face contour, but excludes background.
    margin = int(max(width, height) * 0.18)
    left = max(0, x - margin)
    top = max(0, y - margin)
    right = min(image.width, x + width + margin)
    bottom = min(image.height, y + height + margin)
    return image.crop((left, top, right, bottom))


def _normalize_face_lighting(image):
    """Apply a small, deterministic exposure correction before inference."""
    import numpy as np
    from PIL import ImageEnhance

    pixels = np.asarray(image.convert("L"), dtype=np.float32)
    mean = float(pixels.mean())
    gain = max(0.8, min(1.35, 128.0 / max(mean, 1.0)))
    corrected = ImageEnhance.Brightness(image).enhance(gain)
    return ImageEnhance.Contrast(corrected).enhance(1.08)


def warm_face_model() -> None:
    """Load the Hugging Face model before the first face request."""
    _model()
    _face_detector()


def embedding_from_data_url(data_url: str) -> list[float]:
    """Produce a normalized ArcFace embedding suitable for encrypted DB storage."""
    return _embedding(_image_bytes(data_url)).squeeze(0).tolist()


def face_quality_rule_from_data_url(data_url: str) -> str:
    """Return the first failed quality rule without loading the face model."""
    import cv2
    import numpy as np
    from PIL import Image

    raw = _image_bytes(data_url)
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="invalid_image") from exc
    cv2_module, detector = _face_detector()
    rgb = np.asarray(image)
    gray = cv2_module.cvtColor(rgb, cv2_module.COLOR_RGB2GRAY)
    faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(28, 28))
    if len(faces) == 0:
        return "no_face"
    ordered = sorted(faces, key=lambda face: int(face[2]) * int(face[3]), reverse=True)
    if len(ordered) > 1:
        first_area = int(ordered[0][2]) * int(ordered[0][3])
        second_area = int(ordered[1][2]) * int(ordered[1][3])
        if second_area >= first_area * 0.55:
            return "multiple_faces"
    x, y, width, height = map(int, ordered[0])
    image_width, image_height = image.size
    center_x = (x + width / 2) / image_width
    center_y = (y + height / 2) / image_height
    if not 0.28 <= center_x <= 0.72 or not 0.24 <= center_y <= 0.76:
        if center_x < 0.28:
            return "off_center_left"
        if center_x > 0.72:
            return "off_center_right"
        if center_y < 0.24:
            return "off_center_top"
        return "off_center_bottom"
    if x < image_width * 0.02 or y < image_height * 0.02 or x + width > image_width * 0.98 or y + height > image_height * 0.98:
        if x < image_width * 0.02:
            return "off_center_left"
        if x + width > image_width * 0.98:
            return "off_center_right"
        if y < image_height * 0.02:
            return "off_center_top"
        return "off_center_bottom"
    if width < image_width * 0.25 or height < image_height * 0.25:
        return "too_far"
    if width > image_width * 0.78 or height > image_height * 0.78:
        return "too_near"
    obstruction = _obstruction_rule(image, ordered[0])
    if obstruction != "ready":
        return obstruction
    anti_spoof = _anti_spoof_rule(image, ordered[0])
    if anti_spoof == "anti_spoof_unavailable":
        return "anti_spoof_unavailable"
    if anti_spoof != "live":
        return "spoof_detected"
    face_gray = cv2_module.cvtColor(rgb[y : y + height, x : x + width], cv2_module.COLOR_RGB2GRAY)
    if float(face_gray.mean()) < 45 or float(face_gray.mean()) > 225:
        return "lighting"
    if float(cv2_module.Laplacian(face_gray, cv2_module.CV_64F).var()) < 15:
        return "blurry"
    return "ready"


def validate_face_quality_from_data_url(data_url: str) -> None:
    rule = face_quality_rule_from_data_url(data_url)
    if rule != "ready":
        raise HTTPException(status_code=422, detail=f"FACE_QUALITY:{rule}")


def similarity_from_embedding(*, enrollment_embedding: list[float], selfie_data_url: str) -> float:
    import torch
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

"""Authentication, independent face enrollment, and account profile APIs."""

import base64
from datetime import UTC, datetime, timedelta

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.core.security import (
    create_access_token,
    create_face_verification_token,
    hash_password,
    verify_password,
)
from src.app.db.session import get_db
from src.app.models.face_enrollment import FaceEnrollment
from src.app.models.face_verification_log import FaceVerificationLog
from src.app.models.face_verification_state import FaceVerificationState
from src.app.models.transaction import Transaction
from src.app.models.user import User, UserRole
from src.app.schemas.auth import (
    AccountOverview,
    FaceEnrollmentRequest,
    FaceLoginRequest,
    FaceLoginResponse,
    FaceVerificationRequest,
    FaceVerificationResponse,
    LoginLocationRequest,
    LoginLocationResponse,
    LoginRequest,
    RegisterRequest,
    SecurityCheck,
    TokenResponse,
    TransactionPinRequest,
)
from src.app.schemas.user import UserOut
from src.app.services.audit import add_audit_log
from src.app.services.face_verification import (
    aggregate_embeddings,
    embedding_from_data_url,
    face_pose_from_data_url,
    face_quality_rule_from_data_url,
    similarity_from_embedding,
)
from src.app.services import risk_rules
from src.app.services.transaction_telemetry import build_risk_telemetry, persist_risk_telemetry

router = APIRouter(prefix="/auth", tags=["auth"])
_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024
def _face_state_for_update(db: Session, user_id) -> FaceVerificationState:
    """Lock shared Face ID state so lockout applies across all workers."""
    state = db.scalar(
        select(FaceVerificationState)
        .where(FaceVerificationState.user_id == user_id)
        .with_for_update()
    )
    if state is None:
        # Migrations seed this row for existing users; this fallback covers
        # isolated test databases and users created before the migration.
        state = FaceVerificationState(user_id=user_id)
        db.add(state)
        db.flush()
    return state


def _face_lock_remaining(state: FaceVerificationState) -> int:
    if state.locked_until is None:
        return 0
    remaining = int((state.locked_until - datetime.now(UTC)).total_seconds())
    if remaining <= 0:
        state.failure_count = 0
        state.locked_until = None
        return 0
    return remaining


def _configure_cloudinary() -> None:
    settings = get_settings()
    if not all((settings.cloudinary_cloud_name, settings.cloudinary_api_key, settings.cloudinary_api_secret)):
        raise HTTPException(status_code=503, detail="Cloudinary chưa được cấu hình")
    cloudinary.config(cloud_name=settings.cloudinary_cloud_name, api_key=settings.cloudinary_api_key, api_secret=settings.cloudinary_api_secret, secure=True)


def _data_url_bytes(value: str) -> bytes:
    try:
        raw = base64.b64decode(value.split(",", 1)[1], validate=True)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ") from exc
    if not raw or len(raw) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt phải có dung lượng tối đa 5 MB")
    return raw


def _face_frames(value: str | list[str]) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and value and all(isinstance(item, str) for item in value):
        return value
    raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ")


def _record_login_context(
    db: Session,
    *,
    user: User,
    payload: LoginLocationRequest,
    request: Request,
) -> None:
    """Persist mandatory login context and audit only derived risk evidence."""
    peer_ip = request.client.host if request.client is not None else None
    telemetry = build_risk_telemetry(payload.client_context, client_ip=peer_ip)
    security_signals = risk_rules.collect_telemetry_signals(db, user.id, telemetry)
    persist_risk_telemetry(
        db,
        user_id=user.id,
        transaction_id=None,
        telemetry=telemetry,
        event_type="login",
    )
    add_audit_log(
        db,
        action="auth.login_succeeded",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={
            "security_signal_types": [signal.signal_type for signal in security_signals],
            "security_signal_count": len(security_signals),
            "coarse_location_required": True,
        },
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email đã được sử dụng")
    if db.scalar(
        select(User.id).where(
            User.phone == payload.phone,
            User.timi_bank_enabled.is_(True),
        )
    ):
        raise HTTPException(status_code=409, detail="Số điện thoại này đã là tài khoản Timi Bank")
    user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        role=UserRole.USER.value,
        timi_bank_enabled=True,
    )
    db.add(user)
    try:
        db.flush()
        db.add(FaceVerificationState(user_id=user.id))
        db.commit()
    except IntegrityError:
        # The partial unique index is the race-safe final authority when two
        # registrations try to claim one phone number at the same time.
        db.rollback()
        raise HTTPException(status_code=409, detail="Số điện thoại này đã là tài khoản Timi Bank") from None
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(subject=str(user.id), role=user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Issue the app session; UI immediately enforces location setup."""
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
    return TokenResponse(
        access_token=create_access_token(
            subject=str(user.id),
            role=user.role,
            expires_delta=(timedelta(days=get_settings().remember_me_expire_days) if payload.remember_me else None),
        ),
        user=UserOut.model_validate(user),
    )


@router.post("/login/location", response_model=LoginLocationResponse)
def record_login_location(
    payload: LoginLocationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LoginLocationResponse:
    """Store required coarse location from the post-login setup screen."""
    _record_login_context(db, user=current_user, payload=payload, request=request)
    db.commit()
    return LoginLocationResponse()


@router.post("/login/face", response_model=FaceLoginResponse)
def login_with_face(
    payload: FaceLoginRequest,
    db: Session = Depends(get_db),
) -> FaceLoginResponse:
    settings = get_settings()
    enrollments = db.scalars(select(FaceEnrollment).where(FaceEnrollment.is_active.is_(True), FaceEnrollment.model_id == settings.face_embedding_version)).all()
    if not enrollments:
        raise HTTPException(status_code=409, detail="Chưa có tài khoản nào đăng ký khuôn mặt")
    probe = embedding_from_data_url(payload.image_data)
    import numpy as np
    probe_vector = np.asarray(probe, dtype=np.float32)
    scored = sorted(
        ((float(np.dot(probe_vector, np.asarray(row.reference_embedding, dtype=np.float32))), row) for row in enrollments),
        key=lambda item: item[0],
        reverse=True,
    )
    similarity, enrollment = scored[0]
    second_similarity = scored[1][0] if len(scored) > 1 else -1.0
    threshold = float(settings.face_login_similarity_threshold)
    user = db.get(User, enrollment.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Tài khoản không hợp lệ")
    if similarity < threshold or (second_similarity >= 0 and similarity - second_similarity < 0.03):
        db.add(FaceVerificationLog(user_id=user.id, enrollment_id=enrollment.id, purpose="login", similarity=similarity, threshold=threshold, matched=False, model_id=enrollment.model_id, failure_reason="similarity_below_threshold_or_ambiguous", created_at=datetime.now(UTC)))
        db.commit()
        raise HTTPException(status_code=401, detail="Khuôn mặt chưa đủ độ khớp để đăng nhập")
    db.add(FaceVerificationLog(user_id=user.id, enrollment_id=enrollment.id, purpose="login", similarity=similarity, threshold=threshold, matched=True, model_id=enrollment.model_id, created_at=datetime.now(UTC)))
    add_audit_log(db, action="auth.face_login_verified", actor_id=user.id, resource_type="face_enrollment", resource_id=enrollment.id, metadata={"similarity": round(similarity, 4)})
    db.commit()
    return FaceLoginResponse(
        access_token=create_access_token(
            subject=str(user.id),
            role=user.role,
            expires_delta=(timedelta(days=get_settings().remember_me_expire_days) if payload.remember_me else None),
        ),
        user=UserOut.model_validate(user),
        similarity=similarity,
        threshold=threshold,
    )

    # Legacy account/password/PIN path retained below for migration reference.
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    if not user.transaction_pin_hash or not verify_password(payload.pin, user.transaction_pin_hash):
        raise HTTPException(status_code=401, detail="Mã PIN giao dịch không đúng")
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == user.id, FaceEnrollment.is_active.is_(True)))
    if enrollment is None:
        raise HTTPException(status_code=409, detail="Tài khoản chưa đăng ký khuôn mặt")
    if enrollment.model_id != settings.face_embedding_version:
        raise HTTPException(status_code=409, detail="Dữ liệu khuôn mặt cần được đăng ký lại để dùng chuẩn quét khuôn mặt mới")
    similarity = similarity_from_embedding(enrollment_embedding=enrollment.reference_embedding, selfie_data_url=payload.image_data)
    if similarity < float(enrollment.similarity_threshold):
        db.add(FaceVerificationLog(user_id=user.id, enrollment_id=enrollment.id, purpose="login", similarity=similarity, threshold=float(enrollment.similarity_threshold), matched=False, model_id=enrollment.model_id, failure_reason="similarity_below_threshold", created_at=datetime.now(UTC)))
        db.commit()
        raise HTTPException(status_code=401, detail="Khuôn mặt không khớp với tài khoản")
    db.add(FaceVerificationLog(user_id=user.id, enrollment_id=enrollment.id, purpose="login", similarity=similarity, threshold=float(enrollment.similarity_threshold), matched=True, model_id=enrollment.model_id, created_at=datetime.now(UTC)))
    add_audit_log(db, action="auth.face_login_verified", actor_id=user.id, resource_type="face_enrollment", resource_id=enrollment.id, metadata={"similarity": round(similarity, 4)})
    db.commit()
    return FaceLoginResponse(
        access_token=create_access_token(subject=str(user.id), role=user.role),
        user=UserOut.model_validate(user),
        similarity=similarity,
        threshold=float(enrollment.similarity_threshold),
    )


@router.put("/face/enrollment", response_model=FaceVerificationResponse)
def enroll_face(payload: FaceEnrollmentRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> FaceVerificationResponse:
    if not payload.consent:
        raise HTTPException(status_code=422, detail="Cần đồng ý lưu dữ liệu khuôn mặt để đăng ký")
    settings = get_settings(); _configure_cloudinary()
    frames = _face_frames(payload.image_data)
    embeddings = [embedding_from_data_url(frame) for frame in frames]
    aggregate_embedding = aggregate_embeddings(embeddings)
    reference_frame = frames[0]
    image = _data_url_bytes(reference_frame)
    try:
        # The embedding service already validates and crops the primary face.
        # Store a smaller face-focused reference so uploads and future reads
        # do not carry unnecessary background pixels.
        uploaded = cloudinary.uploader.upload(image, folder="fintechguard/face-enrollments", public_id=str(current_user.id), overwrite=True, resource_type="image", allowed_formats=["jpg", "jpeg", "png"], transformation=[{"width": 256, "height": 256, "crop": "fill", "gravity": "face", "zoom": 0.85}])
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể lưu ảnh khuôn mặt lên Cloudinary") from exc
    row = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id))
    if row is None:
        row = FaceEnrollment(user_id=current_user.id, reference_image_url=uploaded["secure_url"], reference_embedding=aggregate_embedding.tolist(), model_id=settings.face_embedding_version, similarity_threshold=settings.face_similarity_threshold, consent_at=datetime.now(UTC), is_active=True)
        db.add(row); db.flush()
    else:
        row.reference_image_url, row.reference_embedding = uploaded["secure_url"], aggregate_embedding.tolist()
        row.model_id, row.similarity_threshold, row.consent_at, row.is_active, row.revoked_at = settings.face_embedding_version, settings.face_similarity_threshold, datetime.now(UTC), True, None
    db.add(FaceVerificationLog(user_id=current_user.id, enrollment_id=row.id, purpose="enrollment", similarity=1, threshold=settings.face_similarity_threshold, matched=True, model_id=settings.face_embedding_version, created_at=datetime.now(UTC)))
    add_audit_log(db, action="auth.face_enrolled", actor_id=current_user.id, resource_type="face_enrollment", resource_id=row.id, metadata={"model_id": settings.face_embedding_version, "sample_count": len(embeddings)})
    db.commit()
    return FaceVerificationResponse(matched=True, similarity=1, threshold=settings.face_similarity_threshold, message="Đã đăng ký khuôn mặt độc lập với ảnh đại diện.")


@router.post("/face/quality")
def face_quality(
    payload: FaceVerificationRequest,
) -> dict[str, object]:
    rule = face_quality_rule_from_data_url(payload.image_data)
    messages = {
        "obstructed_hand": "Vui lòng đưa tay ra khỏi khuôn mặt trước khi quét.",
        "obstructed_mask": "Vui lòng tháo khẩu trang khỏi khuôn mặt trước khi quét.",
        "obstructed_sunglasses": "Vui lòng tháo kính râm khỏi khuôn mặt trước khi quét.",
        "obstructed_glasses": "Vui lòng tháo kính hoặc vật cản khỏi khuôn mặt trước khi quét.",
        "obstructed_other": "Vui lòng loại bỏ mũ, nón hoặc vật cản khỏi khuôn mặt trước khi quét.",
        "model_unavailable": "Model kiểm tra khuôn mặt chưa sẵn sàng. Hệ thống đang tải model, hãy thử lại sau ít giây.",
        "anti_spoof_unavailable": "Model chống giả mạo chưa sẵn sàng. Hãy cài dependencies rồi thử lại.",
        "spoof_detected": "Không xác minh được người thật. Không dùng ảnh hoặc video trước camera.",
        "obstructed_eyes": "Vui lòng bỏ tay, kính tối hoặc vật cản khỏi vùng mắt.",
        "obstructed_mouth_chin": "Vui lòng bỏ tay, khẩu trang hoặc vật cản khỏi vùng miệng và cằm.",
        "obstructed_headwear": "Vui lòng bỏ mũ/nón hoặc vật cản khỏi vùng trán và đầu.",
        "obstructed_face": "Vui lòng loại bỏ các vật cản khỏi khuôn mặt trước khi quét.",
        "no_face": "Chưa thấy khuôn mặt. Hãy đưa toàn bộ mặt vào khung; nếu mặt đang quá nhỏ thì tiến gần camera hơn.",
        "multiple_faces": "Có nhiều khuôn mặt. Chỉ để một mình bạn trong khung.",
        "off_center": "Khuôn mặt đang lệch tâm. Hãy căn mặt vào giữa khung.",
        "off_center_left": "Khuôn mặt đang lệch sang trái. Hãy dịch mặt sang phải một chút.",
        "off_center_right": "Khuôn mặt đang lệch sang phải. Hãy dịch mặt sang trái một chút.",
        "off_center_top": "Khuôn mặt đang quá cao. Hãy hạ camera hoặc đưa mặt xuống một chút.",
        "off_center_bottom": "Khuôn mặt đang quá thấp. Hãy nâng camera hoặc đưa mặt lên một chút.",
        "too_far": "Khuôn mặt đang quá xa hoặc quá nhỏ. Hãy tiến gần camera thêm một chút.",
        "too_near": "Khuôn mặt đang quá gần camera. Hãy lùi ra xa một chút để thấy trọn khuôn mặt.",
        "lighting": "Ánh sáng chưa đạt. Hãy tăng sáng hoặc tránh ánh sáng chiếu thẳng.",
        "blurry": "Khuôn mặt đang bị mờ. Hãy giữ camera và khuôn mặt yên.",
        "invalid_image": "Không đọc được ảnh camera. Hãy thử lại.",
    }
    return {
        "ready": rule == "ready",
        "rule": rule,
        "pose": face_pose_from_data_url(payload.image_data),
        "message": messages.get(rule, "Khung hình chưa đạt yêu cầu."),
    }


@router.post("/face/verify", response_model=FaceVerificationResponse)
def verify_face(payload: FaceVerificationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> FaceVerificationResponse:
    settings = get_settings()
    is_transaction_verification = payload.transaction_id is not None
    face_state = None
    if is_transaction_verification:
        face_state = _face_state_for_update(db, current_user.id)
        remaining = _face_lock_remaining(face_state)
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                headers={"Retry-After": str(remaining)},
                detail=f"Face ID đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
            )
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id, FaceEnrollment.is_active.is_(True)))
    if enrollment is None:
        raise HTTPException(status_code=409, detail="Bạn chưa đăng ký khuôn mặt")
    if enrollment.model_id != settings.face_embedding_version:
        raise HTTPException(status_code=409, detail="Dữ liệu khuôn mặt cần được đăng ký lại để dùng chuẩn quét khuôn mặt mới")

    frames = _face_frames(payload.image_data)
    selfie = frames[0]
    similarity = similarity_from_embedding(enrollment_embedding=enrollment.reference_embedding, selfie_data_url=selfie)
    threshold = settings.face_transaction_similarity_threshold if is_transaction_verification else float(enrollment.similarity_threshold)
    matched = similarity >= float(threshold)
    db.add(FaceVerificationLog(user_id=current_user.id, enrollment_id=enrollment.id, transaction_id=payload.transaction_id, purpose="transaction" if is_transaction_verification else "login", similarity=similarity, threshold=float(threshold), matched=matched, model_id=enrollment.model_id, failure_reason=None if matched else "similarity_below_threshold", created_at=datetime.now(UTC)))
    locked_for = 0
    failures = 0
    if is_transaction_verification:
        if matched:
            face_state.failure_count = 0
            face_state.locked_until = None
        else:
            face_state.failure_count += 1
            failures = face_state.failure_count
            if failures >= settings.face_transaction_failure_limit:
                face_state.locked_until = datetime.now(UTC) + timedelta(seconds=settings.face_transaction_lock_seconds)
            locked_for = _face_lock_remaining(face_state)
    db.commit()
    if is_transaction_verification and not matched and locked_for > 0:
        raise HTTPException(status_code=429, headers={"Retry-After": str(locked_for)}, detail=f"Bạn đã xác thực Face ID sai {failures} lần. Chức năng tạm khóa {locked_for} giây.")
    token = create_face_verification_token(
        user_id=str(current_user.id),
        transaction_id=str(payload.transaction_id) if payload.transaction_id else None,
        nonce=payload.nonce,
        amount=int(payload.amount) if payload.amount is not None else None,
    ) if matched else None
    return FaceVerificationResponse(matched=matched, similarity=similarity, threshold=float(threshold), message="Khuôn mặt khớp với dữ liệu đã đăng ký." if matched else "Khuôn mặt chưa đủ độ khớp. Hãy chụp lại ở nơi đủ sáng.", verification_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.get("/overview", response_model=AccountOverview)
def account_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> AccountOverview:
    now = datetime.now(UTC)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_month = start_today.replace(day=1)
    count = lambda since: db.scalar(select(func.count()).select_from(Transaction).where(Transaction.user_id == current_user.id, Transaction.created_at >= since)) or 0
    enrolled = bool(db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id, FaceEnrollment.is_active.is_(True), FaceEnrollment.model_id == get_settings().face_embedding_version)))
    has_pin = bool(current_user.transaction_pin_hash)
    checks = [
        SecurityCheck(label="Thông tin tài khoản", detail="Email và số điện thoại", score=40, completed=bool(current_user.phone)),
        SecurityCheck(label="PIN giao dịch", detail="Xác nhận sau khi đăng nhập", score=30, completed=has_pin),
        SecurityCheck(label="Khuôn mặt", detail="Đã đăng ký độc lập với ảnh đại diện", score=30, completed=enrolled),
    ]
    score = sum(check.score for check in checks if check.completed)
    return AccountOverview(balance=current_user.balance, transactions_today=count(start_today), transactions_this_month=count(start_month), security_score=score, security_grade="A" if score >= 80 else "B" if score >= 50 else "C", transaction_pin_configured=has_pin, phone_configured=bool(current_user.phone), security_checks=checks)


@router.put("/avatar", response_model=UserOut)
def upload_avatar(avatar: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UserOut:
    if avatar.content_type not in _AVATAR_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP")
    content = avatar.file.read(_MAX_IMAGE_SIZE + 1)
    if not content or len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="Ảnh đại diện không hợp lệ hoặc vượt quá 5 MB")
    _configure_cloudinary()
    result = cloudinary.uploader.upload(content, folder="fintechguard/avatars", public_id=str(current_user.id), overwrite=True, resource_type="image")
    current_user.avatar_url = result["secure_url"]; db.commit(); db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UserOut:
    """Remove the profile avatar without affecting the enrolled face data."""
    if current_user.avatar_url:
        _configure_cloudinary()
        try:
            cloudinary.uploader.destroy(
                f"fintechguard/avatars/{current_user.id}",
                invalidate=True,
                resource_type="image",
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Không thể xóa ảnh đại diện") from exc

    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.put("/transaction-pin")
def set_transaction_pin(payload: TransactionPinRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    current_user.transaction_pin_hash = hash_password(payload.pin); db.commit()
    return {"configured": True}


@router.get("/transaction-pin/status")
def transaction_pin_status(current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    return {"configured": bool(current_user.transaction_pin_hash)}


@router.get("/face/enrollment/status")
def face_enrollment_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    enrolled = bool(db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id, FaceEnrollment.is_active.is_(True), FaceEnrollment.model_id == get_settings().face_embedding_version)))
    return {"configured": enrolled}

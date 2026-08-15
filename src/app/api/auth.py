"""Authentication, independent face enrollment, and account profile APIs."""

import base64
from datetime import UTC, datetime

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
from src.app.services.face_verification import embedding_from_data_url, similarity_from_embedding
from src.app.services import risk_rules
from src.app.services.transaction_telemetry import build_risk_telemetry, persist_risk_telemetry

router = APIRouter(prefix="/auth", tags=["auth"])
_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024


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
        access_token=create_access_token(subject=str(user.id), role=user.role),
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
    image = _data_url_bytes(payload.image_data)
    embedding = embedding_from_data_url(payload.image_data)
    try:
        uploaded = cloudinary.uploader.upload(image, folder="fintechguard/face-enrollments", public_id=str(current_user.id), overwrite=True, resource_type="image", allowed_formats=["jpg", "jpeg", "png"], transformation=[{"width": 512, "height": 512, "crop": "fill", "gravity": "face"}])
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể lưu ảnh khuôn mặt lên Cloudinary") from exc
    row = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id))
    if row is None:
        row = FaceEnrollment(user_id=current_user.id, reference_image_url=uploaded["secure_url"], reference_embedding=embedding, model_id=settings.face_embedding_version, similarity_threshold=settings.face_similarity_threshold, consent_at=datetime.now(UTC), is_active=True)
        db.add(row); db.flush()
    else:
        row.reference_image_url, row.reference_embedding = uploaded["secure_url"], embedding
        row.model_id, row.similarity_threshold, row.consent_at, row.is_active, row.revoked_at = settings.face_embedding_version, settings.face_similarity_threshold, datetime.now(UTC), True, None
    db.add(FaceVerificationLog(user_id=current_user.id, enrollment_id=row.id, purpose="enrollment", similarity=1, threshold=settings.face_similarity_threshold, matched=True, model_id=settings.face_embedding_version, created_at=datetime.now(UTC)))
    add_audit_log(db, action="auth.face_enrolled", actor_id=current_user.id, resource_type="face_enrollment", resource_id=row.id, metadata={"model_id": settings.face_embedding_version})
    db.commit()
    return FaceVerificationResponse(matched=True, similarity=1, threshold=settings.face_similarity_threshold, message="Đã đăng ký khuôn mặt độc lập với ảnh đại diện.")


@router.post("/face/verify", response_model=FaceVerificationResponse)
def verify_face(payload: FaceVerificationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> FaceVerificationResponse:
    settings = get_settings()
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id, FaceEnrollment.is_active.is_(True)))
    if enrollment is None:
        raise HTTPException(status_code=409, detail="Bạn chưa đăng ký khuôn mặt")
    if enrollment.model_id != settings.face_embedding_version:
        raise HTTPException(status_code=409, detail="Dữ liệu khuôn mặt cần được đăng ký lại để dùng chuẩn quét khuôn mặt mới")
    similarity = similarity_from_embedding(enrollment_embedding=enrollment.reference_embedding, selfie_data_url=payload.image_data)
    matched = similarity >= float(enrollment.similarity_threshold)
    db.add(FaceVerificationLog(user_id=current_user.id, enrollment_id=enrollment.id, transaction_id=payload.transaction_id, purpose="transaction" if payload.transaction_id else "login", similarity=similarity, threshold=float(enrollment.similarity_threshold), matched=matched, model_id=enrollment.model_id, failure_reason=None if matched else "similarity_below_threshold", created_at=datetime.now(UTC)))
    db.commit()
    token = create_face_verification_token(user_id=str(current_user.id), transaction_id=str(payload.transaction_id) if payload.transaction_id else None) if matched else None
    return FaceVerificationResponse(matched=matched, similarity=similarity, threshold=float(enrollment.similarity_threshold), message="Khuôn mặt khớp với dữ liệu đã đăng ký." if matched else "Khuôn mặt chưa đủ độ khớp. Hãy chụp lại ở nơi đủ sáng.", verification_token=token)


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

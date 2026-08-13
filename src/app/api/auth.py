"""Registration, login and the current authenticated user."""

from datetime import UTC, datetime

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.core.security import create_access_token, hash_password, verify_password
from src.app.db.session import get_db
from src.app.models.transaction import Transaction
from src.app.models.user import User, UserRole
from src.app.schemas.auth import (
    AccountOverview,
    LoginRequest,
    RegisterRequest,
    SecurityCheck,
    TokenResponse,
    TransactionPinRequest,
)
from src.app.schemas.user import UserOut
from src.app.services.audit import add_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])

_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_AVATAR_SIZE = 5 * 1024 * 1024


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")

    user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        hashed_password=hash_password(payload.password),
        role=UserRole.USER.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(subject=str(user.id), role=user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị vô hiệu hóa")

    return TokenResponse(
        access_token=create_access_token(subject=str(user.id), role=user.role),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.put("/avatar", response_model=UserOut)
def upload_avatar(
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    """Store a small JPEG, PNG, or WebP avatar for the current account."""
    if avatar.content_type not in _AVATAR_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP")
    content = avatar.file.read(_MAX_AVATAR_SIZE + 1)
    if len(content) > _MAX_AVATAR_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ảnh không được vượt quá 5 MB")
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tệp ảnh trống")

    settings = get_settings()
    if not all((settings.cloudinary_cloud_name, settings.cloudinary_api_key, settings.cloudinary_api_secret)):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cloudinary chưa được cấu hình")

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    try:
        result = cloudinary.uploader.upload(
            content,
            folder="fintechguard/avatars",
            public_id=str(current_user.id),
            overwrite=True,
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "webp"],
            transformation=[{"width": 256, "height": 256, "crop": "fill", "gravity": "face"}],
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Không thể tải ảnh lên Cloudinary") from exc

    current_user.avatar_url = result["secure_url"]
    add_audit_log(db, action="auth.avatar_updated", actor_id=current_user.id,
                  resource_type="user", resource_id=current_user.id)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.get("/overview", response_model=AccountOverview)
def account_overview(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> AccountOverview:
    """Return profile counters and security score computed from persisted account data."""
    now = datetime.now(UTC)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_month = start_of_today.replace(day=1)

    def count_transactions_from(start: datetime) -> int:
        return db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.user_id == current_user.id, Transaction.created_at >= start)
        ) or 0

    # Registration already collects email, password and phone. A transaction
    # PIN is the first extra protection layer; A+ remains unavailable until
    # two-factor authentication is introduced.
    has_pin = bool(current_user.transaction_pin_hash)
    has_phone = bool(current_user.phone)
    checks = [
        SecurityCheck(label="Thông tin tài khoản", detail="Email, mật khẩu và số điện thoại đã được đăng ký", score=50, completed=has_phone),
        SecurityCheck(label="PIN giao dịch", detail="Xác nhận trước khi chuyển tiền", score=35, completed=has_pin),
        SecurityCheck(label="Xác thực hai lớp", detail="Lớp bảo vệ nâng cao sẽ sớm được hỗ trợ", score=15, completed=False),
    ]
    score = 50 + (35 if has_pin else 0)
    grade = "A+" if score >= 100 else "A" if score >= 80 else "B" if score >= 50 else "C"
    return AccountOverview(
        balance=current_user.balance,
        transactions_today=count_transactions_from(start_of_today),
        transactions_this_month=count_transactions_from(start_of_month),
        security_score=score,
        security_grade=grade,
        transaction_pin_configured=has_pin,
        phone_configured=has_phone,
        security_checks=checks,
    )


@router.put("/transaction-pin")
def set_transaction_pin(
    payload: TransactionPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    current_user.transaction_pin_hash = hash_password(payload.pin)
    add_audit_log(db, action="auth.transaction_pin_updated", actor_id=current_user.id,
                  resource_type="user", resource_id=current_user.id,
                  metadata={"configured": True})
    db.commit()
    return {"configured": True}


@router.get("/transaction-pin/status")
def transaction_pin_status(current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    return {"configured": bool(current_user.transaction_pin_hash)}

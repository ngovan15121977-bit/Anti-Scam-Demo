"""Registration, login and the current authenticated user."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.core.deps import get_current_user
from src.app.core.security import create_access_token, hash_password, verify_password
from src.app.db.session import get_db
from src.app.models.user import User, UserRole
from src.app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, TransactionPinRequest
from src.app.services.audit import add_audit_log
from src.app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


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

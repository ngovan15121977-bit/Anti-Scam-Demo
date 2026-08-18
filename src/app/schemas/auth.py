import re
import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.app.schemas.risk import RiskClientContextIn
from src.app.schemas.user import UserOut


class LoginRiskClientContextIn(RiskClientContextIn):
    """Login requires a browser device ID and coarse location permission."""

    device_id: str = Field(..., min_length=16, max_length=128)

    def model_post_init(self, __context: object) -> None:
        super().model_post_init(__context)
        if self.geo_latitude is None or self.geo_longitude is None:
            raise ValueError("Cần cấp vị trí gần đúng để đăng nhập")
        if self.geo_accuracy_m is None:
            raise ValueError("Thiếu độ chính xác của vị trí đăng nhập")


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    phone: str = Field(..., min_length=10, max_length=10)
    @field_validator("phone", mode="before")
    @classmethod
    def normalize_timi_account_phone(cls, value: object) -> str:
        phone = re.sub(r"\s+", "", str(value or ""))
        if not re.fullmatch(r"\d{10}", phone):
            raise ValueError("Số điện thoại phải gồm đúng 10 chữ số")
        return phone


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class LoginLocationRequest(BaseModel):
    """Mandatory location submission immediately after an authenticated login."""

    client_context: LoginRiskClientContextIn


class TransactionPinRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")


class FaceVerificationRequest(BaseModel):
    image_data: str | list[str] = Field(..., min_length=20, max_length=7_000_000)
    transaction_id: uuid.UUID | None = None
    nonce: str | None = Field(default=None, min_length=8, max_length=256)
    amount: int | None = Field(default=None, ge=0, le=10_000_000_000)


class FaceLoginRequest(LoginRequest):
    pin: str = Field(..., pattern=r"^\d{4,6}$")
    image_data: str = Field(..., min_length=20, max_length=7_000_000)


class FaceEnrollmentRequest(BaseModel):
    image_data: str | list[str] = Field(..., min_length=20, max_length=7_000_000)
    consent: bool


class FaceVerificationResponse(BaseModel):
    matched: bool
    similarity: float = Field(..., ge=0, le=1)
    threshold: float = Field(..., ge=0, le=1)
    message: str
    verification_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginLocationResponse(BaseModel):
    recorded: bool = True


class FaceLoginResponse(TokenResponse):
    similarity: float = Field(..., ge=0, le=1)
    threshold: float = Field(..., ge=0, le=1)


class AccountOverview(BaseModel):
    """Live account metrics shown on the authenticated user's profile."""

    balance: int
    transactions_today: int
    transactions_this_month: int
    security_score: int = Field(..., ge=0, le=100)
    security_grade: str
    transaction_pin_configured: bool
    phone_configured: bool
    security_checks: list["SecurityCheck"]


class SecurityCheck(BaseModel):
    label: str
    detail: str
    score: int
    completed: bool


AuthResponse = TokenResponse

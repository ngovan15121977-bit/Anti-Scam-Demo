import uuid

from pydantic import BaseModel, EmailStr, Field

from src.app.schemas.user import UserOut


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    phone: str | None = Field(None, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class TransactionPinRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")


class FaceVerificationRequest(BaseModel):
    image_data: str = Field(..., min_length=20, max_length=7_000_000)
    transaction_id: uuid.UUID | None = None


class FaceLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    pin: str = Field(..., pattern=r"^\d{4,6}$")
    image_data: str = Field(..., min_length=20, max_length=7_000_000)


class FaceEnrollmentRequest(BaseModel):
    image_data: str = Field(..., min_length=20, max_length=7_000_000)
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

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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


AuthResponse = TokenResponse

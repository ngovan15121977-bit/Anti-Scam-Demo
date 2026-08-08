"""Password hashing and JWT helpers shared by all active API routers."""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings


def hash_password(password: str) -> str:
    """Hash passwords safely while respecting bcrypt's 72-byte limit."""
    return bcrypt.hashpw(
        password.encode("utf-8")[:72], bcrypt.gensalt()
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8")
    )


def create_access_token(
    subject: str | dict[str, Any], role: str | None = None, expires_delta: timedelta | None = None
) -> str:
    """Create a signed JWT.

    ``dict`` input is accepted temporarily for compatibility with unmounted
    legacy routers. New code passes a subject UUID and role explicitly.
    """
    settings = get_settings()
    payload = dict(subject) if isinstance(subject, dict) else {"sub": subject}
    if role is not None:
        payload["role"] = role
    expires_at = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload["exp"] = expires_at
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise


# Backward-compatible aliases for files that have not been mounted by app.main.
get_password_hash = hash_password

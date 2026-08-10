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


def create_recipient_lookup_token(
    *, user_id: str, account_number: str, bank_code: str, account_name: str
) -> str:
    """Create a short-lived proof that a recipient name came from internal lookup."""
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=settings.recipient_lookup_token_expire_seconds
    )
    return jwt.encode(
        {
            "sub": user_id,
            "purpose": "recipient_lookup",
            "account_number": account_number,
            "bank_code": bank_code,
            "account_name": account_name,
            "exp": expires_at,
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_recipient_lookup_token(token: str, *, user_id: str) -> dict[str, str]:
    """Validate lookup proof and ensure it belongs to the current user."""
    payload = decode_access_token(token)
    required_fields = ("account_number", "bank_code", "account_name")
    if payload.get("purpose") != "recipient_lookup" or payload.get("sub") != user_id:
        raise ValueError("Lookup token does not belong to this user")
    if any(not isinstance(payload.get(field), str) or not payload[field] for field in required_fields):
        raise ValueError("Lookup token is missing recipient data")
    return {field: payload[field] for field in required_fields}


# Backward-compatible aliases for files that have not been mounted by app.main.
get_password_hash = hash_password

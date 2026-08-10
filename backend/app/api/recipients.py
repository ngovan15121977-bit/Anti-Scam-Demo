"""Authenticated recipient lookup API."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.core.security import create_recipient_lookup_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.recipient import RecipientLookupRequest, RecipientLookupResponse
from app.services.bank_normalization import normalize_bank_name
from app.services.recipient_lookup import RecipientLookupNotFound, lookup_recipient
from sqlalchemy.orm import Session

router = APIRouter(prefix="/recipients", tags=["recipients"])


@router.post("/resolve", response_model=RecipientLookupResponse)
def resolve_recipient(
    payload: RecipientLookupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecipientLookupResponse:
    """Return an internal account name and a short-lived proof for /assess."""
    bank_code = normalize_bank_name(payload.bank_code)
    if bank_code is None:
        raise HTTPException(status_code=422, detail="Ngân hàng không hợp lệ")
    try:
        result = lookup_recipient(
            db,
            user_id=current_user.id,
            account_number=payload.account_number,
            bank_code=bank_code,
        )
    except RecipientLookupNotFound:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tên tài khoản trong dữ liệu nội bộ.",
        ) from None

    return RecipientLookupResponse(
        account_number=payload.account_number,
        bank_code=bank_code,
        account_name=result.account_name,
        source=result.source,
        verification_token=create_recipient_lookup_token(
            user_id=str(current_user.id),
            account_number=payload.account_number,
            bank_code=bank_code,
            account_name=result.account_name,
        ),
    )

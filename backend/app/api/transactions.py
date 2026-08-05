"""Luồng chuyển tiền mô phỏng: đánh giá rủi ro -> người dùng quyết định."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.transaction import Transaction, UserDecision
from app.models.trusted_payee import TrustedPayee
from app.models.user import User
from app.schemas.risk import (
    AssessRequest,
    AssessResponse,
    DecisionRequest,
    TransactionOut,
)
from app.services import explain as explain_service
from app.services import risk_rules

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/assess", response_model=AssessResponse)
def assess(
    payload: AssessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Chấm điểm rủi ro và trả cảnh báo kèm giải thích.

    KHÔNG chuyển tiền và KHÔNG chặn giao dịch — chỉ ghi nhận đánh giá ở trạng
    thái PENDING. Tiền chỉ chuyển khi user gọi /decision với PROCEEDED.
    """
    signals = risk_rules.collect_signals(db, current_user.id, payload)
    score, level = risk_rules.score_from_signals(signals)

    explanation = explain_service.explain(level, signals)
    recommendation = explain_service.recommend(level)
    questions = explain_service.verification_questions(level)

    txn = Transaction(
        user_id=current_user.id,
        payee_account=payload.payee_account,
        payee_name=payload.payee_name,
        bank_code=payload.bank_code,
        amount=payload.amount,
        note=payload.note,
        risk_score=score,
        risk_level=level,
        risk_signals=[s.model_dump() for s in signals],
        explanation=explanation,
        recommendation=recommendation,
        user_decision=UserDecision.PENDING,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return AssessResponse(
        transaction_id=txn.id,
        risk_score=score,
        risk_level=level,
        signals=signals,
        explanation=explanation,
        recommendation=recommendation,
        verification_questions=questions,
    )


@router.post("/{transaction_id}/decision", response_model=AssessResponse)
def submit_decision(
    transaction_id: uuid.UUID,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Ghi nhận quyết định cuối cùng của người dùng (HITL) và thực hiện chuyển tiền."""
    txn = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    if txn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch"
        )
    if txn.user_decision is not UserDecision.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Giao dịch này đã được quyết định trước đó",
        )
    if payload.decision is UserDecision.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quyết định phải là 'proceeded' hoặc 'cancelled'",
        )

    if payload.decision is UserDecision.PROCEEDED:
        if current_user.balance < txn.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Số dư không đủ"
            )
        current_user.balance -= txn.amount

    # Lưu toàn bộ hội thoại xác minh để phục vụ accountability.
    questions = explain_service.verification_questions(txn.risk_level)
    txn.verification_log = [
        {"role": "agent", "content": q, "answer": a}
        for q, a in zip(questions, payload.verification_answers)
    ]
    txn.user_decision = payload.decision
    db.commit()
    db.refresh(txn)

    return AssessResponse(
        transaction_id=txn.id,
        risk_score=txn.risk_score,
        risk_level=txn.risk_level,
        signals=[],
        explanation=txn.explanation or "",
        recommendation=txn.recommendation or "",
    )


@router.get("/history", response_model=list[TransactionOut])
def history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Transaction]:
    """Lịch sử giao dịch của chính user đang đăng nhập."""
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
        .limit(min(limit, 100))
    ).all()
    return list(rows)


@router.post("/trusted-payees", status_code=status.HTTP_201_CREATED)
def mark_trusted(
    payee_account: str,
    payee_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Đánh dấu người nhận là an toàn để giảm cảnh báo lần sau (yêu cầu 5.4)."""
    existing = db.scalar(
        select(TrustedPayee).where(
            TrustedPayee.user_id == current_user.id,
            TrustedPayee.payee_account == payee_account,
        )
    )
    if existing is not None:
        return {"status": "already_trusted", "payee_account": payee_account}

    db.add(
        TrustedPayee(
            user_id=current_user.id,
            payee_account=payee_account,
            payee_name=payee_name,
        )
    )
    db.commit()
    return {"status": "trusted", "payee_account": payee_account}

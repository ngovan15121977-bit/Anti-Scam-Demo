"""Transaction flow: assess -> warning -> human decision -> final status."""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.app.agents.transaction_graph import transaction_graph
from src.app.core.deps import get_current_user
from src.app.core.security import decode_recipient_lookup_token
from src.app.db.session import get_db
from src.app.models.risk_assessment import (
    RiskLevel,
    RiskSignal,
    TransactionRiskAssessment,
    TransactionWarning,
    WarningDecision,
    WarningFeedback,
)
from src.app.models.transaction import Transaction, TransactionEnvironment, TransactionStatus
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.models.user import User
from src.app.schemas.risk import (
    AssessRequest,
    AssessResponse,
    DecisionRequest,
    DecisionResponse,
    RiskSignalOut,
    TransactionOut,
    TrustedRecipientCreate,
    WarningFeedbackCreate,
    WarningOut,
)
from src.app.services import risk_rules
from src.app.services.audit import add_audit_log
from src.app.services.bank_normalization import normalize_bank_name
from src.app.services.blacklist_policy import promote_blacklist_if_eligible

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _warning_content(level: str, explanation: str, recommendation: str) -> tuple[str, str]:
    if level == RiskLevel.HIGH:
        return "Cảnh báo rủi ro cao", recommendation
    return "Cần xác minh thêm", recommendation


def _normalize_request(payload: AssessRequest) -> AssessRequest:
    return payload.model_copy(
        update={"bank_code": normalize_bank_name(payload.bank_code)}
    )


def _verified_recipient_request(payload: AssessRequest, current_user: User) -> AssessRequest:
    """Use only the name that was returned by a recent recipient lookup."""
    payload = _normalize_request(payload)
    account_number = payload.payee_account.replace(" ", "").strip()
    if not payload.bank_code:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ngân hàng không hợp lệ")

    try:
        verified = decode_recipient_lookup_token(
            payload.recipient_lookup_token, user_id=str(current_user.id)
        )
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Thông tin người nhận chưa được xác thực hoặc đã hết hạn. Vui lòng tra cứu lại.",
        ) from None

    if verified["account_number"] != account_number or verified["bank_code"] != payload.bank_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Thông tin người nhận đã thay đổi. Vui lòng tra cứu lại.",
        )
    return payload.model_copy(
        update={"payee_account": account_number, "payee_name": verified["account_name"]}
    )


def _response_from_assessment(
    transaction: Transaction,
    assessment: TransactionRiskAssessment,
    signals: list[RiskSignal],
    warning: TransactionWarning | None,
) -> AssessResponse:
    return AssessResponse(
        transaction_id=transaction.id,
        assessment_id=assessment.id,
        risk_score=float(assessment.risk_score),
        risk_level=assessment.risk_level,
        signals=[
            RiskSignalOut(
                signal_type=signal.signal_type,
                severity=signal.severity,
                score=float(signal.score) if signal.score is not None else None,
                explanation=signal.explanation,
            )
            for signal in signals
        ],
        explanation=assessment.explanation,
        recommendation=(
            warning.message
            if warning is not None
            else risk_rules.recommendation(assessment.risk_level)
        ),
        should_warn=assessment.should_warn,
        warning=(
            WarningOut(
                id=warning.id,
                warning_level=warning.warning_level,
                title=warning.title,
                message=warning.message,
                transparency_reason=warning.transparency_reason,
                displayed_at=warning.displayed_at,
                countdown_seconds=warning.countdown_seconds,
            )
            if warning is not None
            else None
        ),
    )


def _persist_assessment(
    db: Session, transaction: Transaction, request: AssessRequest, current_user: User
) -> AssessResponse:
    started = time.perf_counter()
    transaction.transaction_status = TransactionStatus.RISK_CHECKING
    db.add(transaction)
    db.flush()

    graph_result = transaction_graph.invoke({"db": db, "user_id": current_user.id, "request": request})
    candidates = graph_result["signals"]
    score, level = graph_result["risk_score"], graph_result["risk_level"]
    explanation = graph_result["explanation"]
    should_warn = level in {RiskLevel.MEDIUM, RiskLevel.HIGH}

    assessment = TransactionRiskAssessment(
        transaction_id=transaction.id,
        risk_score=score,
        risk_level=level,
        should_warn=should_warn,
        rules_version=risk_rules.RULES_VERSION,
        blacklist_match_found=any(
            signal.signal_type == "blacklist_exact_match" for signal in candidates
        ),
        explanation=explanation,
        raw_result={
            "engine": "deterministic_rules",
            "signal_types": [signal.signal_type for signal in candidates],
            "agent": "langgraph",
            "llm_used": graph_result.get("llm_used", False),
            "prompt_injection_detected": graph_result.get("prompt_injection_detected", False),
        },
        latency_ms=round((time.perf_counter() - started) * 1000),
    )
    db.add(assessment)
    db.flush()

    persisted_signals: list[RiskSignal] = []
    for candidate in candidates:
        signal = RiskSignal(
            assessment_id=assessment.id,
            signal_type=candidate.signal_type,
            severity=candidate.severity,
            score=candidate.score,
            explanation=candidate.explanation,
            matched_blacklist_id=candidate.matched_blacklist_id,
            matched_pattern_id=candidate.matched_pattern_id,
            evidence=candidate.evidence,
        )
        db.add(signal)
        persisted_signals.append(signal)

    warning: TransactionWarning | None = None
    if should_warn:
        title, message = _warning_content(
            level, explanation, risk_rules.recommendation(level)
        )
        warning = TransactionWarning(
            transaction_id=transaction.id,
            assessment_id=assessment.id,
            warning_level=level,
            title=title,
            message=message,
            transparency_reason=explanation,
            displayed_at=_utcnow(),
            countdown_seconds=30,
        )
        db.add(warning)

    transaction.transaction_status = TransactionStatus.AWAITING_DECISION
    add_audit_log(
        db,
        action="transaction.assessed",
        actor_id=current_user.id,
        resource_type="transaction",
        resource_id=transaction.id,
        metadata={
            "assessment_id": str(assessment.id),
            "risk_level": level,
            "risk_score": score,
            "should_warn": should_warn,
        },
    )
    if warning is not None:
        add_audit_log(
            db,
            action="transaction.warning_created",
            actor_id=current_user.id,
            resource_type="transaction_warning",
            resource_id=warning.id,
            metadata={"transaction_id": str(transaction.id), "warning_level": level},
        )

    db.commit()
    # A single alert never blacklists an account. Promotion requires consensus.
    promote_blacklist_if_eligible(db, transaction.payee_account, transaction.bank_code, current_user.id)
    db.commit()
    db.refresh(assessment)
    if warning is not None:
        db.refresh(warning)
    for signal in persisted_signals:
        db.refresh(signal)
    return _response_from_assessment(transaction, assessment, persisted_signals, warning)


@router.post("/assess", response_model=AssessResponse, status_code=status.HTTP_201_CREATED)
def assess(
    payload: AssessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Create a sandbox transaction and store its first risk assessment."""
    payload = _verified_recipient_request(payload, current_user)
    transaction = Transaction(
        user_id=current_user.id,
        payee_account=payload.payee_account.replace(" ", "").strip(),
        payee_name=payload.payee_name.strip(),
        bank_code=payload.bank_code.strip() if payload.bank_code else None,
        amount=payload.amount,
        note=payload.note.strip() if payload.note else None,
        currency=payload.currency.upper(),
        environment=TransactionEnvironment.SANDBOX,
    )
    return _persist_assessment(db, transaction, payload, current_user)


@router.post("/{transaction_id}/reassess", response_model=AssessResponse)
def reassess(
    transaction_id: uuid.UUID,
    payload: AssessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Append a new assessment when rules/model inputs need to be re-evaluated."""
    payload = _verified_recipient_request(payload, current_user)
    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch")
    if transaction.transaction_status not in {
        TransactionStatus.DRAFT,
        TransactionStatus.AWAITING_DECISION,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ có thể đánh giá lại giao dịch đang chờ quyết định",
        )

    transaction.payee_account = payload.payee_account.replace(" ", "").strip()
    transaction.payee_name = payload.payee_name.strip()
    transaction.bank_code = payload.bank_code.strip() if payload.bank_code else None
    transaction.amount = payload.amount
    transaction.note = payload.note.strip() if payload.note else None
    transaction.currency = payload.currency.upper()
    return _persist_assessment(db, transaction, payload, current_user)


@router.post("/{transaction_id}/decision", response_model=DecisionResponse)
def submit_decision(
    transaction_id: uuid.UUID,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DecisionResponse:
    """Record the human decision; the server enforces warning countdowns."""
    transaction = db.scalar(
        select(Transaction)
        .where(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .with_for_update()
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch")
    if transaction.transaction_status != TransactionStatus.AWAITING_DECISION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Giao dịch này đã được xử lý hoặc không còn chờ quyết định",
        )

    warning = db.scalar(
        select(TransactionWarning)
        .where(TransactionWarning.transaction_id == transaction.id)
        .order_by(desc(TransactionWarning.displayed_at))
        .limit(1)
    )
    now = _utcnow()

    if warning is not None:
        if payload.decision == WarningDecision.PROCEEDED:
            available_at = warning.displayed_at + timedelta(seconds=warning.countdown_seconds)
            if now < available_at:
                remaining = max(1, int((available_at - now).total_seconds()))
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Vui lòng chờ hết thời gian cảnh báo ({remaining} giây)",
                )
            if payload.verification_confirmed is not True:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Bạn cần xác nhận đã kiểm tra lại thông tin trước khi tiếp tục",
                )
        warning.user_decision = payload.decision
        warning.verification_confirmed = payload.verification_confirmed
        warning.verification_method = payload.verification_method
        warning.decided_at = now

    if payload.decision == WarningDecision.CANCELLED:
        transaction.transaction_status = TransactionStatus.CANCELLED
        transaction.cancelled_at = now
        action = "transaction.cancelled"
    else:
        locked_user = db.scalar(
            select(User).where(User.id == current_user.id).with_for_update()
        )
        if locked_user is None or locked_user.balance < transaction.amount:
            transaction.transaction_status = TransactionStatus.FAILED
            add_audit_log(
                db,
                action="transaction.failed_insufficient_balance",
                actor_id=current_user.id,
                resource_type="transaction",
                resource_id=transaction.id,
                metadata={"amount": transaction.amount},
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Số dư không đủ")
        transaction.transaction_status = TransactionStatus.PROCESSING
        locked_user.balance -= transaction.amount
        transaction.transaction_status = TransactionStatus.COMPLETED
        transaction.completed_at = now
        action = "transaction.proceeded"

    if warning is not None:
        # Lưu dấu vết HITL riêng, không đưa câu trả lời vào audit log/front-end logs.
        from src.app.models.intervention_log import InterventionLog

        db.add(
            InterventionLog(
                transaction_id=transaction.id,
                warning_id=warning.id,
                node_name="user_decision",
                user_response="\n".join(payload.verification_answers) or None,
                suggested_actions=risk_rules.verification_questions(warning.warning_level),
            )
        )

    add_audit_log(
        db,
        action=action,
        actor_id=current_user.id,
        resource_type="transaction",
        resource_id=transaction.id,
        metadata={
            "warning_id": str(warning.id) if warning is not None else None,
            "decision": payload.decision,
        },
    )
    db.commit()
    return DecisionResponse(
        transaction_id=transaction.id,
        transaction_status=transaction.transaction_status,
        warning_id=warning.id if warning is not None else None,
        decided_at=now,
    )


@router.get("/history", response_model=list[TransactionOut])
def history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Transaction]:
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.created_at))
        .limit(min(max(limit, 1), 100))
    ).all()
    return list(rows)


@router.post("/trusted-recipients", status_code=status.HTTP_201_CREATED)
def mark_trusted_recipient(
    payload: TrustedRecipientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    account_number = payload.account_number.replace(" ", "").strip()
    bank_code = normalize_bank_name(payload.bank_code)
    existing = db.scalar(
        select(TrustedRecipient).where(
            TrustedRecipient.user_id == current_user.id,
            TrustedRecipient.account_number == account_number,
            TrustedRecipient.bank_code == bank_code,
        )
    )
    if existing is not None:
        return {"status": "already_trusted", "recipient_id": str(existing.id)}

    recipient = TrustedRecipient(
        user_id=current_user.id,
        account_number=account_number,
        recipient_name=payload.recipient_name.strip(),
        bank_code=bank_code,
        trusted_at=_utcnow(),
    )
    db.add(recipient)
    add_audit_log(
        db,
        action="trusted_recipient.created",
        actor_id=current_user.id,
        resource_type="trusted_recipient",
        resource_id=recipient.id,
    )
    db.commit()
    return {"status": "trusted", "recipient_id": str(recipient.id)}


@router.post("/warnings/{warning_id}/feedback", status_code=status.HTTP_201_CREATED)
def create_warning_feedback(
    warning_id: uuid.UUID,
    payload: WarningFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    warning = db.scalar(
        select(TransactionWarning)
        .join(Transaction)
        .where(TransactionWarning.id == warning_id, Transaction.user_id == current_user.id)
    )
    if warning is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cảnh báo")
    if warning.feedback is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cảnh báo đã có phản hồi")

    feedback = WarningFeedback(
        warning_id=warning.id,
        user_id=current_user.id,
        feedback_type=payload.feedback_type,
        comment=payload.comment,
    )
    db.add(feedback)
    db.flush()
    promote_blacklist_if_eligible(db, warning.transaction.payee_account, warning.transaction.bank_code, current_user.id)
    add_audit_log(
        db,
        action="transaction_warning.feedback_created",
        actor_id=current_user.id,
        resource_type="transaction_warning",
        resource_id=warning.id,
        metadata={"feedback_type": payload.feedback_type},
    )
    db.commit()
    return {"status": "created", "feedback_id": str(feedback.id)}

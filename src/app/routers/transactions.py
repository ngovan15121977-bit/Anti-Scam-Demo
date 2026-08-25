from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.security import get_current_user
from ..database import get_db
from ..models import AuditLog, Transaction, User
from ..schemas import (
    InterventionResponse,
    RiskAnalysis,
    TransactionCreate,
    TransactionDecision,
    TransactionResponse,
)
from ..services.email_service import send_security_email, send_transaction_email
from ..services.llm_agent import InterventionAgent
from ..services.risk_engine import RiskEngine

router = APIRouter(prefix="/api/v1/transactions", tags=["Transactions"])


def log_audit(
    db: Session,
    resource_type: str,
    resource_id: Any,
    action: str,
    before: Any,
    after: Any,
    actor_id: Any,
) -> None:
    """Placeholder — thay bằng service audit thật nếu đã có."""
    try:
        pass
    except Exception:
        pass


def _apply_risk_manager_overlay(
    *,
    user_id: Any,
    tx_id: Any,
    final_score: float,
    level: str,
    reason: str,
    matched_blacklist: list | None = None,
    matched_patterns: list | None = None,
) -> tuple[float, str, str]:
    """
    Gọi Bank Risk Manager (flag-gated).
    Trả về (score, level, reason). Lỗi / flag off → giữ nguyên input.
    """
    try:
        from src.app.services.risk_manager.integration import (
            maybe_apply_manager_to_transaction,
        )

        signals: list[str] = []
        if matched_blacklist:
            signals.append("blacklist_exact_match")
        for p in matched_patterns or []:
            name = p.get("name") if isinstance(p, dict) else str(p)
            if name:
                signals.append(f"pattern:{name}")

        score, new_level, new_reason = maybe_apply_manager_to_transaction(
            score=float(final_score),
            level=str(level or "low"),
            explanation=str(reason or ""),
            signal_types=signals,
            requires_hitl=str(level).lower() in ("medium", "high", "critical"),
            user_id_hash=str(user_id),
            session_key=str(tx_id) if tx_id else str(user_id),
        )
        return float(score), str(new_level), str(new_reason)
    except Exception as exc:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).warning(
            "Manager overlay skipped (legacy analyze): %s", exc
        )
        return float(final_score), str(level), str(reason or "")


@router.post("/analyze", response_model=TransactionResponse)
async def analyze_transaction(
    tx_data: TransactionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 1: Phân tích rủi ro trước khi tạo giao dịch.
    Không thực hiện chuyển tiền, chỉ trả về đánh giá rủi ro.
    """
    risk_engine = RiskEngine(db)

    risk_result = await risk_engine.calculate_risk(
        user_id=current_user.id,
        recipient_account=tx_data.recipient_account,
        recipient_bank=tx_data.recipient_bank,
        amount=tx_data.amount,
        description=tx_data.description,
    )

    # --- Bank Risk Manager overlay (Phase 2/3) ---
    final_score = float(risk_result.final_score)
    level = str(risk_result.level)
    reason = str(risk_result.reason or "")
    final_score, level, reason = _apply_risk_manager_overlay(
        user_id=current_user.id,
        tx_id=None,
        final_score=final_score,
        level=level,
        reason=reason,
        matched_blacklist=getattr(risk_result, "matched_blacklist", None),
        matched_patterns=getattr(risk_result, "matched_patterns", None),
    )
    # đồng bộ lại object để response/mail dùng cùng số liệu
    risk_result.final_score = final_score
    risk_result.level = level
    risk_result.reason = reason

    transaction = Transaction(
        user_id=current_user.id,
        **tx_data.model_dump(),
        ml_risk_score=risk_result.ml_score,
        rule_risk_score=risk_result.rule_score,
        final_risk_score=final_score,
        risk_level=level,
        agent_warning_shown=level in ["medium", "high", "critical"],
        warning_reason=reason,
        status="pending",
        user_decision="pending",
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    # Gọi lại Manager với session_key = transaction.id (memory theo GD)
    final_score, level, reason = _apply_risk_manager_overlay(
        user_id=current_user.id,
        tx_id=transaction.id,
        final_score=final_score,
        level=level,
        reason=reason,
        matched_blacklist=getattr(risk_result, "matched_blacklist", None),
        matched_patterns=getattr(risk_result, "matched_patterns", None),
    )
    if reason != transaction.warning_reason or level != transaction.risk_level:
        transaction.final_risk_score = final_score
        transaction.risk_level = level
        transaction.warning_reason = reason
        transaction.agent_warning_shown = level in ["medium", "high", "critical"]
        db.commit()
        db.refresh(transaction)

    background_tasks.add_task(
        log_audit,
        db,
        "transactions",
        transaction.id,
        "INSERT",
        None,
        {"status": "pending", "risk_level": level},
        current_user.id,
    )

    if level in ("high", "critical") and getattr(current_user, "email", None):
        background_tasks.add_task(
            send_security_email,
            to=current_user.email,
            full_name=getattr(current_user, "full_name", None) or "Bạn",
            title="Cảnh báo giao dịch rủi ro cao",
            message=(
                f"Giao dịch {transaction.id} được đánh giá mức {level}. "
                f"{reason or 'Hệ thống phát hiện tín hiệu bất thường.'} "
                "Vui lòng kiểm tra kỹ trước khi xác nhận."
            ),
        )

    response = TransactionResponse.model_validate(transaction)
    response.risk_analysis = RiskAnalysis(
        ml_risk_score=float(risk_result.ml_score) if risk_result.ml_score else None,
        rule_risk_score=float(risk_result.rule_score) if risk_result.rule_score else None,
        final_risk_score=float(final_score),
        risk_level=level,
        warning_reason=reason,
        matched_blacklist=getattr(risk_result, "matched_blacklist", None),
        matched_patterns=getattr(risk_result, "matched_patterns", None),
    )

    return response


@router.post("/{tx_id}/decide", response_model=TransactionResponse)
async def make_decision(
    tx_id: UUID,
    decision: TransactionDecision,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 2: Người dùng quyết định sau khi xem cảnh báo (HITL).
    Agent chỉ cảnh báo, KHÔNG tự động chặn.
    """
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == current_user.id)
        .first()
    )

    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")

    if tx.user_decision != "pending":
        raise HTTPException(status_code=400, detail="Giao dịch đã được xử lý")

    tx.user_decision = decision.decision
    tx.user_decision_at = datetime.utcnow()

    if decision.decision == "confirmed":
        tx.status = "processing"
    elif decision.decision == "cancelled":
        tx.status = "rejected"
    elif decision.decision == "escalated":
        tx.status = "flagged"

    db.commit()
    db.refresh(tx)

    # Ghi HITL feedback cho Manager (Phase 3) — không đổi quyền quyết định của user
    try:
        from src.app.services.risk_manager.phase3.feedback import record_hitl_feedback

        human_action = {
            "confirmed": "CONTINUE",
            "cancelled": "STOP",
            "escalated": "PAUSE",
        }.get(decision.decision, decision.decision)
        record_hitl_feedback(
            user_id_hash=str(current_user.id),
            session_key=str(tx.id),
            manager_action="PAUSE",  # analyze đã cảnh báo; có thể tinh chỉnh nếu lưu action Manager
            manager_confidence=0.7,
            human_action=human_action,
            note=f"user_decision={decision.decision}",
        )
    except Exception:
        pass

    user_email = getattr(current_user, "email", None)
    full_name = getattr(current_user, "full_name", None) or "Bạn"
    payee = (
        getattr(tx, "payee_name", None)
        or getattr(tx, "recipient_name", None)
        or getattr(tx, "recipient_account", None)
        or "người nhận"
    )
    amount = int(getattr(tx, "amount", 0) or 0)

    if user_email:
        if decision.decision == "confirmed":
            background_tasks.add_task(
                send_transaction_email,
                to=user_email,
                full_name=full_name,
                amount=amount,
                counterparty=str(payee),
                direction="out",
                status=tx.status,
            )
        elif decision.decision == "cancelled":
            background_tasks.add_task(
                send_security_email,
                to=user_email,
                full_name=full_name,
                title="Bạn đã hủy giao dịch để an toàn",
                message=(
                    f"Giao dịch {tx.id} tới {payee} "
                    f"({amount:,} đ) đã được hủy theo lựa chọn của bạn."
                ),
            )

    return TransactionResponse.model_validate(tx)


@router.post("/{tx_id}/intervene", response_model=InterventionResponse)
async def intervention_step(
    tx_id: UUID,
    user_response: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 3: Luồng can thiệp đa bước (LangGraph) nếu rủi ro cao.
    HITL: Dừng lại chờ người dùng phản hồi từng bước.
    """
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == current_user.id)
        .first()
    )

    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")

    if tx.risk_level not in ["high", "critical"]:
        raise HTTPException(status_code=400, detail="Giao dịch không cần can thiệp")

    agent = InterventionAgent(db)
    result = await agent.process_step(tx_id, user_response)

    return result
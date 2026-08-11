from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from uuid import UUID

from ..database import get_db
from ..models import Transaction, User, AuditLog
from ..schemas import TransactionCreate, TransactionResponse, TransactionDecision, RiskAnalysis, InterventionResponse
from ..core.security import get_current_user
from ..services.risk_engine import RiskEngine
from ..services.llm_agent import InterventionAgent

router = APIRouter(prefix="/api/v1/transactions", tags=["Transactions"])

@router.post("/analyze", response_model=TransactionResponse)
async def analyze_transaction(
    tx_data: TransactionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bước 1: Phân tích rủi ro trước khi tạo giao dịch.
    Không thực hiện chuyển tiền, chỉ trả về đánh giá rủi ro.
    """
    # Khởi tạo engine
    risk_engine = RiskEngine(db)
    
    # Tính điểm rủi ro (ML + Rule-based + Blacklist)
    risk_result = await risk_engine.calculate_risk(
        user_id=current_user.id,
        recipient_account=tx_data.recipient_account,
        recipient_bank=tx_data.recipient_bank,
        amount=tx_data.amount,
        description=tx_data.description
    )
    
    # Tạo transaction record với trạng thái pending
    transaction = Transaction(
        user_id=current_user.id,
        **tx_data.model_dump(),
        ml_risk_score=risk_result.ml_score,
        rule_risk_score=risk_result.rule_score,
        final_risk_score=risk_result.final_score,
        risk_level=risk_result.level,
        agent_warning_shown=risk_result.level in ["medium", "high", "critical"],
        warning_reason=risk_result.reason,
        status="pending",
        user_decision="pending"
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    # Audit log
    background_tasks.add_task(
        log_audit, db, "transactions", transaction.id, 
        "INSERT", None, {"status": "pending", "risk_level": risk_result.level},
        current_user.id
    )
    
    # Build response với risk analysis
    response = TransactionResponse.model_validate(transaction)
    response.risk_analysis = RiskAnalysis(
        ml_risk_score=float(risk_result.ml_score) if risk_result.ml_score else None,
        rule_risk_score=float(risk_result.rule_score) if risk_result.rule_score else None,
        final_risk_score=float(risk_result.final_score),
        risk_level=risk_result.level,
        warning_reason=risk_result.reason,
        matched_blacklist=risk_result.matched_blacklist,
        matched_patterns=risk_result.matched_patterns
    )
    
    return response

@router.post("/{tx_id}/decide", response_model=TransactionResponse)
async def make_decision(
    tx_id: UUID,
    decision: TransactionDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bước 2: Người dùng quyết định sau khi xem cảnh báo (HITL).
    Agent chỉ cảnh báo, KHÔNG tự động chặn.
    """
    tx = db.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")
    
    if tx.user_decision != "pending":
        raise HTTPException(status_code=400, detail="Giao dịch đã được xử lý")
    
    # Cập nhật quyết định của người dùng
    tx.user_decision = decision.decision
    tx.user_decision_at = datetime.utcnow()
    
    if decision.decision == "confirmed":
        # Người dùng chấp nhận rủi ro -> chuyển sang processing
        tx.status = "processing"
    elif decision.decision == "cancelled":
        tx.status = "rejected"
    elif decision.decision == "escalated":
        tx.status = "flagged"
    
    db.commit()
    db.refresh(tx)
    
    return TransactionResponse.model_validate(tx)

@router.post("/{tx_id}/intervene", response_model=InterventionResponse)
async def intervention_step(
    tx_id: UUID,
    user_response: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bước 3: Luồng can thiệp đa bước (LangGraph) nếu rủi ro cao.
    HITL: Dừng lại chờ người dùng phản hồi từng bước.
    """
    tx = db.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")
    
    if tx.risk_level not in ["high", "critical"]:
        raise HTTPException(status_code=400, detail="Giao dịch không cần can thiệp")
    
    agent = InterventionAgent(db)
    result = await agent.process_step(tx_id, user_response)
    
    return result
"""Minimal admin APIs backed by the same fraud-intelligence schema."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from src.app.core.deps import require_admin
from src.app.db.session import get_db
from src.app.models.blacklist import Blacklist
from src.app.models.risk_assessment import RiskLevel, TransactionRiskAssessment, TransactionWarning, WarningDecision
from src.app.models.scam_pattern import ScamPattern
from src.app.models.scam_report import ScamReport
from src.app.models.transaction import Transaction
from src.app.models.audit_log import AuditLog
from src.app.models.user import User
from src.app.schemas.admin import AdminTransactionOut, AuditLogOut, BlacklistCreate, BlacklistOut, ScamPatternCreate, ScamPatternOut, StatsOut
from src.app.schemas.scam import ScamReportOut, ScamReportReview
from src.app.services.audit import add_audit_log

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/blacklist", response_model=list[BlacklistOut])
def list_blacklist(db: Session = Depends(get_db)) -> list[Blacklist]:
    return list(db.scalars(select(Blacklist).order_by(Blacklist.created_at.desc())).all())


@router.post("/blacklist", response_model=BlacklistOut, status_code=status.HTTP_201_CREATED)
def add_blacklist(
    payload: BlacklistCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> Blacklist:
    existing = db.scalar(
        select(Blacklist).where(
            Blacklist.entity_type == payload.entity_type,
            Blacklist.entity_value == payload.entity_value,
            Blacklist.bank == payload.bank,
            Blacklist.is_active.is_(True),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bản ghi blacklist đã tồn tại")

    entry = Blacklist(**payload.model_dump())
    db.add(entry)
    db.flush()
    add_audit_log(
        db,
        action="blacklist.created",
        actor_id=admin.id,
        resource_type="blacklist",
        resource_id=entry.id,
        metadata={"entity_type": entry.entity_type, "source": entry.source},
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/blacklist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_blacklist(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> None:
    entry = db.get(Blacklist, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bản ghi")
    entry.is_active = False
    add_audit_log(
        db,
        action="blacklist.deactivated",
        actor_id=admin.id,
        resource_type="blacklist",
        resource_id=entry.id,
    )
    db.commit()


@router.get("/scam-patterns", response_model=list[ScamPatternOut])
def list_scam_patterns(db: Session = Depends(get_db)) -> list[ScamPattern]:
    return list(db.scalars(select(ScamPattern).order_by(ScamPattern.created_at.desc())).all())


@router.post("/scam-patterns", response_model=ScamPatternOut, status_code=status.HTTP_201_CREATED)
def add_scam_pattern(
    payload: ScamPatternCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> ScamPattern:
    existing = db.scalar(select(ScamPattern).where(ScamPattern.pattern_name == payload.pattern_name))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên pattern đã tồn tại")
    pattern = ScamPattern(**payload.model_dump())
    db.add(pattern)
    db.flush()
    add_audit_log(
        db,
        action="scam_pattern.created",
        actor_id=admin.id,
        resource_type="scam_pattern",
        resource_id=pattern.id,
        metadata={"pattern_name": pattern.pattern_name},
    )
    db.commit()
    db.refresh(pattern)
    return pattern


@router.get("/scam-reports", response_model=list[ScamReportOut])
def list_scam_reports(db: Session = Depends(get_db)) -> list[ScamReport]:
    return list(db.scalars(select(ScamReport).order_by(ScamReport.created_at.desc())).all())


@router.patch("/scam-reports/{report_id}", response_model=ScamReportOut)
def review_scam_report(
    report_id: uuid.UUID,
    payload: ScamReportReview,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> ScamReport:
    report = db.get(ScamReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scam report not found")
    report.status = payload.status
    report.admin_note = payload.admin_note
    add_audit_log(db, action="scam_report.reviewed", actor_id=admin.id,
                  resource_type="scam_report", resource_id=report.id,
                  metadata={"status": payload.status})
    db.commit()
    db.refresh(report)
    return report


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    by_level_rows = db.execute(
        select(TransactionRiskAssessment.risk_level, func.count())
        .group_by(TransactionRiskAssessment.risk_level)
    ).all()
    by_level = {level: count for level, count in by_level_rows}
    high_risk = by_level.get(RiskLevel.HIGH, 0)
    high_risk_cancelled = db.scalar(
        select(func.count())
        .select_from(TransactionWarning)
        .join(TransactionRiskAssessment)
        .where(
            TransactionRiskAssessment.risk_level == RiskLevel.HIGH,
            TransactionWarning.user_decision == WarningDecision.CANCELLED,
        )
    ) or 0
    return StatsOut(
        total_transactions=db.scalar(select(func.count()).select_from(Transaction)) or 0,
        by_risk_level={
            RiskLevel.SAFE: by_level.get(RiskLevel.SAFE, 0),
            RiskLevel.LOW: by_level.get(RiskLevel.LOW, 0),
            RiskLevel.MEDIUM: by_level.get(RiskLevel.MEDIUM, 0),
            RiskLevel.HIGH: high_risk,
        },
        high_risk_count=high_risk,
        high_risk_cancelled=high_risk_cancelled,
        recommendation_compliance_rate=(
            round(high_risk_cancelled / high_risk, 4) if high_risk else None
        ),
        blacklist_size=db.scalar(select(func.count()).select_from(Blacklist)) or 0,
        pattern_count=db.scalar(select(func.count()).select_from(ScamPattern)) or 0,
    )


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    action: str | None = Query(default=None, max_length=100),
    resource_type: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    """Return masked audit metadata for the admin audit dashboard."""
    statement = select(AuditLog)
    if action:
        statement = statement.where(AuditLog.action == action)
    if resource_type:
        statement = statement.where(AuditLog.resource_type == resource_type)
    statement = statement.order_by(AuditLog.created_at.desc()).limit(limit)
    return list(db.scalars(statement).all())


@router.get("/transactions", response_model=list[AdminTransactionOut])
def list_transactions(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return real transactions with their latest risk assessment for admin views."""
    latest_assessment = (
        select(
            TransactionRiskAssessment.transaction_id,
            func.max(TransactionRiskAssessment.created_at).label("latest_created_at"),
        )
        .group_by(TransactionRiskAssessment.transaction_id)
        .subquery()
    )
    rows = db.execute(
        select(Transaction, User.full_name, TransactionRiskAssessment.risk_level)
        .join(User, Transaction.user_id == User.id)
        .outerjoin(latest_assessment, latest_assessment.c.transaction_id == Transaction.id)
        .outerjoin(
            TransactionRiskAssessment,
            and_(
                TransactionRiskAssessment.transaction_id == Transaction.id,
                TransactionRiskAssessment.created_at == latest_assessment.c.latest_created_at,
            ),
        )
        .order_by(Transaction.created_at.desc())
        .limit(limit)
    ).all()
    result = []
    for transaction, user_name, risk_level in rows:
        result.append({
            "id": transaction.id,
            "user_id": transaction.user_id,
            "user_name": user_name,
            "payee_account": transaction.payee_account,
            "payee_name": transaction.payee_name,
            "bank_code": transaction.bank_code,
            "amount": transaction.amount,
            "transaction_status": transaction.transaction_status,
            "risk_level": risk_level,
            "created_at": transaction.created_at,
        })
    return result

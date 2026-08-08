"""Minimal admin APIs backed by the same fraud-intelligence schema."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.blacklist import Blacklist
from app.models.risk_assessment import RiskLevel, TransactionRiskAssessment, TransactionWarning, WarningDecision
from app.models.scam_pattern import ScamPattern
from app.models.transaction import Transaction
from app.schemas.admin import BlacklistCreate, BlacklistOut, ScamPatternCreate, ScamPatternOut, StatsOut
from app.services.audit import add_audit_log

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

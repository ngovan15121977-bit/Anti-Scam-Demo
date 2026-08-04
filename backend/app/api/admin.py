"""Dashboard admin: quản lý blacklist, kịch bản scam, xem thống kê.

Mọi route ở đây yêu cầu vai trò admin (require_admin ở cấp router).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.blacklist import BlacklistEntry
from app.models.scam_scenario import ScamScenario
from app.models.transaction import RiskLevel, Transaction, UserDecision
from app.schemas.admin import (
    BlacklistCreate,
    BlacklistOut,
    ScamScenarioCreate,
    ScamScenarioOut,
    StatsOut,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------------- Blacklist ----------------


@router.get("/blacklist", response_model=list[BlacklistOut])
def list_blacklist(db: Session = Depends(get_db)) -> list[BlacklistEntry]:
    rows = db.scalars(
        select(BlacklistEntry).order_by(BlacklistEntry.created_at.desc())
    ).all()
    return list(rows)


@router.post(
    "/blacklist", response_model=BlacklistOut, status_code=status.HTTP_201_CREATED
)
def add_blacklist(
    payload: BlacklistCreate, db: Session = Depends(get_db)
) -> BlacklistEntry:
    existing = db.scalar(
        select(BlacklistEntry).where(
            BlacklistEntry.account_number == payload.account_number
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Số tài khoản đã có trong blacklist",
        )

    entry = BlacklistEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/blacklist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_blacklist(entry_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    entry = db.get(BlacklistEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bản ghi"
        )
    db.delete(entry)
    db.commit()


# ---------------- Kịch bản lừa đảo ----------------


@router.get("/scenarios", response_model=list[ScamScenarioOut])
def list_scenarios(db: Session = Depends(get_db)) -> list[ScamScenario]:
    rows = db.scalars(select(ScamScenario).order_by(ScamScenario.created_at.desc())).all()
    return list(rows)


@router.post(
    "/scenarios", response_model=ScamScenarioOut, status_code=status.HTTP_201_CREATED
)
def add_scenario(
    payload: ScamScenarioCreate, db: Session = Depends(get_db)
) -> ScamScenario:
    """Thêm kịch bản mới. Hệ thống nhận diện ngay, không cần deploy lại (AC #4).

    TODO(sprint-2): gọi embedding service để sinh `embedding` tại đây. Hiện để
    NULL — hàm tìm kiếm RAG sẽ bỏ qua row chưa có embedding.
    """
    scenario = ScamScenario(**payload.model_dump())
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_scenario(scenario_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    scenario = db.get(ScamScenario, scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy kịch bản"
        )
    db.delete(scenario)
    db.commit()


# ---------------- Thống kê ----------------


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    """Số cảnh báo theo mức độ + tỷ lệ người dùng tuân theo khuyến nghị (5.5)."""
    by_level_rows = db.execute(
        select(Transaction.risk_level, func.count()).group_by(Transaction.risk_level)
    ).all()
    by_level = {level.value: count for level, count in by_level_rows}

    total = sum(by_level.values())

    # "Tuân theo khuyến nghị" = giao dịch rủi ro cao và người dùng đã hủy.
    high_risk = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.risk_level == RiskLevel.HIGH)
    )
    high_risk_cancelled = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.risk_level == RiskLevel.HIGH,
            Transaction.user_decision == UserDecision.CANCELLED,
        )
    )

    compliance = round(high_risk_cancelled / high_risk, 4) if high_risk else None

    return StatsOut(
        total_transactions=total,
        by_risk_level={
            "low": by_level.get("low", 0),
            "medium": by_level.get("medium", 0),
            "high": by_level.get("high", 0),
        },
        high_risk_count=high_risk or 0,
        high_risk_cancelled=high_risk_cancelled or 0,
        recommendation_compliance_rate=compliance,
        blacklist_size=db.scalar(select(func.count()).select_from(BlacklistEntry)) or 0,
        scenario_count=db.scalar(select(func.count()).select_from(ScamScenario)) or 0,
    )

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------- Blacklist ----------------


class BlacklistCreate(BaseModel):
    account_number: str = Field(..., min_length=4, max_length=64)
    account_name: str | None = Field(default=None, max_length=255)
    bank_code: str | None = Field(default=None, max_length=32)
    reason: str = Field(..., min_length=1, max_length=1000)
    source: str | None = Field(default=None, max_length=128)
    report_count: int = Field(default=1, ge=1)


class BlacklistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_number: str
    account_name: str | None
    bank_code: str | None
    reason: str
    source: str | None
    report_count: int
    created_at: datetime


# ---------------- Kịch bản lừa đảo ----------------


class ScamScenarioCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=10_000)
    category: str = Field(..., min_length=1, max_length=64)
    source: str | None = Field(default=None, max_length=255)


class ScamScenarioOut(BaseModel):
    """Không expose cột `embedding` — vector 1536 chiều vô ích với client."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    category: str
    source: str | None
    created_at: datetime


# ---------------- Thống kê ----------------


class StatsOut(BaseModel):
    total_transactions: int
    by_risk_level: dict[str, int]
    high_risk_count: int
    high_risk_cancelled: int

    # None khi chưa có giao dịch rủi ro cao nào để tính tỷ lệ.
    recommendation_compliance_rate: float | None
    blacklist_size: int
    scenario_count: int

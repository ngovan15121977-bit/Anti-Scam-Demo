from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UserDecision(str, enum.Enum):
    """Quyết định cuối cùng luôn thuộc về người dùng (HITL bắt buộc)."""

    PENDING = "pending"
    PROCEEDED = "proceeded"
    CANCELLED = "cancelled"


class Transaction(Base, TimestampMixin):
    """Một giao dịch chuyển tiền mô phỏng cùng kết quả đánh giá rủi ro.

    Bảng này đồng thời là audit log phục vụ accountability: lưu lại điểm rủi ro,
    lý do cảnh báo, hội thoại xác minh và quyết định cuối của người dùng.
    """

    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    # ---- Thông tin giao dịch ----
    payee_account: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    payee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # VND
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Kết quả đánh giá ----
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0-100
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, name="risk_level", values_callable=lambda e: [m.value for m in e]),
        default=RiskLevel.LOW,
        nullable=False,
    )

    # Các tín hiệu rule/ML đã kích hoạt — nguồn để LLM giải thích, tránh hộp đen.
    risk_signals: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Log hội thoại xác minh HITL: [{"role": "agent"|"user", "content": ...}]
    verification_log: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    user_decision: Mapped[UserDecision] = mapped_column(
        Enum(
            UserDecision,
            name="user_decision",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=UserDecision.PENDING,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", lazy="joined")

    def __repr__(self) -> str:
        return f"<Transaction {self.amount} -> {self.payee_account} risk={self.risk_level.value}>"

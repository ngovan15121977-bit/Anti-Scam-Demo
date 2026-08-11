import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, CheckConstraint, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.compliance import UserConsent
    from src.app.models.risk_assessment import WarningFeedback
    from src.app.models.scam_report import ScamReport
    from src.app.models.transaction import Transaction
    from src.app.models.trusted_recipient import TrustedRecipient


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.USER.value, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    balance: Mapped[int] = mapped_column(BigInteger, default=50_000_000, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    trusted_recipients: Mapped[list["TrustedRecipient"]] = relationship(back_populates="user")
    consents: Mapped[list["UserConsent"]] = relationship(back_populates="user")
    warning_feedback: Mapped[list["WarningFeedback"]] = relationship(
        back_populates="user", foreign_keys="WarningFeedback.user_id"
    )
    scam_reports: Mapped[list["ScamReport"]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role}>"

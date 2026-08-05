import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class BlacklistEntry(Base, TimestampMixin):
    """Người nhận bị đánh dấu lừa đảo. Admin/CSKH quản lý qua dashboard."""

    __tablename__ = "blacklist_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Số tài khoản / số ví của người nhận.
    account_number: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_code: Mapped[str | None] = mapped_column(String(32), nullable=True)

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # Nguồn dữ liệu: chongluadao.vn, NCSC, báo cáo nội bộ...
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Số lượt bị báo cáo, dùng làm tín hiệu tăng nặng khi tính risk score.
    report_count: Mapped[int] = mapped_column(default=1, nullable=False)

    def __repr__(self) -> str:
        return f"<BlacklistEntry {self.account_number}>"

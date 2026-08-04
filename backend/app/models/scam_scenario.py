import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.config import get_settings
from app.db.base import Base, TimestampMixin

settings = get_settings()


class ScamScenario(Base, TimestampMixin):
    """Kịch bản lừa đảo đã biết, dùng cho RAG khi giải thích cảnh báo.

    Admin thêm kịch bản mới qua dashboard; embedding được sinh ngay lúc ghi
    nên hệ thống nhận diện được mà không cần deploy lại (yêu cầu 5.5 / AC #4).
    """

    __tablename__ = "scam_scenarios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Ví dụ: "gia_mao_nguoi_quen", "gia_danh_co_quan", "link_gia", "dau_tu_ao".
    category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Vector embedding của `content`. NULL nghĩa là chưa embed (chưa có API key).
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(settings.embedding_dim), nullable=True
    )

    __table_args__ = (
        # HNSW cho tìm kiếm cosine. Bỏ qua nếu dataset nhỏ, Postgres vẫn seq scan tốt.
        Index(
            "ix_scam_scenarios_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def __repr__(self) -> str:
        return f"<ScamScenario {self.title!r} category={self.category}>"

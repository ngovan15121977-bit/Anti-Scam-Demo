"""Engine, session factory và dependency get_db()."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.base import Base

logger = logging.getLogger(__name__)
settings = get_settings()

# pool_pre_ping: tự phát hiện connection đã chết (hay gặp khi Postgres restart trong Docker).
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.log_level == "DEBUG",
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: mở session cho mỗi request, đảm bảo đóng sau khi xong."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Bật extension pgvector rồi tạo bảng.

    Chỉ dùng cho dev/demo. Production dùng `alembic upgrade head`.
    """
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Import để mọi model được đăng ký vào Base.metadata trước khi create_all.
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    logger.info("Database đã sẵn sàng (pgvector + tables)")

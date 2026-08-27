"""Persisted runtime overrides for the five specialist agents."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class AgentSetting(Base, TimestampMixin):
    """Key/value config bag per agent_id (guardian, stt, manager, chat, navigator)."""

    __tablename__ = "agent_settings"
    __table_args__ = (
        UniqueConstraint("agent_id", name="uq_agent_settings_agent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # guardian | stt | manager | chat | navigator
    agent_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # Full public config snapshot (never stores raw API keys)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Optional free-text note from admin
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

"""add agent_settings table for admin runtime config

Revision ID: aa1b2c3d4e5f
Revises: z3a4b5c6d7e8
Create Date: 2026-08-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from src.app.config import get_settings

revision: str = "aa1b2c3d4e5f"
down_revision: str | Sequence[str] | None = "z3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "agent_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=32), nullable=False),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_id", name="uq_agent_settings_agent_id"),
        schema=schema,
    )
    op.create_index(
        "ix_agent_settings_agent_id",
        "agent_settings",
        ["agent_id"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_agent_settings_agent_id", table_name="agent_settings", schema=schema)
    op.drop_table("agent_settings", schema=schema)

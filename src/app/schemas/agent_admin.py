"""Pydantic schemas for Admin → Agents management API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

AgentId = Literal["guardian", "stt", "manager", "chat", "navigator"]

AGENT_IDS: tuple[AgentId, ...] = ("guardian", "stt", "manager", "chat", "navigator")

AGENT_LABELS: dict[AgentId, str] = {
    "guardian": "Scam Guardian Risk Agent",
    "stt": "Guardian STT (Whisper)",
    "manager": "Bank Risk Manager",
    "chat": "Timi Assistant (Chat)",
    "navigator": "Task Navigator",
}


class GuardianConfig(BaseModel):
    enabled: bool = True
    model: str = "llama-3.1-8b-instant"
    prompt_version: str = "0.3"
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    max_completion_tokens: int = Field(default=900, ge=500, le=4000)
    min_interval_seconds: float = Field(default=6.0, ge=0.0, le=60.0)


class SttConfig(BaseModel):
    enabled: bool = True
    model: str = "whisper-large-v3"


class ManagerConfig(BaseModel):
    enabled: bool = True
    use_llm: bool = True
    phase3: bool = True
    prompt_version: str = "0.2"
    model: str = "openai/gpt-oss-20b"
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    max_completion_tokens: int = Field(default=1500, ge=500, le=4000)


class ChatConfig(BaseModel):
    enabled: bool = True
    model: str = "openai/gpt-oss-20b"
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_completion_tokens: int = Field(default=640, ge=128, le=1500)
    history_limit: int = Field(default=40, ge=1, le=100)
    context_exchanges: int = Field(default=3, ge=0, le=10)
    retention_days: int = Field(default=90, ge=1, le=365)
    cache_version: str = Field(default="v2", min_length=1, max_length=32)


class NavigatorConfig(BaseModel):
    enabled: bool = True
    model: str = "openai/gpt-oss-20b"
    max_completion_tokens: int = Field(default=120, ge=32, le=256)


class AgentCardOut(BaseModel):
    agent_id: AgentId
    label: str
    enabled: bool
    model: str | None = None
    prompt_version: str | None = None
    api_key_configured: bool = False
    updated_at: datetime | None = None
    note: str | None = None
    config: dict[str, Any]


class AgentsConfigOut(BaseModel):
    agents: list[AgentCardOut]
    prompt_versions: dict[str, list[str]] = Field(
        default_factory=lambda: {
            "guardian": ["0.1", "0.2", "0.3"],
            "manager": ["0.1", "0.2"],
        }
    )


class AgentUpdateIn(BaseModel):
    """Partial update — only fields present in the body are applied."""

    enabled: bool | None = None
    model: str | None = None
    prompt_version: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_completion_tokens: int | None = Field(default=None, ge=32, le=4000)
    min_interval_seconds: float | None = Field(default=None, ge=0.0, le=60.0)
    use_llm: bool | None = None
    phase3: bool | None = None
    history_limit: int | None = Field(default=None, ge=1, le=100)
    context_exchanges: int | None = Field(default=None, ge=0, le=10)
    retention_days: int | None = Field(default=None, ge=1, le=365)
    cache_version: str | None = Field(default=None, min_length=1, max_length=32)
    note: str | None = None

    @field_validator("model", "prompt_version", "cache_version")
    @classmethod
    def strip_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


class AgentUpdateOut(BaseModel):
    agent_id: AgentId
    label: str
    config: dict[str, Any]
    message: str = "Đã cập nhật cấu hình agent"


class PolicySettingsOut(BaseModel):
    """Legacy policy toggles kept under the same tab for convenience."""

    auto_block: bool = True
    ai_intervention: bool = True
    notify_admin: bool = True
    risk_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    daily_limit: int = Field(default=50_000_000, ge=1_000_000, le=500_000_000)


class PolicySettingsUpdate(BaseModel):
    auto_block: bool | None = None
    ai_intervention: bool | None = None
    notify_admin: bool | None = None
    risk_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    daily_limit: int | None = Field(default=None, ge=1_000_000, le=500_000_000)
